import * as vscode from "vscode";
import { reportFor } from "./helpers";
import type { WorkspaceSnapshot } from "./types";

export class BlastRadiusCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
  private snapshot: WorkspaceSnapshot = { resources: [], reports: [], diagnostics: [] };
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.emitter.event;

  setSnapshot(snapshot: WorkspaceSnapshot): void {
    this.snapshot = snapshot;
    this.emitter.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!vscode.workspace.getConfiguration("terraformBlastRadius").get("showCodeLens", true)) return [];
    return this.snapshot.resources
      .filter((resource) => resource.file === document.uri.fsPath && resource.type.startsWith("google_"))
      .map((resource) => {
        const report = reportFor(this.snapshot.reports, resource.address);
        const count = report?.affectedResources.length;
        return new vscode.CodeLens(
          new vscode.Range(resource.range.start.line, resource.range.start.character, resource.range.start.line, resource.range.start.character),
          {
            command: "terraformBlastRadius.showResource",
            title: count === undefined ? "$(references) Analyze potential blast radius" : `$(references) Potential blast radius: ${count} resource${count === 1 ? "" : "s"}`,
            arguments: [resource.address]
          }
        );
      });
  }

  dispose(): void {
    this.emitter.dispose();
  }
}
