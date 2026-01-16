import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IncrementalWorkspaceAnalyzer } from "./workspace";

describe("demo fixture golden report", () => {
  it("keeps the VPC blast-radius report reviewable", () => {
    const fixtureDirectory = resolve(__dirname, "../../../fixtures/demo");
    const files = Object.fromEntries(
      readdirSync(fixtureDirectory)
        .filter((name) => name.endsWith(".tf"))
        .map((name) => {
          const file = resolve(fixtureDirectory, name);
          return [file, readFileSync(file, "utf8")];
        })
    );
    const analyzer = new IncrementalWorkspaceAnalyzer({ inferSemanticDependencies: true });
    analyzer.updateFiles(files);

    const normalized = JSON.parse(
      JSON.stringify(analyzer.analyze("google_compute_network.main", { maxDepth: 5, includeInferred: true }))
        .replaceAll(fixtureDirectory, "<fixture>")
    );

    expect(normalized).toMatchSnapshot();
  });
});
