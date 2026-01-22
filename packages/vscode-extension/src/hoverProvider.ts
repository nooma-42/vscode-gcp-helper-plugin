import * as vscode from "vscode";
import { referenceAtPosition, reportFor } from "./helpers";
import type { WorkspaceSnapshot } from "./types";

export class BlastRadiusHoverProvider implements vscode.HoverProvider {
  private snapshot: WorkspaceSnapshot = { resources: [], reports: [], diagnostics: [] };

  setSnapshot(snapshot: WorkspaceSnapshot): void {
    this.snapshot = snapshot;
  }

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | undefined {
    const reference = referenceAtPosition(this.snapshot.resources, document.uri.fsPath, position);
    if (!reference) return undefined;
    const report = reportFor(this.snapshot.reports, reference.address);
    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.appendMarkdown("This reference creates a dependency on:\n\n");
    markdown.appendMarkdown(`**${reference.address}**\n\n`);
    if (report?.affectedResources.length) {
      markdown.appendMarkdown("Changing this configuration may affect:\n\n");
      for (const affected of report.affectedResources.slice(0, 10)) {
        markdown.appendMarkdown(`- ${affected.address} (${affected.confidence.toUpperCase()})\n`);
      }
    } else {
      markdown.appendMarkdown("Run blast radius analysis to inspect downstream dependencies.");
    }
    return new vscode.Hover(markdown, new vscode.Range(
      reference.range.start.line,
      reference.range.start.character,
      reference.range.end.line,
      reference.range.end.character
    ));
  }
}
