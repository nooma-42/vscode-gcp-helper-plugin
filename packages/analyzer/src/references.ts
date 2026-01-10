import type { SourcePosition, SourceRange, TerraformReference } from "./types";

const RESERVED = new Set([
  "true", "false", "null", "each", "count", "self", "path", "terraform",
]);

function positionAt(text: string, offset: number, baseOffset = 0, baseLine = 0, baseColumn = 0): SourcePosition {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return {
    offset: baseOffset + offset,
    line: baseLine + lines.length - 1,
    column: lines.length === 1 ? baseColumn + offset : lines.at(-1)!.length,
  };
}

function refRange(expression: string, start: number, end: number, base: SourcePosition): SourceRange {
  return {
    start: positionAt(expression, start, base.offset, base.line, base.column),
    end: positionAt(expression, end, base.offset, base.line, base.column),
  };
}

function isReferenceContext(expression: string, offset: number): boolean {
  let quoted = false;
  let templateDepth = 0;
  for (let i = 0; i < offset; i++) {
    if (expression[i] === "\\" && quoted) { i++; continue; }
    if (!quoted && expression[i] === '"') { quoted = true; continue; }
    if (quoted && templateDepth === 0 && expression[i] === '"') { quoted = false; continue; }
    if (quoted && (expression.startsWith("${", i) || expression.startsWith("%{", i))) { templateDepth++; i++; continue; }
    if (quoted && templateDepth > 0 && expression[i] === "}") templateDepth--;
  }
  return !quoted || templateDepth > 0;
}

/** Extracts Terraform traversals without attempting expression evaluation. */
export function extractReferences(expression: string, base: SourcePosition = { line: 0, column: 0, offset: 0 }): TerraformReference[] {
  const results: TerraformReference[] = [];
  const seen = new Set<string>();
  const traversal = /\b([A-Za-z_][\w-]*(?:\s*\[\s*(?:"[^"]*"|'[^']*'|\d+|[^\]]+)\s*\])?(?:\s*\.\s*[A-Za-z_][\w-]*(?:\s*\[\s*(?:"[^"]*"|'[^']*'|\d+|[^\]]+)\s*\])?)+)/g;
  for (const match of expression.matchAll(traversal)) {
    if (!isReferenceContext(expression, match.index!)) continue;
    const raw = match[0];
    const identifiers = [...raw.matchAll(/[A-Za-z_][\w-]*/g)].map((m) => m[0]);
    if (identifiers.length < 2) continue;
    let address: string;
    let path: string[];
    if (identifiers[0] === "data" && identifiers.length >= 3) {
      address = `data.${identifiers[1]}.${identifiers[2]}`;
      path = identifiers.slice(3);
    } else if (["module", "var", "local"].includes(identifiers[0])) {
      address = `${identifiers[0]}.${identifiers[1]}`;
      path = identifiers.slice(2);
    } else if (RESERVED.has(identifiers[0]) || identifiers.length < 2) {
      continue;
    } else {
      address = `${identifiers[0]}.${identifiers[1]}`;
      path = identifiers.slice(2);
    }
    const key = `${match.index}:${address}:${path.join(".")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      address,
      attributePath: path.length ? path : undefined,
      range: refRange(expression, match.index!, match.index! + raw.length, base),
    });
  }
  return results;
}
