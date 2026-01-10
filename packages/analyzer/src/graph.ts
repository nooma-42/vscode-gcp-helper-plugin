import type { DependencyEdge, ParsedTerraformFile, TerraformResource } from "./types";

export interface TraversalHit { address: string; depth: number; paths: string[][]; edges: DependencyEdge[] }
export interface TraversalResult { hits: TraversalHit[]; cycles: string[][] }

export class DependencyGraph {
  readonly nodes = new Map<string, TerraformResource>();
  private readonly outgoing = new Map<string, DependencyEdge[]>();

  constructor(files: ParsedTerraformFile[] = []) { this.rebuild(files); }

  rebuild(files: ParsedTerraformFile[]): void {
    this.nodes.clear(); this.outgoing.clear();
    for (const file of files) for (const resource of file.resources) this.nodes.set(resource.address, resource);
    for (const resource of this.nodes.values()) {
      for (const attribute of resource.attributes) {
        for (const reference of attribute.references) {
          if (reference.address === resource.address) continue;
          this.addEdge({
            source: reference.address, target: resource.address,
            kind: attribute.name === "depends_on" ? "depends_on" : resource.kind === "module" || reference.address.startsWith("module.") ? "module" : "expression",
            attribute: attribute.name, confidence: "confirmed", file: resource.file,
          });
        }
      }
    }
  }

  addEdge(edge: DependencyEdge): void {
    const edges = this.outgoing.get(edge.source) ?? [];
    if (!edges.some((e) => e.target === edge.target && e.kind === edge.kind && e.attribute === edge.attribute)) edges.push(edge);
    this.outgoing.set(edge.source, edges);
  }

  edgesFrom(address: string): readonly DependencyEdge[] { return this.outgoing.get(address) ?? []; }
  allEdges(): DependencyEdge[] { return [...this.outgoing.values()].flat(); }

  traverse(start: string, maxDepth = 5): TraversalResult {
    const hits = new Map<string, TraversalHit>();
    const cycles: string[][] = [];
    const queue: Array<{ address: string; path: string[]; edges: DependencyEdge[] }> = [{ address: start, path: [start], edges: [] }];
    const minDepth = new Map<string, number>([[start, 0]]);
    while (queue.length) {
      const current = queue.shift()!;
      const depth = current.path.length - 1;
      if (depth >= maxDepth) continue;
      for (const edge of this.edgesFrom(current.address)) {
        const cycleAt = current.path.indexOf(edge.target);
        if (cycleAt >= 0) {
          const cycle = [...current.path.slice(cycleAt), edge.target];
          if (!cycles.some((c) => c.join("|") === cycle.join("|"))) cycles.push(cycle);
          continue;
        }
        const path = [...current.path, edge.target];
        const nextEdges = [...current.edges, edge];
        const nextDepth = depth + 1;
        const existing = hits.get(edge.target);
        if (!existing) hits.set(edge.target, { address: edge.target, depth: nextDepth, paths: [path], edges: nextEdges });
        else if (!existing.paths.some((p) => p.join("|") === path.join("|"))) existing.paths.push(path);
        const prior = minDepth.get(edge.target);
        if (prior === undefined || nextDepth < prior) {
          minDepth.set(edge.target, nextDepth);
          queue.push({ address: edge.target, path, edges: nextEdges });
        } else if (nextDepth <= maxDepth && nextDepth === prior) {
          queue.push({ address: edge.target, path, edges: nextEdges });
        }
      }
    }
    return { hits: [...hits.values()].sort((a, b) => a.depth - b.depth || a.address.localeCompare(b.address)), cycles };
  }
}
