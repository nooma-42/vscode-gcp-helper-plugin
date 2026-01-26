# Privacy

Terraform Blast Radius analyzes Terraform configuration on the user's machine.

**Static Analysis mode does not access GCP, Terraform state, cloud credentials, or remote APIs.**

## Data the extension reads

The extension reads local `.tf` files in the open VS Code workspace to build a source-level dependency graph. Changed-resource analysis also reads local Git metadata and the `HEAD` version of Terraform files. A `.tfvars` file is not included in workspace analysis unless the user explicitly opens it in the editor.

## Data the extension does not access

The extension does not:

- authenticate to Google Cloud or read Application Default Credentials;
- call Google Cloud, Terraform Registry, or other remote APIs;
- read Terraform state, state backups, or remote state;
- run `terraform plan`, `terraform apply`, or provider plugins;
- download remote modules;
- upload Terraform source, analysis results, file paths, or identifiers; or
- collect telemetry. Telemetry is disabled by default and is not implemented in the MVP.

## Reports

Exported reports are created only after the user invokes the export command and are written to a location the user chooses. Reports describe resource addresses, dependency paths, source locations, confidence, and limitations. Secret-like literal values should be redacted before they are written. Users should still review a report before sharing it because resource names and repository structure can be sensitive.

## Network behavior

The extension requires no network connection for analysis. Installing or updating the extension and installing development dependencies are actions performed by VS Code or the package manager, outside the analyzer's runtime behavior.

## Security reports

Do not include credentials, state files, or private Terraform source in a public issue. Report a suspected data-handling vulnerability privately to the project maintainers.
