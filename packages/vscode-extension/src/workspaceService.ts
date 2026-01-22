import * as vscode from "vscode";
import * as path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AnalyzerAdapter } from "./analyzerAdapter";
import type { BlastRadiusReport, SourceFileInput, WorkspaceSnapshot } from "./types";

export class WorkspaceService implements vscode.Disposable {
  private adapter: AnalyzerAdapter;
  private readonly files = new Map<string, string>();
  private snapshotValue: WorkspaceSnapshot = { resources: [], reports: [], diagnostics: [] };
  private readonly changedEmitter = new vscode.EventEmitter<WorkspaceSnapshot>();
  private readonly disposables: vscode.Disposable[] = [];
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private operation = Promise.resolve();

  readonly onDidChange = this.changedEmitter.event;

  constructor(private readonly output: vscode.OutputChannel) {
    this.adapter = this.createAdapter();
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => this.onDocumentChanged(event.document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.onDocumentChanged(document)),
      vscode.workspace.onDidCreateFiles((event) => event.files.forEach((uri) => this.onUriChanged(uri))),
      vscode.workspace.onDidDeleteFiles((event) => event.files.forEach((uri) => this.onUriDeleted(uri))),
      vscode.workspace.onDidRenameFiles((event) => event.files.forEach(({ oldUri, newUri }) => {
        this.onUriDeleted(oldUri);
        this.onUriChanged(newUri);
      })),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("terraformBlastRadius.maxDepth")) {
          this.adapter = this.createAdapter();
          void this.refresh();
        }
      })
    );
  }

  get snapshot(): WorkspaceSnapshot {
    return this.snapshotValue;
  }

  async refresh(): Promise<void> {
    if (!this.enabled()) return;
    const uris = await vscode.workspace.findFiles("**/*.tf", "**/.terraform/**");
    const inputs = await Promise.all(uris.map((uri) => this.readUri(uri)));
    this.files.clear();
    for (const input of inputs) this.files.set(input.path, input.content);
    await this.enqueue(async () => {
      this.snapshotValue = await this.adapter.analyzeWorkspace(inputs);
      this.publish();
    });
  }

  async analyzeResource(address: string): Promise<BlastRadiusReport | undefined> {
    return this.adapter.analyzeResource(address, this.snapshotValue);
  }

  async analyzeChangedResources(): Promise<BlastRadiusReport[]> {
    return this.adapter.analyzeChangedResources(this.snapshotValue, await this.readHeadVersions());
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.changedEmitter.dispose();
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private onDocumentChanged(document: vscode.TextDocument): void {
    if (document.languageId !== "terraform" && !document.uri.fsPath.endsWith(".tf")) return;
    if (!this.autoRefresh() || document.uri.fsPath.split(/[\\/]/).includes(".terraform")) return;
    this.schedule(document.uri.fsPath, async () => {
      const input = { path: document.uri.fsPath, content: document.getText() };
      this.files.set(input.path, input.content);
      this.snapshotValue = await this.adapter.updateFile(input, this.inputs());
      this.publish();
    });
  }

  private onUriChanged(uri: vscode.Uri): void {
    if (!uri.fsPath.endsWith(".tf") || uri.fsPath.split(/[\\/]/).includes(".terraform")) return;
    this.schedule(uri.fsPath, async () => {
      const input = await this.readUri(uri);
      this.files.set(input.path, input.content);
      this.snapshotValue = await this.adapter.updateFile(input, this.inputs());
      this.publish();
    });
  }

  private onUriDeleted(uri: vscode.Uri): void {
    if (!uri.fsPath.endsWith(".tf")) return;
    this.schedule(uri.fsPath, async () => {
      this.files.delete(uri.fsPath);
      this.snapshotValue = await this.adapter.removeFile(uri.fsPath, this.inputs());
      this.publish();
    });
  }

  private schedule(key: string, operation: () => Promise<void>): void {
    if (!this.enabled() || !this.autoRefresh()) return;
    const previous = this.timers.get(key);
    if (previous) clearTimeout(previous);
    const delay = vscode.workspace.getConfiguration("terraformBlastRadius").get("debounceMilliseconds", 350);
    this.timers.set(key, setTimeout(() => {
      this.timers.delete(key);
      void this.enqueue(operation);
    }, delay));
  }

  private async enqueue(operation: () => Promise<void>): Promise<void> {
    this.operation = this.operation.then(operation, operation).catch((error: unknown) => {
      this.output.appendLine(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    });
    await this.operation;
  }

  private publish(): void {
    this.changedEmitter.fire(this.snapshotValue);
  }

  private inputs(): SourceFileInput[] {
    return [...this.files].map(([path, content]) => ({ path, content }));
  }

  private async readUri(uri: vscode.Uri): Promise<SourceFileInput> {
    const document = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === uri.toString());
    const content = document?.getText() ?? Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");
    return { path: uri.fsPath, content };
  }

  private createAdapter(): AnalyzerAdapter {
    return new AnalyzerAdapter(vscode.workspace.getConfiguration("terraformBlastRadius").get("maxDepth", 5));
  }

  private enabled(): boolean {
    return vscode.workspace.getConfiguration("terraformBlastRadius").get("enabled", true);
  }

  private autoRefresh(): boolean {
    return vscode.workspace.getConfiguration("terraformBlastRadius").get("autoRefresh", true);
  }

  private async readHeadVersions(): Promise<Record<string, string>> {
    const before: Record<string, string> = {};
    const run = promisify(execFile);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      try {
        const { stdout } = await run("git", ["-C", folder.uri.fsPath, "ls-tree", "-r", "--name-only", "HEAD", "--", "*.tf"], { encoding: "utf8" });
        for (const relative of stdout.split(/\r?\n/).filter(Boolean)) {
          if (relative.split("/").includes(".terraform")) continue;
          try {
            const result = await run("git", ["-C", folder.uri.fsPath, "show", `HEAD:${relative}`], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
            before[path.join(folder.uri.fsPath, relative)] = result.stdout;
          } catch {
            // A file added after HEAD has no before version.
          }
        }
      } catch (error: unknown) {
        this.output.appendLine(`Could not read Terraform changes from ${folder.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return before;
  }
}
