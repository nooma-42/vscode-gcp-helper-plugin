import { describe, expect, it } from "vitest";
import { IncrementalWorkspaceAnalyzer, redactSecrets, serializeReport } from "./index";

describe("IncrementalWorkspaceAnalyzer", () => {
  it("updates only the supplied file and produces explanatory reports", () => {
    const analyzer = new IncrementalWorkspaceAnalyzer({ inferSemanticDependencies: false });
    analyzer.updateFiles({
      "network.tf": `resource "google_compute_network" "main" { name = "prod" }`,
      "gke.tf": `resource "google_compute_subnetwork" "gke" { network = google_compute_network.main.id }\nresource "google_container_cluster" "prod" { subnetwork = google_compute_subnetwork.gke.id }`,
    });
    const report = analyzer.analyze("google_compute_network.main");
    expect(report.affectedResources.map((r) => [r.address, r.depth, r.confidence])).toEqual([
      ["google_compute_subnetwork.gke", 1, "confirmed"],
      ["google_container_cluster.prod", 2, "transitive"],
    ]);
    expect(report.affectedResources[0].categories).toContain("network-topology");
    analyzer.updateFile("gke.tf", `resource "google_compute_subnetwork" "other" { network = google_compute_network.main.id }`);
    expect(analyzer.getResource("google_container_cluster.prod")).toBeUndefined();
  });

  it("compares current files to supplied HEAD contents", () => {
    const analyzer = new IncrementalWorkspaceAnalyzer();
    analyzer.updateFile("main.tf", `resource "google_compute_network" "main" { name = "new" }`);
    const analyses = analyzer.analyzeChanges({ "main.tf": `resource "google_compute_network" "main" { name = "old" }` });
    expect(analyses[0].change).toMatchObject({ address: "google_compute_network.main", changeType: "configuration-modified", changedAttributes: ["name"] });
  });

  it("uses the previous graph to report dependents of removed resources", () => {
    const analyzer = new IncrementalWorkspaceAnalyzer();
    analyzer.updateFile("main.tf", `resource "google_compute_subnetwork" "sub" { network = google_compute_network.main.id }`);
    const analyses = analyzer.analyzeChanges({
      "main.tf": `resource "google_compute_network" "main" { name = "old" }\nresource "google_compute_subnetwork" "sub" { network = google_compute_network.main.id }`,
    });
    const removal = analyses.find((item) => item.change.changeType === "configuration-removed")!;
    expect(removal.report.affectedResources[0].address).toBe("google_compute_subnetwork.sub");
  });

  it("traverses through local module inputs and outputs", () => {
    const analyzer = new IncrementalWorkspaceAnalyzer({ inferSemanticDependencies: false });
    analyzer.updateFiles({
      "/repo/main.tf": `
resource "google_compute_network" "main" { name = "prod" }
module "networking" {
  source = "./modules/networking"
  network_id = google_compute_network.main.id
}
resource "google_compute_firewall" "internal" {
  network = google_compute_network.main.id
  source_ranges = [module.networking.subnet_cidr]
}`,
      "/repo/modules/networking/variables.tf": `variable "network_id" { type = string }`,
      "/repo/modules/networking/main.tf": `resource "google_compute_subnetwork" "main" { network = var.network_id }`,
      "/repo/modules/networking/outputs.tf": `output "subnet_cidr" { value = google_compute_subnetwork.main.ip_cidr_range }`,
    });

    const report = analyzer.analyze("google_compute_network.main", { maxDepth: 6 });
    expect(report.affectedResources.map((resource) => resource.address)).toContain("google_compute_subnetwork.main");
    expect(report.affectedResources.find((resource) => resource.address === "google_compute_firewall.internal")?.paths)
      .toContainEqual([
        "google_compute_network.main",
        "var.network_id",
        "google_compute_subnetwork.main",
        "output.subnet_cidr",
        "google_compute_firewall.internal",
      ]);
    expect(report.affectedResources.map((resource) => resource.address)).not.toContain("var.network_id");
    expect(report.affectedResources.map((resource) => resource.address)).not.toContain("output.subnet_cidr");
  });

  it("redacts secret-shaped keys and well-known credential values", () => {
    const value = { password: "hello", nested: { note: "Bearer abc.def_123", safe: "network" } };
    expect(redactSecrets(value)).toEqual({ password: "[REDACTED]", nested: { note: "[REDACTED]", safe: "network" } });
    expect(serializeReport({ password: "hello" } as never)).not.toContain("hello");
  });
});
