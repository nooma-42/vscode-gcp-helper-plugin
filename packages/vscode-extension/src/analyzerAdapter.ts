import type {
  AffectedResource,
  BlastRadiusReport,
  RangeLike,
  ReferenceSummary,
  ResourceSummary,
  SourceFileInput,
  WorkspaceSnapshot
} from "./types";

// This is the only module that knows the analyzer package's runtime API. The adapter
// deliberately uses structural typing so the extension UI stays independent of core.
interface CoreAnalyzer {
  analyze?(address: string, options?: Record<string, unknown>): unknown | Promise<unknown>;
  updateFile?(path: string, content: string): unknown | Promise<unknown>;
  updateFiles?(files: Record<string, string>): unknown | Promise<unknown>;
  removeFile?(path: string): unknown | Promise<unknown>;
  clear?(): void;
  analyzeChanges?(before: Record<string, string>): unknown | Promise<unknown>;
}

interface CoreModule extends CoreAnalyzer {
  createAnalyzer?(options?: Record<string, unknown>): CoreAnalyzer;
  Analyzer?: new (options?: Record<string, unknown>) => CoreAnalyzer;
  TerraformAnalyzer?: new (options?: Record<string, unknown>) => CoreAnalyzer;
  IncrementalWorkspaceAnalyzer?: new (options?: Record<string, unknown>) => CoreAnalyzer;
}

export class AnalyzerAdapter {
  private readonly core: CoreAnalyzer;
  private readonly parsedFiles = new Map<string, unknown>();

  constructor(private readonly maxDepth: number) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require("@terraform-blast-radius/analyzer") as CoreModule;
    this.core = (module.IncrementalWorkspaceAnalyzer ? new module.IncrementalWorkspaceAnalyzer({ inferSemanticDependencies: true }) : undefined)
      ?? module.createAnalyzer?.({ maxDepth })
      ?? (module.TerraformAnalyzer ? new module.TerraformAnalyzer({ maxDepth }) : undefined)
      ?? (module.Analyzer ? new module.Analyzer({ maxDepth }) : undefined)
      ?? module;
  }

  async analyzeWorkspace(files: SourceFileInput[]): Promise<WorkspaceSnapshot> {
    const input = Object.fromEntries(files.map((file) => [file.path, file.content]));
    this.parsedFiles.clear();
    this.core.clear?.();
    if (this.core.updateFiles) {
      const parsed = asArray(await this.core.updateFiles(input));
      parsed.forEach((file, index) => this.parsedFiles.set(text(asRecord(file).file) || files[index]?.path, file));
    } else {
      for (const file of files) this.parsedFiles.set(file.path, await this.core.updateFile?.(file.path, file.content));
    }
    return this.snapshot();
  }

  async updateFile(file: SourceFileInput, allFiles: SourceFileInput[]): Promise<WorkspaceSnapshot> {
    if (!this.core.updateFile) return this.analyzeWorkspace(allFiles);
    this.parsedFiles.set(file.path, await this.core.updateFile(file.path, file.content));
    return this.snapshot();
  }

  async removeFile(path: string, allFiles: SourceFileInput[]): Promise<WorkspaceSnapshot> {
    if (!this.core.removeFile) return this.analyzeWorkspace(allFiles);
    await this.core.removeFile(path);
    this.parsedFiles.delete(path);
    return this.snapshot();
  }

  async analyzeResource(address: string, snapshot: WorkspaceSnapshot): Promise<BlastRadiusReport | undefined> {
    if (!this.core.analyze) {
      return snapshot.reports.find((report) => report.changedResource.address === address);
    }
    return normalizeReport(await this.core.analyze(address, { maxDepth: this.maxDepth, includeInferred: true }));
  }

  async analyzeChangedResources(snapshot: WorkspaceSnapshot, before: Record<string, string>): Promise<BlastRadiusReport[]> {
    if (!this.core.analyzeChanges) {
      return snapshot.reports.filter((report) => Boolean(report.changedResource.changeType));
    }
    const raw = await this.core.analyzeChanges(before);
    return asArray(raw).map((result) => {
      const wrapper = asRecord(result);
      const report = normalizeReport(wrapper.report ?? result);
      if (report && !report.changedResource.changeType) {
        report.changedResource.changeType = text(asRecord(wrapper.change).changeType ?? asRecord(wrapper.change).type) || undefined;
      }
      return report;
    }).filter(isDefined);
  }

  private async snapshot(): Promise<WorkspaceSnapshot> {
    const resources = [...this.parsedFiles.values()]
      .flatMap((file) => asArray(asRecord(file).resources))
      .map(normalizeResource)
      .filter(isDefined);
    const reports = this.core.analyze
      ? (await Promise.all(resources.map((resource) => this.core.analyze!(resource.address, {
          maxDepth: this.maxDepth,
          includeInferred: true
        })))).map(normalizeReport).filter(isDefined)
      : [];
    const diagnostics = [...this.parsedFiles.values()].flatMap((file) => {
      const value = asRecord(file);
      return asArray(value.diagnostics ?? value.errors).map((diagnostic) => ({
        file: text(value.file),
        message: text(asRecord(diagnostic).message ?? diagnostic)
      }));
    });
    return { resources, reports, diagnostics };
  }
}

