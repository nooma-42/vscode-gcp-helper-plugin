# Architecture

Terraform Blast Radius separates local Terraform analysis from presentation in VS Code. The analyzer returns stable data structures and JSON; it has no dependency on the VS Code API.

## Data flow

```text
Workspace scanner
  │  local .tf text and source paths
  ▼
Tolerant HCL parser
  │  blocks, expressions, and source ranges
  ▼
Terraform IR and reference extractor
  │  resources, data, modules, variables, locals, outputs, references
  ▼
Dependency graph ◀──── Git HEAD / working-tree detector
  │                     identifies configuration changes
  ▼
Breadth-first impact traversal
  │  direct and transitive paths, cycle-safe and depth-limited
  ▼
GCP semantic rules
  │  categories, severity, inferred relationships, recommendations
  ▼
Analysis report
  ├── VS Code CodeLens, hover, tree view, and navigation
  └── redacted JSON export
```

## Graph semantics

Edges point from the referenced node to the node that depends on it:

```hcl
resource "google_compute_subnetwork" "gke" {
  network = google_compute_network.main.id
}
```

```text
google_compute_network.main → google_compute_subnetwork.gke
```

This orientation lets breadth-first traversal start at a changed resource and discover potential dependants. Each edge records its evidence: expression, `depends_on`, module boundary, or semantic inference. Source-backed edges are confirmed; GCP domain rules can add clearly labelled inferred results.

Locals and module inputs/outputs can be retained as intermediate graph nodes while paths are calculated. User-facing reports may collapse those nodes as long as they preserve the complete explanation.

## Parser boundary

Parsing is tolerant because users routinely pause with invalid HCL while editing. A failed block or file contributes diagnostics and partial results where possible. It does not invalidate successfully parsed files. The intermediate representation stores source ranges and original expression text without exposing parser-specific syntax nodes to graph or UI code.

Static extraction finds references without evaluating final values. Conditional expressions, interpolations, collections, `count`, and `for_each` are inspected for references, but their runtime cardinality and values are not predicted.

## Change detection

Current-resource analysis uses the cursor and source ranges. Changed-resource analysis compares working-tree Terraform blocks with their `HEAD` versions and reports configuration vocabulary:

- `configuration-added`
- `configuration-removed`
- `configuration-modified`
- `dependency-modified`

The detector does not describe Terraform lifecycle actions. Only a Terraform plan can determine create, update, replacement, or destruction.

## Performance and resilience

The workspace cache is keyed by file. An edit reparses that file, removes its prior nodes and edges, merges the replacement result, and recomputes related impacts after a short debounce. Traversal uses a visited set to stop cycles and defaults to a bounded display depth.

The intended MVP targets are under two seconds for an initial 100-file workspace and under 500 ms for a single-file refresh. Parse errors become diagnostics rather than extension failures.

## Trust boundary

All analyzer inputs are local source text and optional local Git history. It has no GCP client, credential reader, state reader, Terraform subprocess, remote module downloader, or telemetry transport. See [`PRIVACY.md`](../PRIVACY.md).
