# Terraform fixtures

These projects are deliberately small and are intended for parser, graph, rule, diff, and UI tests. They use plausible Google provider syntax but omit provider configuration and should not be applied.

| Fixture | Coverage | Expected relationship |
| --- | --- | --- |
| `demo` | Full MVP demonstration | VPC → subnet → GKE → node pool; VPC → firewall; VPC → private service access → Cloud SQL |
| `simple-vpc` | Locals, interpolation, `for_each`, explicit dependency | VPC → subnet/firewalls; local chain preserves the VPC source |
| `gke` | Nested blocks and collection expressions | Subnet → cluster → node pool |
| `cloud-sql` | Private Service Access | VPC → address/connection → Cloud SQL |
| `modules` | Local module inputs and outputs | Root VPC → module input → child subnet → module output → root firewall |
| `git-diff/rename` | Address rename baseline | `google_compute_network.old` removed and `.main` added |
| `git-diff/deletion` | Resource deletion baseline | `google_compute_firewall.legacy` removed |
| `broken` | Tolerant parsing | Valid resources remain available beside incomplete HCL |

The `head` and `working-tree` directories model two sides of a diff. Tests can read them directly instead of requiring a fixture to be a Git repository.

No fixture needs GCP credentials, Terraform state, a backend, or network access.
