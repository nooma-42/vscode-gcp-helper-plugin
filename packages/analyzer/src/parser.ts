import { extractReferences } from "./references";
import type { ParsedTerraformFile, SourcePosition, SourceRange, TerraformAttribute, TerraformNodeKind, TerraformResource } from "./types";

interface BlockToken { type: string; labels: string[]; bodyStart: number; end: number; start: number; complete: boolean }

function position(source: string, offset: number): SourcePosition {
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return { line: lines.length - 1, column: lines.at(-1)!.length, offset };
}

function range(source: string, start: number, end: number): SourceRange {
  return { start: position(source, start), end: position(source, end) };
}

function skipTrivia(source: string, index: number): number {
  while (index < source.length) {
    if (/\s/.test(source[index])) { index++; continue; }
    if (source.startsWith("#", index) || source.startsWith("//", index)) {
      const nl = source.indexOf("\n", index);
      return nl < 0 ? source.length : skipTrivia(source, nl + 1);
    }
    if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }
    break;
  }
  return index;
}

function quoted(source: string, index: number): { value: string; end: number } | undefined {
  if (source[index] !== '"') return undefined;
  let value = "";
  for (let i = index + 1; i < source.length; i++) {
    if (source[i] === "\\") { value += source[i + 1] ?? ""; i++; continue; }
    if (source[i] === '"') return { value, end: i + 1 };
    value += source[i];
  }
  return undefined;
}

function matchingBrace(source: string, open: number): { end: number; complete: boolean } {
  let depth = 1;
  let quote = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open + 1; i < source.length; i++) {
    const c = source[i], n = source[i + 1];
    if (lineComment) { if (c === "\n") lineComment = false; continue; }
    if (blockComment) { if (c === "*" && n === "/") { blockComment = false; i++; } continue; }
    if (quote) { if (c === "\\") i++; else if (c === '"') quote = false; continue; }
    if (c === '"') { quote = true; continue; }
    if (c === "#" || (c === "/" && n === "/")) { lineComment = true; if (c === "/") i++; continue; }
    if (c === "/" && n === "*") { blockComment = true; i++; continue; }
    if (c === "{") depth++;
    if (c === "}" && --depth === 0) return { end: i + 1, complete: true };
  }
  return { end: source.length, complete: false };
}

function scanBlocks(source: string, from = 0, to = source.length): BlockToken[] {
  const blocks: BlockToken[] = [];
  let i = from;
  while (i < to) {
    i = skipTrivia(source, i);
    const id = /^[A-Za-z_][\w-]*/.exec(source.slice(i));
    if (!id) { i++; continue; }
    const start = i;
    const type = id[0];
    i += type.length;
    const labels: string[] = [];
    for (;;) {
      i = skipTrivia(source, i);
      const q = quoted(source, i);
      if (!q) break;
      labels.push(q.value); i = q.end;
    }
    i = skipTrivia(source, i);
    if (source[i] !== "{") {
      const eq = source.indexOf("=", i);
      const nl = source.indexOf("\n", i);
      i = nl < 0 ? to : nl + 1;
      if (eq >= 0 && (nl < 0 || eq < nl)) continue;
      continue;
    }
    const match = matchingBrace(source, i);
    blocks.push({ type, labels, bodyStart: i + 1, end: Math.min(match.end, to), start, complete: match.complete });
    i = match.end;
  }
  return blocks;
}

function expressionEnd(source: string, start: number, limit: number): number {
  let square = 0, curly = 0, paren = 0, quote = false;
  for (let i = start; i < limit; i++) {
    const c = source[i];
    if (quote) { if (c === "\\") i++; else if (c === '"') quote = false; continue; }
    if (c === '"') { quote = true; continue; }
    if (c === "[") square++; else if (c === "]") square--;
    else if (c === "{") curly++; else if (c === "}") { if (curly === 0) return i; curly--; }
    else if (c === "(") paren++; else if (c === ")") paren--;
    else if (c === "\n" && square === 0 && curly === 0 && paren === 0) return i;
  }
  return limit;
}

