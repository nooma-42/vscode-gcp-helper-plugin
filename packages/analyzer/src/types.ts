export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

export interface SourceRange {
  start: SourcePosition;
  end: SourcePosition;
}

export type TerraformNodeKind = "resource" | "data" | "module" | "variable" | "local" | "output";

export interface TerraformReference {
  address: string;
  attributePath?: string[];
  range: SourceRange;
}

export interface TerraformAttribute {
  name: string;
  expression: string;
  references: TerraformReference[];
  range: SourceRange;
}

export interface TerraformResource {
  address: string;
  kind: TerraformNodeKind;
  type: string;
  name: string;
  file: string;
  range: SourceRange;
  attributes: TerraformAttribute[];
  explicitDependencies: string[];
  source?: string;
}

export interface ParseDiagnostic {
  file: string;
  message: string;
  range?: SourceRange;
  severity: "warning" | "error";
}

export interface ParsedTerraformFile {
  file: string;
  resources: TerraformResource[];
  diagnostics: ParseDiagnostic[];
}

export type EdgeKind = "expression" | "depends_on" | "module" | "semantic";
export type EdgeConfidence = "confirmed" | "inferred";

export interface DependencyEdge {
  source: string;
  target: string;
  kind: EdgeKind;
  attribute?: string;
  confidence: EdgeConfidence;
  file?: string;
}

export type ChangeType =
  | "configuration-added"
  | "configuration-removed"
  | "configuration-modified"
  | "dependency-modified";

export interface ResourceChange {
  address: string;
  changeType: ChangeType;
  changedAttributes: string[];
  before?: TerraformResource;
  after?: TerraformResource;
}

export type ImpactCategory =
  | "network-topology"
  | "network-access"
  | "network-routing"
  | "addressing"
  | "service-networking"
  | "gke-networking"
  | "gke-capacity"
  | "database-connectivity"
  | "database-availability"
  | "database-access";

export interface ImpactRule {
  id: string;
  sourceResourceType: string;
  changedAttributes?: string[];
  relatedResourceTypes?: string[];
  relatedAttributes?: string[];
  category: ImpactCategory;
  severity: "low" | "medium" | "high";
  message: string;
  recommendation?: string;
}

export interface RuleMatch {
  ruleId: string;
  category: ImpactCategory;
  severity: "low" | "medium" | "high";
  message: string;
  recommendation?: string;
  confidence: EdgeConfidence;
}

export interface ImpactReason {
  kind: EdgeKind;
  attribute?: string;
  file?: string;
  message?: string;
}

export interface AffectedResource {
  address: string;
  depth: number;
  confidence: "confirmed" | "transitive" | "inferred";
  severity: "low" | "medium" | "high";
  categories: ImpactCategory[];
  paths: string[][];
  reasons: ImpactReason[];
  ruleMatches: RuleMatch[];
}

export interface AnalysisReport {
  changedResource: { address: string; changeType: ChangeType };
  affectedResources: AffectedResource[];
  cycles: string[][];
  limitations: string[];
  diagnostics: ParseDiagnostic[];
}

export interface AnalyzeOptions {
  maxDepth?: number;
  changeType?: ChangeType;
  changedAttributes?: string[];
  includeInferred?: boolean;
}
