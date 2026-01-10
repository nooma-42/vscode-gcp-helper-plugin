import { applyImpactRules, highestSeverity } from "./rules";
import type { AnalysisReport, AnalyzeOptions, DependencyEdge, ImpactReason, ParsedTerraformFile } from "./types";
import { DependencyGraph } from "./graph";

export const STATIC_ANALYSIS_LIMITATIONS = [
  "No Terraform state was analyzed.",
  "No Terraform plan was analyzed.",
  "Live GCP resources were not queried.",
] as const;

export function analyzeBlastRadius(graph: DependencyGraph, address: string, options: AnalyzeOptions = {}, diagnostics: ParsedTerraformFile["diagnostics"] = []): AnalysisReport {
  const maxDepth = options.maxDepth ?? 5;
  const traversal = graph.traverse(address, maxDepth);
  const source = graph.nodes.get(address);
  return {
    changedResource: { address, changeType: options.changeType ?? "configuration-modified" },
    affectedResources: traversal.hits
      .filter((hit) => options.includeInferred !== false || hit.edges.some((edge) => edge.confidence === "confirmed"))
      .filter((hit) => !["variable", "local", "output"].includes(graph.nodes.get(hit.address)?.kind ?? ""))
      .map((hit) => {
        const target = graph.nodes.get(hit.address);
        const pathEdges = hit.paths.map((path) => edgeForPath(graph, path));
        const inferred = pathEdges.length > 0 && !pathEdges.some((edges) => edges.length > 0 && edges.every((edge) => edge.confidence === "confirmed"));
        const matches = applyImpactRules(source, target, options.changedAttributes, inferred ? "inferred" : "confirmed");
        const reasons: ImpactReason[] = [...new Map(pathEdges.flat().map((edge) => [
          `${edge.source}|${edge.target}|${edge.kind}|${edge.attribute ?? ""}`,
          { kind: edge.kind, attribute: edge.attribute, file: edge.file, message: edge.kind === "semantic" ? "Resources appear to share the same network configuration." : undefined },
        ])).values()];
        return {
          address: hit.address,
          depth: hit.depth,
          confidence: inferred ? "inferred" as const : hit.depth === 1 ? "confirmed" as const : "transitive" as const,
          severity: highestSeverity(matches.map((match) => match.severity)),
          categories: [...new Set(matches.map((match) => match.category))],
          paths: hit.paths,
          reasons,
          ruleMatches: matches,
        };
      }),
    cycles: traversal.cycles,
    limitations: [...STATIC_ANALYSIS_LIMITATIONS],
    diagnostics,
  };
}

function edgeForPath(graph: DependencyGraph, path: string[]): DependencyEdge[] {
  return path.slice(1).map((target, i) => graph.edgesFrom(path[i]).find((edge) => edge.target === target)).filter((edge): edge is DependencyEdge => Boolean(edge));
}

const SECRET_KEY = /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|credential)/i;
const SENSITIVE_VALUE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:ya29\.|AIza)[A-Za-z0-9._-]+|\b(?:ghp|github_pat)_[A-Za-z0-9_]+|\bBearer\s+[A-Za-z0-9._~-]+)/i;

export function redactSecrets<T>(value: T): T {
  const visit = (current: unknown, key = ""): unknown => {
    if (SECRET_KEY.test(key)) return "[REDACTED]";
    if (typeof current === "string") return SENSITIVE_VALUE.test(current) ? "[REDACTED]" : current;
    if (Array.isArray(current)) return current.map((item) => visit(item));
    if (current && typeof current === "object") return Object.fromEntries(Object.entries(current).map(([childKey, child]) => [childKey, visit(child, childKey)]));
    return current;
  };
  return visit(value) as T;
}

export function serializeReport(report: AnalysisReport, pretty = true): string {
  return JSON.stringify(redactSecrets(report), null, pretty ? 2 : undefined);
}