function parseAttributes(source: string, start: number, end: number, prefix = ""): TerraformAttribute[] {
  const attributes: TerraformAttribute[] = [];
  let i = start;
  while (i < end) {
    i = skipTrivia(source, i);
    const id = /^[A-Za-z_][\w-]*/.exec(source.slice(i));
    if (!id) { i++; continue; }
    const nameStart = i, name = id[0];
    i += name.length;
    let cursor = skipTrivia(source, i);
    if (source[cursor] === "=") {
      const valueStart = skipTrivia(source, cursor + 1);
      const valueEnd = expressionEnd(source, valueStart, end);
      const expression = source.slice(valueStart, valueEnd).trimEnd();
      const base = position(source, valueStart);
      attributes.push({ name: prefix + name, expression, references: extractReferences(expression, base), range: range(source, nameStart, valueEnd) });
      i = Math.max(valueEnd + 1, cursor + 1);
      continue;
    }
    const label = quoted(source, cursor);
    if (label) cursor = skipTrivia(source, label.end);
    if (source[cursor] === "{") {
      const match = matchingBrace(source, cursor);
      attributes.push(...parseAttributes(source, cursor + 1, Math.min(match.end - (match.complete ? 1 : 0), end), `${prefix}${name}.`));
      i = match.end;
      continue;
    }
    const nl = source.indexOf("\n", i);
    i = nl < 0 ? end : nl + 1;
  }
  return attributes;
}

function resourceAddress(type: string, labels: string[]): { kind: TerraformNodeKind; address: string; resourceType: string; name: string } | undefined {
  if (type === "resource" && labels.length >= 2) return { kind: "resource", address: `${labels[0]}.${labels[1]}`, resourceType: labels[0], name: labels[1] };
  if (type === "data" && labels.length >= 2) return { kind: "data", address: `data.${labels[0]}.${labels[1]}`, resourceType: labels[0], name: labels[1] };
  if (["module", "variable", "output"].includes(type) && labels[0]) {
    const prefix = type === "variable" ? "var" : type;
    return { kind: type as TerraformNodeKind, address: `${prefix}.${labels[0]}`, resourceType: type, name: labels[0] };
  }
  return undefined;
}

export function parseTerraform(source: string, file = "unknown.tf"): ParsedTerraformFile {
  const resources: TerraformResource[] = [];
  const diagnostics: ParsedTerraformFile["diagnostics"] = [];
  for (const block of scanBlocks(source)) {
    if (!block.complete) diagnostics.push({ file, severity: "warning", message: `Incomplete ${block.type} block; analyzed available content.`, range: range(source, block.start, block.end) });
    const bodyEnd = block.end - (block.complete ? 1 : 0);
    const attributes = parseAttributes(source, block.bodyStart, bodyEnd);
    if (block.type === "locals") {
      for (const attr of attributes.filter((a) => !a.name.includes("."))) {
        resources.push({ address: `local.${attr.name}`, kind: "local", type: "local", name: attr.name, file, range: attr.range, attributes: [attr], explicitDependencies: [] });
      }
      continue;
    }
    const info = resourceAddress(block.type, block.labels);
    if (!info) continue;
    const depends = attributes.find((a) => a.name === "depends_on")?.references.map((r) => r.address) ?? [];
    const sourceAttr = attributes.find((a) => a.name === "source")?.expression.match(/^\s*"([^"]+)"/)?.[1];
    resources.push({
      address: info.address, kind: info.kind, type: info.resourceType, name: info.name, file,
      range: range(source, block.start, block.end), attributes, explicitDependencies: [...new Set(depends)], source: sourceAttr,
    });
  }
  return { file, resources, diagnostics };
}

export function findResourceAtOffset(parsed: ParsedTerraformFile, offset: number): TerraformResource | undefined {
  return parsed.resources.find((resource) => resource.range.start.offset <= offset && resource.range.end.offset >= offset);
}
