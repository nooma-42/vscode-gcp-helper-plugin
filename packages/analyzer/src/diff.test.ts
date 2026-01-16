import { describe, expect, it } from "vitest";
import { diffTerraform, parseGitNameStatus, parseTerraform } from "./index";

describe("change primitives", () => {
  it("classifies additions, removals, attribute and dependency changes", () => {
    const before = [parseTerraform(`
resource "google_compute_network" "old" { name = "old" }
resource "google_compute_network" "main" { name = "before" }
resource "google_compute_subnetwork" "sub" { network = google_compute_network.main.id }
`, "main.tf")];
    const after = [parseTerraform(`
resource "google_compute_network" "main" { name = "after" }
resource "google_compute_subnetwork" "sub" { network = google_compute_network.other.id }
resource "google_compute_firewall" "allow" { network = google_compute_network.main.id }
`, "main.tf")];
    expect(diffTerraform(before, after).map((c) => [c.address, c.changeType])).toEqual([
      ["google_compute_firewall.allow", "configuration-added"],
      ["google_compute_network.main", "configuration-modified"],
      ["google_compute_network.old", "configuration-removed"],
      ["google_compute_subnetwork.sub", "dependency-modified"],
    ]);
  });

  it("parses nul-delimited git name status", () => {
    expect(parseGitNameStatus("M\0main.tf\0A\0new.tf\0R100\0old.tf\0moved.tf\0")).toEqual([
      { status: "modified", path: "main.tf" },
      { status: "added", path: "new.tf" },
      { status: "renamed", oldPath: "old.tf", path: "moved.tf" },
    ]);
  });
});
