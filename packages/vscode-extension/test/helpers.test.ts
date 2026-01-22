import { describe, expect, it } from "vitest";
import { containsPosition, redactSecrets, resourceAtPosition } from "../src/helpers";
import type { ResourceSummary } from "../src/types";

describe("containsPosition", () => {
  it("includes positions inside and at range boundaries", () => {
    const range = { start: { line: 2, character: 4 }, end: { line: 5, character: 1 } };
    expect(containsPosition(range, { line: 2, character: 4 })).toBe(true);
    expect(containsPosition(range, { line: 4, character: 20 })).toBe(true);
    expect(containsPosition(range, { line: 5, character: 2 })).toBe(false);
  });
});

describe("resourceAtPosition", () => {
  it("returns the narrowest enclosing resource in the requested file", () => {
    const make = (address: string, start: number, end: number): ResourceSummary => ({
      address, type: "google_test", name: address, file: "/repo/main.tf", references: [],
      range: { start: { line: start, character: 0 }, end: { line: end, character: 0 } }
    });
    expect(resourceAtPosition([make("wide", 0, 20), make("narrow", 5, 10)], "/repo/main.tf", { line: 7, character: 0 })?.address).toBe("narrow");
  });
});

describe("redactSecrets", () => {
  it("redacts sensitive keys and recognizable token values", () => {
    expect(redactSecrets({ password: "hello", note: "Bearer abc.def" })).toEqual({ password: "[REDACTED]", note: "[REDACTED]" });
  });
});
