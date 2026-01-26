# Terraform Blast Radius

Terraform Blast Radius is a VS Code extension that shows which Terraform and Google Cloud resources may depend on the resource you are editing. It performs static analysis of local `.tf` files, builds a dependency graph, and explains every path it reports.

The extension is designed to answer a focused question before you run a plan:

> Which resource configurations could be affected by this change, and why?

It does not predict the result of `terraform apply`. Treat its output as an early review aid and use `terraform plan` to determine whether Terraform will create, update, replace, or destroy infrastructure.

## What it shows

- CodeLens summaries above Terraform resources
- A `Terraform Blast Radius` sidebar with direct and transitive dependants
- Hover details for Terraform references
- Source paths that explain how one resource leads to another
- GCP-specific impact categories and cautious recommendations
- Changed resources detected from the Git working tree
- JSON reports suitable for review or later CI integration

The first supported demo path is:

```text
VPC
├── Subnet
│   └── GKE cluster
│       └── Node pool
├── Firewall
└── Private Service Access
    └── Cloud SQL
```

## Privacy and data access

**Static Analysis mode does not access GCP, Terraform state, cloud credentials, or remote APIs.**

Analysis runs locally against Terraform source files in the open workspace. The extension does not log in to Google Cloud, run `terraform plan` or `terraform apply`, download remote modules, upload source code, or enable telemetry. It does not read `.tfstate` files. It ignores `.tfvars` unless the user opens one explicitly in the editor.

See [PRIVACY.md](PRIVACY.md) for the complete data-handling statement.

## Requirements

- VS Code 1.95 or later
- Node.js 20 or later for development
- Git for changed-resource analysis

Terraform and Google Cloud credentials are not required.

## Install and use

For a packaged build, install the generated `.vsix` from VS Code with **Extensions: Install from VSIX...**. Open a folder containing Terraform files and use one of these commands from the Command Palette:

- `Terraform Blast Radius: Analyze Current Resource`
- `Terraform Blast Radius: Analyze Changed Resources`
- `Terraform Blast Radius: Analyze Entire Workspace`
- `Terraform Blast Radius: Refresh`
- `Terraform Blast Radius: Export Report`

Place the cursor inside a `resource` block and run **Analyze Current Resource** for the most predictable starting point. Select a result in the sidebar to open its definition. Hover over a reference to see the dependency and resources reachable from it.

The extension scans `.tf` files under the workspace and excludes `.terraform` directories. It refreshes after source edits; the Refresh command forces a complete rebuild.

## Reading the result

Every finding has a confidence level:

| Confidence | Meaning |
| --- | --- |
| **CONFIRMED** | A source expression or `depends_on` directly references the resource. |
| **TRANSITIVE** | The resource is reached through one or more confirmed dependencies. |
| **INFERRED** | A GCP rule found a likely relationship that is not expressed as a direct Terraform reference. |
| **UNKNOWN** | The expression could not be resolved by local static analysis. |

The graph direction is from a dependency to its dependant. If a subnet references a VPC, the graph contains `VPC → Subnet`; starting at the VPC therefore reveals the subnet in its potential blast radius.

Severity describes the kind of relationship and the affected GCP concern. It is not a prediction of downtime or of a Terraform lifecycle action.

## Limitations

- Results describe configuration dependencies, not live infrastructure changes.
- No provider schema, state, plan, or runtime values are evaluated.
- Variable values and complex expressions are not fully evaluated.
- Local modules are supported; remote Registry and Git modules are not downloaded or inspected.
- Dynamic block expansion, Terragrunt, CDK for Terraform, and provider-specific OpenTofu behavior are outside the MVP.
- Inferred findings can contain false positives and are always labelled `INFERRED`.
- A renamed resource may appear as one removed configuration and one added configuration.
- Syntax errors produce partial results where possible; an incomplete file can omit references.
- Results are depth-limited to keep large repositories usable.

Always inspect a Terraform plan before applying a change.

## Demo

1. Open the repository's `fixtures/demo` folder in VS Code.
2. Put the cursor in `google_compute_network.main` and run **Analyze Current Resource**.
3. Confirm that the sidebar shows the subnet, firewall, private service connection, GKE cluster, node pool, and Cloud SQL instance.
4. Select the GKE cluster to inspect the `network → subnet → cluster` path.
5. Select Cloud SQL to inspect the private-connectivity path.
6. Edit the VPC description and save. The CodeLens and sidebar should refresh without contacting GCP.
7. Run **Export Report** to inspect the local JSON result.
8. Run `terraform plan` separately if you need actual lifecycle decisions.

The smaller projects under [`fixtures/`](fixtures/) isolate parser, graph, module, Git-diff, and error-recovery behavior.

## Development

Install dependencies and build all workspaces:

```sh
npm install
npm run build
```

Open this repository in VS Code and press **F5** to launch an Extension Development Host. Open one of the fixture folders in that window to test the UI.

Useful commands:

```sh
npm run check     # Type-check all workspaces
npm test          # Run unit, fixture, and integration tests that are present
npm run build     # Compile analyzer and extension packages
npm run package   # Produce the VS Code .vsix package
```

Fixture files intentionally include baselines for deletion and rename detection, plus malformed HCL. They are test inputs and should not be applied to a GCP project.

## Architecture

The analyzer is independent of VS Code:

```text
Local .tf files
  → tolerant HCL parser
  → Terraform intermediate representation
  → reference extraction
  → dependency graph
  → changed-resource detection
  → impact traversal and GCP rules
  → editor UI or JSON report
```

The analyzer package owns scanning, parsing, graph construction, change detection, rule evaluation, and report generation. The VS Code package adapts those results into CodeLens, hover, tree-view, navigation, commands, and workspace refresh behavior. This separation keeps the core reusable by a future CLI, CI job, or language server.

See [docs/architecture.md](docs/architecture.md) for the data flow and design boundaries, and [fixtures/README.md](fixtures/README.md) for the fixture catalogue.

## Contributing

Keep analyzer behavior deterministic and editor-independent. A confirmed edge must be backed by source syntax, inferred edges must remain visibly labelled, and parser errors in one file must not stop analysis of the rest of the workspace. Add or update a focused fixture when changing parsing, graph, diff, or rule behavior.

## License

[MIT](LICENSE)
