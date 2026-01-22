import * as path from "node:path";
import * as vscode from "vscode";
import { ResultModel } from "./resultModel";
import type { AffectedResource, BlastRadiusReport, ResourceSummary, WorkspaceSnapshot } from "./types";

type Node = ChangedNode | GroupNode | ResourceNode | EffectNode | MessageNode;
interface ChangedNode { kind: "changed"; report: BlastRadiusReport }
interface GroupNode { kind: "group"; label: string; items: AffectedResource[]; report: BlastRadiusReport; group: "direct" | "transitive" | "effects" }
interface ResourceNode { kind: "resource"; resource: AffectedResource; report: BlastRadiusReport }
interface EffectNode { kind: "effect"; category: string; resources: AffectedResource[] }
interface MessageNode { kind: "message"; label: string }

export class BlastRadiusTreeProvider implements vscode.TreeDataProvider<Node>, vscode.Disposable {
  private snapshot: WorkspaceSnapshot = { resources: [], reports: [], diagnostics: [] };
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly model: ResultModel) {
    model.onDidChange(() => this.emitter.fire(undefined));
  }

  setSnapshot(snapshot: WorkspaceSnapshot): void {
    this.snapshot = snapshot;
    this.emitter.fire(undefined);
  }

  getTreeItem(node: Node): vscode.TreeItem {
    switch (node.kind) {
      case "changed": {
        const count = node.report.affectedResources.length;
        const item = new vscode.TreeItem(node.report.changedResource.address, vscode.TreeItemCollapsibleState.Expanded);
        item.description = `${count} potentially affected`;
        item.iconPath = new vscode.ThemeIcon("diff-modified");
        item.contextValue = "changedResource";
        item.tooltip = changeTooltip(node.report);
        const source = this.lookup(node.report.changedResource.address);
        if (source) item.command = openCommand(source.file, source.range.start.line, source.range.start.character);
        return item;
      }
      case "group": {
        const count = node.group === "effects" ? uniqueCategories(node.report.affectedResources).length : node.items.length;
        const item = new vscode.TreeItem(`${node.label} (${count})`, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon(node.group === "effects" ? "lightbulb" : node.group === "direct" ? "references" : "type-hierarchy-sub");
        return item;
      }
      case "resource": {
        const item = new vscode.TreeItem(node.resource.address, vscode.TreeItemCollapsibleState.None);
        item.description = `${node.resource.confidence.toUpperCase()}${node.resource.severity ? ` · ${node.resource.severity}` : ""}`;
        item.iconPath = new vscode.ThemeIcon(severityIcon(node.resource.severity));
        item.tooltip = affectedTooltip(node.resource);
        const location = this.location(node.resource);
        if (location.file) item.command = openCommand(location.file, location.line, location.character);
        return item;
      }
      case "effect": {
        const item = new vscode.TreeItem(formatCategory(node.category), vscode.TreeItemCollapsibleState.None);
        item.description = `${node.resources.length} resource${node.resources.length === 1 ? "" : "s"}`;
        item.iconPath = new vscode.ThemeIcon("warning");
        item.tooltip = node.resources.map((resource) => resource.address).join("\n");
        return item;
      }
      case "message": {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon("info");
        return item;
      }
    }
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      if (this.model.reports.length === 0) return [{ kind: "message", label: "Run an analysis to see potential effects." }];
      return this.model.reports.map((report) => ({ kind: "changed", report }));
    }
    if (node.kind === "changed") {
      const direct = node.report.affectedResources.filter((resource) => resource.depth === 1 && resource.confidence !== "inferred");
      const transitive = node.report.affectedResources.filter((resource) => resource.depth > 1 && resource.confidence !== "inferred");
      const inferred = node.report.affectedResources.filter((resource) => resource.confidence === "inferred");
      const effectItems = uniqueCategories(node.report.affectedResources);
      return [
        { kind: "group", label: "Direct dependencies", items: direct, report: node.report, group: "direct" },
        { kind: "group", label: "Transitive dependencies", items: transitive, report: node.report, group: "transitive" },
        { kind: "group", label: "Potential effects", items: effectItems.length ? node.report.affectedResources : inferred, report: node.report, group: "effects" }
      ];
    }
    if (node.kind === "group") {
      if (node.group === "effects") {
        return uniqueCategories(node.report.affectedResources).map((category) => ({
          kind: "effect",
          category,
          resources: node.report.affectedResources.filter((resource) => resource.categories.includes(category))
        }));
      }
      return node.items.map((resource) => ({ kind: "resource", resource, report: node.report }));
    }
    return [];
  }

  dispose(): void {
    this.emitter.dispose();
  }

  private lookup(address: string): ResourceSummary | undefined {
    return this.snapshot.resources.find((resource) => resource.address === address);
  }

  private location(resource: AffectedResource) {
    const indexed = this.lookup(resource.address);
    const location = resource.file ? resource : indexed;
    return {
      file: location?.file ?? "",
      line: location?.range.start.line ?? 0,
      character: location?.range.start.character ?? 0
    };
  }
}

function uniqueCategories(resources: AffectedResource[]): string[] {
  return [...new Set(resources.flatMap((resource) => resource.categories))].sort();
}

function formatCategory(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function severityIcon(severity: AffectedResource["severity"]): string {
  if (severity === "high") return "error";
  if (severity === "medium") return "warning";
  return "circle-outline";
}

function openCommand(file: string, line: number, character: number): vscode.Command {
  return { command: "terraformBlastRadius.openResource", title: "Open resource", arguments: [file, line, character] };
}

function changeTooltip(report: BlastRadiusReport): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.appendMarkdown(`**${report.changedResource.address}**\n\n`);
  markdown.appendMarkdown(`${report.changedResource.changeType ?? "Selected configuration"}\n\n`);
  markdown.appendMarkdown("A Terraform plan is required to determine actual update or replacement behavior.");
  return markdown;
}

function affectedTooltip(resource: AffectedResource): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.appendMarkdown(`**Potentially affected: ${resource.address}**\n\n`);
  for (const dependencyPath of resource.paths) markdown.appendCodeblock(dependencyPath.join("\n→ "));
  for (const reason of resource.reasons) {
    markdown.appendMarkdown(`${reason.message ?? [reason.kind, reason.attribute].filter(Boolean).join(" · ")}\n\n`);
  }
  if (resource.file) markdown.appendMarkdown(`Defined in \`${path.basename(resource.file)}\``);
  return markdown;
}
