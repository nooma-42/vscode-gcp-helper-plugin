import { diffTerraform } from "./diff";
import { DependencyGraph } from "./graph";
import { findResourceAtOffset, parseTerraform } from "./parser";
import { analyzeBlastRadius } from "./report";
import { inferSemanticEdges } from "./rules";
import type { AnalysisReport, AnalyzeOptions, ParsedTerraformFile, ResourceChange, TerraformResource } from "./types";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export interface WorkspaceAnalyzerOptions { inferSemanticDependencies?: boolean }

export class IncrementalWorkspaceAnalyzer {
  private readonly files = new Map<string, ParsedTerraformFile>();
  private graph = new DependencyGraph();
  private readonly inferSemanticDependencies: boolean;

  constructor(options: WorkspaceAnalyzerOptions = {}) { this.inferSemanticDependencies = options.inferSemanticDependencies ?? true; }

  updateFile(file: string, source: string): ParsedTerraformFile {
    const parsed = parseTerraform(source, file);
    this.files.set(file, parsed);
    this.rebuild();
    return parsed;
  }

  updateFiles(files: Record<string, string>): ParsedTerraformFile[] {
    const parsed = Object.entries(files).map(([file, source]) => parseTerraform(source, file));
    for (const item of parsed) this.files.set(item.file, item);
    this.rebuild();
    return parsed;
  }

  removeFile(file: string): boolean { const removed = this.files.delete(file); if (removed) this.rebuild(); return removed; }
  clear(): void { this.files.clear(); this.rebuild(); }
  getFiles(): ParsedTerraformFile[] { return [...this.files.values()]; }
  getGraph(): DependencyGraph { return this.graph; }
  getResource(address: string): TerraformResource | undefined { return this.graph.nodes.get(address); }
  getResourceAt(file: string, offset: number): TerraformResource | undefined { const parsed = this.files.get(file); return parsed && findResourceAtOffset(parsed, offset); }

  analyze(address: string, options: AnalyzeOptions = {}): AnalysisReport {
    return analyzeBlastRadius(this.graph, address, options, this.getFiles().flatMap((file) => file.diagnostics));
  }

  analyzeChanges(before: Record<string, string>): Array<{ change: ResourceChange; report: AnalysisReport }> {
    const beforeFiles = Object.entries(before).map(([file, source]) => parseTerraform(source, file));
    const previousGraph = new DependencyGraph(beforeFiles);
    if (this.inferSemanticDependencies) for (const edge of inferSemanticEdges(previousGraph.nodes.values())) previousGraph.addEdge(edge);
    return diffTerraform(beforeFiles, this.getFiles()).map((change) => ({
      change,
      report: change.changeType === "configuration-removed"
        ? analyzeBlastRadius(previousGraph, change.address, { changeType: change.changeType, changedAttributes: change.changedAttributes }, beforeFiles.flatMap((file) => file.diagnostics))
        : this.analyze(change.address, { changeType: change.changeType, changedAttributes: change.changedAttributes }),
    }));
  }

  private rebuild(): void {
    this.graph = new DependencyGraph(this.getFiles());
    this.linkLocalModules();
    if (this.inferSemanticDependencies) for (const edge of inferSemanticEdges(this.graph.nodes.values())) this.graph.addEdge(edge);
  }

  /** Connects local module inputs and outputs without reading or downloading remote modules. */
  private linkLocalModules(): void {
    const resources = [...this.graph.nodes.values()];
    for (const moduleCall of resources.filter((resource) => resource.kind === "module" && resource.source?.startsWith("."))) {
      const moduleDirectory = resolve(dirname(moduleCall.file), moduleCall.source!);
      const children = resources.filter((resource) => isWithin(moduleDirectory, resource.file));

      for (const variable of children.filter((resource) => resource.kind === "variable")) {
        const input = moduleCall.attributes.find((attribute) => attribute.name === variable.name);
        if (!input) continue;
        for (const reference of input.references) {
          this.graph.addEdge({
            source: reference.address,
            target: variable.address,
            kind: "module",
            attribute: input.name,
            confidence: "confirmed",
            file: moduleCall.file,
          });
        }
      }

      const outputs = new Map(children.filter((resource) => resource.kind === "output").map((output) => [output.name, output]));
      for (const dependent of resources.filter((resource) => !isWithin(moduleDirectory, resource.file))) {
        for (const attribute of dependent.attributes) {
          for (const reference of attribute.references.filter((candidate) => candidate.address === moduleCall.address)) {
            const output = reference.attributePath?.[0] && outputs.get(reference.attributePath[0]);
            if (!output) continue;
            this.graph.addEdge({
              source: output.address,
              target: dependent.address,
              kind: "module",
              attribute: attribute.name,
              confidence: "confirmed",
              file: dependent.file,
            });
          }
        }
      }
    }
  }
}

function isWithin(directory: string, file: string): boolean {
  const path = relative(directory, resolve(file));
  return path !== "" && path !== ".." && !path.startsWith("..") && !isAbsolute(path);
}

export function analyzeWorkspace(files: Record<string, string>, changedAddress: string, options: AnalyzeOptions = {}): AnalysisReport {
  const analyzer = new IncrementalWorkspaceAnalyzer();
  analyzer.updateFiles(files);
  return analyzer.analyze(changedAddress, options);
}
