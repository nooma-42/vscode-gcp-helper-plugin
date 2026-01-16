import { describe, expect, it } from "vitest";
import { DependencyGraph, parseTerraform } from "./index";

describe("DependencyGraph", () => {
  it("builds dependency-to-dependent edges and traverses breadth first", () => {
    const parsed = parseTerraform(`
resource "google_compute_network" "main" { name = "prod" }
resource "google_compute_subnetwork" "gke" { network = google_compute_network.main.id }
resource "google_container_cluster" "prod" { subnetwork = google_compute_subnetwork.gke.id }
resource "google_container_node_pool" "primary" { cluster = google_container_cluster.prod.name }
`, "main.tf");
    const graph = new DependencyGraph([parsed]);
    expect(graph.edgesFrom("google_compute_network.main")[0].target).toBe("google_compute_subnetwork.gke");
    const result = graph.traverse("google_compute_network.main", 2);
    expect(result.hits.map((h) => [h.address, h.depth])).toEqual([
      ["google_compute_subnetwork.gke", 1], ["google_container_cluster.prod", 2],
    ]);
  });

  it("handles cycles without repeating results", () => {
    const parsed = parseTerraform(`
locals {
  a = local.b
  b = local.a
}
resource "google_compute_network" "main" { name = local.a }
`, "cycle.tf");
    const result = new DependencyGraph([parsed]).traverse("local.a");
    expect(result.hits.map((h) => h.address).sort()).toEqual(["google_compute_network.main", "local.b"]);
    expect(result.cycles).toEqual([["local.a", "local.b", "local.a"]]);
  });

  it("links module inputs and output references through the module node", () => {
    const parsed = parseTerraform(`
resource "google_compute_network" "main" { name = "prod" }
module "gke" {
  source = "./gke"
  network = google_compute_network.main.id
}
output "endpoint" { value = module.gke.endpoint }
`, "modules.tf");
    const graph = new DependencyGraph([parsed]);
    expect(graph.edgesFrom("google_compute_network.main")).toContainEqual(expect.objectContaining({ target: "module.gke", kind: "module" }));
    expect(graph.edgesFrom("module.gke")).toContainEqual(expect.objectContaining({ target: "output.endpoint", kind: "module" }));
  });
});
