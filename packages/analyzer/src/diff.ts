import type { ParsedTerraformFile, ResourceChange, TerraformResource } from "./types";

function index(files: ParsedTerraformFile[]): Map<string, TerraformResource> {
  return new Map(files.flatMap((file) => file.resources.map((resource) => [resource.address, resource] as const)));
}

function attrs(resource: TerraformResource): Map<string, string> {
  return new Map(resource.attributes.map((attribute) => [attribute.name, attribute.expression.trim()]));
}

function refSignature(resource: TerraformResource): string {
  return resource.attributes.flatMap((attribute) => attribute.references.map((ref) => `${attribute.name}:${ref.address}:${ref.attributePath?.join(".") ?? ""}`)).sort().join("|");
}

export function diffTerraform(beforeFiles: ParsedTerraformFile[], afterFiles: ParsedTerraformFile[]): ResourceChange[] {
  const before = index(beforeFiles), after = index(afterFiles);
  const changes: ResourceChange[] = [];
  for (const address of [...new Set([...before.keys(), ...after.keys()])].sort()) {
    const oldResource = before.get(address), newResource = after.get(address);
    if (!oldResource && newResource) { changes.push({ address, changeType: "configuration-added", changedAttributes: newResource.attributes.map((a) => a.name), after: newResource }); continue; }
    if (oldResource && !newResource) { changes.push({ address, changeType: "configuration-removed", changedAttributes: oldResource.attributes.map((a) => a.name), before: oldResource }); continue; }
    const oldAttrs = attrs(oldResource!), newAttrs = attrs(newResource!);
    const changedAttributes = [...new Set([...oldAttrs.keys(), ...newAttrs.keys()])].filter((name) => oldAttrs.get(name) !== newAttrs.get(name)).sort();
    if (!changedAttributes.length) continue;
    const changeType = refSignature(oldResource!) !== refSignature(newResource!) ? "dependency-modified" : "configuration-modified";
    changes.push({ address, changeType, changedAttributes, before: oldResource, after: newResource });
  }
  return changes;
}

export interface GitNameStatus { status: "added" | "modified" | "deleted" | "renamed"; path: string; oldPath?: string }

/** Parses `git diff --name-status -z` output; command execution stays with the host application. */
export function parseGitNameStatus(output: string): GitNameStatus[] {
  const parts = output.split("\0").filter(Boolean);
  const result: GitNameStatus[] = [];
  for (let i = 0; i < parts.length;) {
    const status = parts[i++];
    if (/^R/.test(status)) { const oldPath = parts[i++], path = parts[i++]; if (oldPath && path) result.push({ status: "renamed", oldPath, path }); }
    else { const path = parts[i++]; if (path) result.push({ status: status === "A" ? "added" : status === "D" ? "deleted" : "modified", path }); }
  }
  return result;
}
