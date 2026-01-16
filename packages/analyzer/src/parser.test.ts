import { describe, expect, it } from "vitest";
import { extractReferences, findResourceAtOffset, parseTerraform } from "./index";

describe("Terraform parser", () => {
  it("parses all supported declaration kinds and nested attributes", () => {
    const source = `
variable "project" { type = string }
locals { network_id = google_compute_network.main.id }
resource "google_compute_network" "main" { name = "prod" }
data "google_project" "current" { project_id = var.project }
module "gke" {
  source = "./modules/gke"
  network = local.network_id
  for_each = { prod = true }
}
resource "google_sql_database_instance" "db" {
  settings {
    ip_configuration { private_network = google_compute_network.main.id }
  }
  depends_on = [module.gke]
}
output "network" { value = google_compute_network.main.id }
`;
    const parsed = parseTerraform(source, "main.tf");
    expect(parsed.resources.map((r) => r.address)).toEqual([
      "var.project", "local.network_id", "google_compute_network.main", "data.google_project.current",
      "module.gke", "google_sql_database_instance.db", "output.network",
    ]);
    const sql = parsed.resources.find((r) => r.address === "google_sql_database_instance.db")!;
    expect(sql.attributes.find((a) => a.name === "settings.ip_configuration.private_network")?.references[0].address).toBe("google_compute_network.main");
    expect(sql.explicitDependencies).toEqual(["module.gke"]);
    expect(findResourceAtOffset(parsed, source.indexOf("private_network"))?.address).toBe("google_sql_database_instance.db");
  });

  it("extracts references from interpolation, conditionals, count and for_each expressions", () => {
    const expression = `var.enabled ? "${"${google_compute_network.main.id}"}" : join(",", [for x in local.items : data.google_project.current.number])`;
    expect(extractReferences(expression).map((r) => r.address)).toEqual([
      "var.enabled", "google_compute_network.main", "local.items", "data.google_project.current",
    ]);
  });

  it("does not mistake dotted literal strings for Terraform traversals", () => {
    expect(extractReferences(`"service.example.com"`)).toEqual([]);
    expect(extractReferences(`"${"${module.dns.name}"}"`)[0].address).toBe("module.dns");
  });

  it("returns useful partial output for incomplete editing state", () => {
    const parsed = parseTerraform(`resource "google_compute_subnetwork" "gke" {\n network = google_compute_network.main.id`, "broken.tf");
    expect(parsed.resources[0].address).toBe("google_compute_subnetwork.gke");
    expect(parsed.resources[0].attributes[0].references[0].address).toBe("google_compute_network.main");
    expect(parsed.diagnostics[0].message).toContain("Incomplete resource block");
  });
});
