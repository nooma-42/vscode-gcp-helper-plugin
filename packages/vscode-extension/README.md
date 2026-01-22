# Terraform Blast Radius

Terraform Blast Radius shows which Terraform and Google Cloud resource configurations may depend on the resource you are editing. It analyzes local `.tf` files, displays direct and transitive dependency paths in VS Code, and explains why each result appears.

Static Analysis mode does not access GCP, Terraform state, cloud credentials, or remote APIs. It does not run Terraform, upload source, or enable telemetry.

Use the Command Palette to analyze the current resource, Git working-tree changes, or the complete workspace. CodeLens shows the potential blast-radius count; the sidebar groups direct, transitive, and inferred effects; selecting a result opens its Terraform definition. Exported JSON reports redact common secret keys and credential patterns.

Results describe potential code-level effects. Run `terraform plan` separately to determine whether Terraform will create, update, replace, or destroy infrastructure.

See the project README for architecture, development instructions, supported GCP resources, fixtures, and detailed limitations.
