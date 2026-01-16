import { describe, expect, it } from "vitest";
import { GCP_RULES, applyImpactRules, inferSemanticEdges, parseTerraform } from "./index";

describe("GCP impact rules", () => {
  it("ships at least 15 independently identified rules", () => {
    expect(GCP_RULES.length).toBeGreaterThanOrEqual(15);
    expect(new Set(GCP_RULES.map((r) => r.id)).size).toBe(GCP_RULES.length);
  });

  it.each([
    ["google_compute_network", "google_compute_subnetwork", "vpc-subnet"],
    ["google_compute_network", "google_compute_firewall", "vpc-firewall"],
    ["google_compute_network", "google_compute_router", "vpc-router"],
    ["google_compute_network", "google_compute_global_address", "vpc-private-address"],
    ["google_compute_network", "google_service_networking_connection", "vpc-service-networking"],
    ["google_compute_network", "google_container_cluster", "vpc-gke"],
    ["google_compute_network", "google_sql_database_instance", "vpc-sql"],
    ["google_compute_subnetwork", "google_container_cluster", "subnet-gke"],
    ["google_compute_firewall", "google_container_cluster", "firewall-gke"],
    ["google_compute_router", "google_compute_router_nat", "router-nat"],
    ["google_compute_router_nat", "google_container_node_pool", "nat-gke"],
    ["google_container_cluster", "google_container_node_pool", "gke-node-pool"],
    ["google_sql_database_instance", "google_sql_database", "sql-database"],
    ["google_sql_database_instance", "google_sql_user", "sql-user"],
    ["google_service_networking_connection", "google_sql_database_instance", "service-networking-sql"],
    ["google_compute_global_address", "google_service_networking_connection", "address-service-networking"],
  ])("matches %s to %s", (sourceType, targetType, id) => {
    const source = parseTerraform(`resource "${sourceType}" "source" { name = "x" }`, "a.tf").resources[0];
    const target = parseTerraform(`resource "${targetType}" "target" { name = "x" }`, "b.tf").resources[0];
    expect(applyImpactRules(source, target).map((match) => match.ruleId)).toContain(id);
  });

  it("creates inferred shared-network edges with inferred confidence", () => {
    const parsed = parseTerraform(`
resource "google_compute_firewall" "rules" { network = google_compute_network.main.id }
resource "google_container_cluster" "gke" { network = google_compute_network.main.id }
`, "main.tf");
    expect(inferSemanticEdges(parsed.resources)).toContainEqual(expect.objectContaining({
      source: "google_compute_firewall.rules", target: "google_container_cluster.gke", confidence: "inferred",
    }));
  });
});