function normalizeResource(raw: unknown): ResourceSummary | undefined {
  const value = asRecord(raw);
  const address = text(value.address ?? value.id);
  if (!address) return undefined;
  const [fallbackType = "resource", fallbackName = address] = address.split(".");
  const file = text(value.file ?? value.filePath ?? asRecord(value.location).file);
  return {
    address,
    type: text(value.type) || fallbackType,
    name: text(value.name) || fallbackName,
    file,
    range: normalizeRange(value.range ?? asRecord(value.location).range),
    references: asArray(value.references ?? collectAttributeReferences(value.attributes))
      .map((reference) => normalizeReference(reference, file))
      .filter(isDefined)
  };
}

function normalizeReference(raw: unknown, containingFile = ""): ReferenceSummary | undefined {
  const value = asRecord(raw);
  const address = text(value.address ?? value.target);
  if (!address) return undefined;
  return {
    address,
    attributePath: asArray(value.attributePath).map(text).filter(Boolean),
    file: text(value.file ?? value.filePath ?? asRecord(value.location).file) || containingFile,
    range: normalizeRange(value.range ?? asRecord(value.location).range)
  };
}

function normalizeReport(raw: unknown): BlastRadiusReport | undefined {
  const value = asRecord(raw);
  const changed = asRecord(value.changedResource ?? value.source ?? value.resource ?? value.changed);
  const address = text(changed.address ?? changed.id ?? value.address);
  if (!address) return undefined;
  return {
    changedResource: {
      address,
      changeType: text(changed.changeType ?? changed.change) || undefined
    },
    affectedResources: asArray(value.affectedResources ?? value.affected ?? value.impacts)
      .map(normalizeAffected)
      .filter(isDefined),
    limitations: asArray(value.limitations).map(text).filter(Boolean),
    cycles: asArray(value.cycles).map((cycle) => asArray(cycle).map(text).filter(Boolean))
  };
}

function normalizeAffected(raw: unknown): AffectedResource | undefined {
  const value = asRecord(raw);
  const address = text(value.address ?? value.id ?? asRecord(value.resource).address);
  if (!address) return undefined;
  return {
    address,
    depth: number(value.depth, 1),
    confidence: normalizeConfidence(value.confidence, number(value.depth, 1)),
    severity: normalizeSeverity(value.severity),
    categories: asArray(value.categories ?? value.effects).map((item) => text(asRecord(item).category ?? item)).filter(Boolean),
    paths: asArray(value.paths ?? value.dependencyPaths).map((path) => asArray(path).map((item) => text(asRecord(item).address ?? item)).filter(Boolean)),
    reasons: asArray(value.reasons).map((reason) => {
      const detail = asRecord(reason);
      return {
        kind: text(detail.kind) || undefined,
        attribute: text(detail.attribute) || undefined,
        file: text(detail.file) || undefined,
        message: text(detail.message) || undefined
      };
    }),
    file: text(value.file ?? value.filePath ?? asRecord(value.location).file ?? asRecord(value.resource).file),
    range: normalizeRange(value.range ?? asRecord(value.location).range ?? asRecord(value.resource).range)
  };
}

function collectAttributeReferences(raw: unknown): unknown[] {
  return asArray(raw).flatMap((attribute) => asArray(asRecord(attribute).references));
}

function normalizeRange(raw: unknown): RangeLike {
  const value = asRecord(raw);
  return {
    start: normalizePosition(value.start ?? value.startPosition),
    end: normalizePosition(value.end ?? value.endPosition ?? value.start ?? value.startPosition)
  };
}

function normalizePosition(raw: unknown) {
  const value = asRecord(raw);
  return {
    line: number(value.line ?? value.lineNumber, 0),
    character: number(value.character ?? value.column, 0)
  };
}

function normalizeConfidence(raw: unknown, depth: number): AffectedResource["confidence"] {
  const value = text(raw).toLowerCase();
  if (value === "confirmed" || value === "transitive" || value === "inferred" || value === "unknown") return value;
  return depth > 1 ? "transitive" : "confirmed";
}

function normalizeSeverity(raw: unknown): AffectedResource["severity"] {
  const value = text(raw).toLowerCase();
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Symbol.iterator in value) return [...value as Iterable<unknown>];
  return value === undefined || value === null ? [] : [value];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function number(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
