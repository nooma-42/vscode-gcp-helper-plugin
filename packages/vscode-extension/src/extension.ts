import * as vscode from "vscode";
import { BlastRadiusCodeLensProvider } from "./codeLensProvider";
import { BlastRadiusHoverProvider } from "./hoverProvider";
import { redactSecrets, resourceAtPosition } from "./helpers";
import { ResultModel } from "./resultModel";
import { BlastRadiusTreeProvider } from "./treeView";
import type { BlastRadiusReport } from "./types";
import { WorkspaceService } from "./workspaceService";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("Terraform Blast Radius");
  const service = new WorkspaceService(output);
  const results = new ResultModel();
  const tree = new BlastRadiusTreeProvider(results);
  const codeLens = new BlastRadiusCodeLensProvider();
  const hover = new BlastRadiusHoverProvider();
  const selector: vscode.DocumentSelector = [{ language: "terraform", scheme: "file" }, { pattern: "**/*.tf", scheme: "file" }];

  context.subscriptions.push(
    output,
    service,
    results,
    tree,
    codeLens,
    vscode.window.registerTreeDataProvider("terraformBlastRadius.results", tree),
    vscode.languages.registerCodeLensProvider(selector, codeLens),
    vscode.languages.registerHoverProvider(selector, hover),
    service.onDidChange((snapshot) => {
      tree.setSnapshot(snapshot);
      codeLens.setSnapshot(snapshot);
      hover.setSnapshot(snapshot);
      if (results.reports.length) {
        const addresses = new Set(results.reports.map((report) => report.changedResource.address));
        results.set(snapshot.reports.filter((report) => addresses.has(report.changedResource.address)));
      }
    }),
    vscode.commands.registerCommand("terraformBlastRadius.analyzeCurrentResource", () => analyzeCurrent(service, results)),
    vscode.commands.registerCommand("terraformBlastRadius.showResource", (address: string) => showResource(address, service, results)),
    vscode.commands.registerCommand("terraformBlastRadius.analyzeChangedResources", () => analyzeChanged(service, results)),
    vscode.commands.registerCommand("terraformBlastRadius.analyzeWorkspace", () => showReports(service.snapshot.reports, results)),
    vscode.commands.registerCommand("terraformBlastRadius.refresh", async () => {
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "Refreshing Terraform blast radius" }, () => service.refresh());
    }),
    vscode.commands.registerCommand("terraformBlastRadius.exportReport", () => exportReport(results.reports)),
    vscode.commands.registerCommand("terraformBlastRadius.openResource", openResource)
  );

  try {
    await service.refresh();
  } catch (error: unknown) {
    output.appendLine(`Initial analysis failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function deactivate(): void {}

async function analyzeCurrent(service: WorkspaceService, model: ResultModel): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document.uri.fsPath.endsWith(".tf")) {
    void vscode.window.showInformationMessage("Open a Terraform resource and place the cursor inside it first.");
    return;
  }
  const resource = resourceAtPosition(service.snapshot.resources, editor.document.uri.fsPath, editor.selection.active);
  if (!resource) {
    void vscode.window.showInformationMessage("The cursor is not inside a Terraform resource.");
    return;
  }
  await showResource(resource.address, service, model);
}

async function showResource(address: string, service: WorkspaceService, model: ResultModel): Promise<void> {
  const report = await service.analyzeResource(address);
  if (!report) {
    void vscode.window.showWarningMessage(`No analysis result is available for ${address}.`);
    return;
  }
  await showReports([report], model);
}

async function analyzeChanged(service: WorkspaceService, model: ResultModel): Promise<void> {
  const reports = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "Analyzing changed Terraform resources" },
    () => service.analyzeChangedResources()
  );
  if (reports.length === 0) void vscode.window.showInformationMessage("No Terraform resource changes were found relative to Git HEAD.");
  await showReports(reports, model);
}

async function showReports(reports: BlastRadiusReport[], model: ResultModel): Promise<void> {
  model.set(reports);
  await vscode.commands.executeCommand("terraformBlastRadius.results.focus");
}

async function openResource(file: string, line = 0, character = 0): Promise<void> {
  const uri = vscode.Uri.file(file);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document);
  const position = new vscode.Position(line, character);
  editor.selection = new vscode.Selection(position, position);
  editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

async function exportReport(reports: BlastRadiusReport[]): Promise<void> {
  if (reports.length === 0) {
    void vscode.window.showInformationMessage("Run an analysis before exporting a report.");
    return;
  }
  const uri = await vscode.window.showSaveDialog({
    title: "Export Terraform Blast Radius Report",
    filters: { JSON: ["json"] },
    defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file("."), "terraform-blast-radius-report.json")
  });
  if (!uri) return;
  const payload = {
    generatedAt: new Date().toISOString(),
    mode: "local-static-analysis",
    reports,
    notice: "No GCP access, Terraform state, or Terraform plan was used. A Terraform plan is required to determine actual update or replacement behavior."
  };
  await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(redactSecrets(payload), null, 2), "utf8"));
  void vscode.window.showInformationMessage(`Terraform blast radius report exported to ${uri.fsPath}.`);
}
