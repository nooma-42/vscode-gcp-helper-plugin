export interface PositionLike {
  line: number;
  character: number;
}

export interface RangeLike {
  start: PositionLike;
  end: PositionLike;
}

export interface ResourceLocation {
  file: string;
  range: RangeLike;
}

export interface ResourceSummary extends ResourceLocation {
  address: string;
  type: string;
  name: string;
  references: ReferenceSummary[];
}

export interface ReferenceSummary extends ResourceLocation {
  address: string;
  attributePath?: string[];
}

export type Confidence = "confirmed" | "transitive" | "inferred" | "unknown";

export interface AffectedResource extends ResourceLocation {
  address: string;
  depth: number;
  confidence: Confidence;
  severity?: "low" | "medium" | "high";
  categories: string[];
  paths: string[][];
  reasons: Array<{ kind?: string; attribute?: string; file?: string; message?: string }>;
}

export interface BlastRadiusReport {
  changedResource: { address: string; changeType?: string };
  affectedResources: AffectedResource[];
  limitations: string[];
  cycles?: string[][];
}

export interface WorkspaceSnapshot {
  resources: ResourceSummary[];
  reports: BlastRadiusReport[];
  diagnostics: Array<{ file: string; message: string }>;
}

export interface SourceFileInput {
  path: string;
  content: string;
}
