import type { BlastRadiusReport, PositionLike, RangeLike, ResourceSummary } from "./types";

export function containsPosition(range: RangeLike, position: PositionLike): boolean {
  const afterStart = position.line > range.start.line ||
    (position.line === range.start.line && position.character >= range.start.character);
  const beforeEnd = position.line < range.end.line ||
    (position.line === range.end.line && position.character <= range.end.character);
  return afterStart && beforeEnd;
}

export function resourceAtPosition(
  resources: ResourceSummary[],
  file: string,
  position: PositionLike
): ResourceSummary | undefined {
  return resources
    .filter((resource) => samePath(resource.file, file) && containsPosition(resource.range, position))
    .sort((a, b) => rangeSize(a.range) - rangeSize(b.range))[0];
}

export function referenceAtPosition(
  resources: ResourceSummary[],
  file: string,
  position: PositionLike
) {
  return resources
    .flatMap((resource) => resource.references)
    .find((reference) => samePath(reference.file, file) && containsPosition(reference.range, position));
}

export function reportFor(reports: BlastRadiusReport[], address: string): BlastRadiusReport | undefined {
  return reports.find((report) => report.changedResource.address === address);
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (typeof value === "string" && /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:ya29\.|AIza)[A-Za-z0-9._-]+|\b(?:ghp|github_pat)_[A-Za-z0-9_]+|\bBearer\s+[A-Za-z0-9._~-]+)/i.test(value)) return "[REDACTED]";
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => {
    if (/(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|credential)/i.test(key)) {
      return [key, "[REDACTED]"];
    }
    return [key, redactSecrets(child)];
  }));
}

function rangeSize(range: RangeLike): number {
  return (range.end.line - range.start.line) * 10_000 + range.end.character - range.start.character;
}

function samePath(left: string, right: string): boolean {
  return left.replaceAll("\\", "/") === right.replaceAll("\\", "/");
}
