# Changelog

All notable changes to Terraform Blast Radius are documented here. This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and uses semantic versioning.

## [Unreleased]

### Added

- Local Terraform workspace scanning with `.terraform` exclusion.
- Tolerant HCL parsing into an editor-independent intermediate representation.
- Dependency extraction for resource expressions, `depends_on`, locals, local module inputs, and module outputs.
- Direct and transitive blast-radius traversal with cycle protection and depth limits.
- Git working-tree detection for added, removed, modified, and dependency-modified resource configuration.
- GCP impact rules for VPC, subnet, firewall, private service access, GKE, and Cloud SQL relationships.
- Explicit `CONFIRMED`, `TRANSITIVE`, `INFERRED`, and `UNKNOWN` confidence labels.
- VS Code CodeLens, hover details, tree view, source navigation, refresh, and JSON export commands.
- Terraform fixtures for the initial demo, modules, locals, `for_each`, rename/deletion baselines, and incomplete HCL.
- Local-only privacy statement and static-analysis limitations.

## [0.1.0] - 2026-09-30

### Added

- Initial MVP project structure.
