import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countImporters, importersOf } from "../src/fanIn.ts";
import { buildGraph, type ImportGraph } from "../src/migrate/importGraph.ts";

const graphOf = (edges: Record<string, string[]>): ImportGraph => new Map(Object.entries(edges));

describe("countImporters", () => {
  it("counts how many files import each one", () => {
    const graph = graphOf({
      "src/app.ts": ["src/util.ts", "src/api.ts"],
      "src/api.ts": ["src/util.ts"],
      "src/util.ts": [],
    });
    assert.deepEqual(
      [...countImporters(graph)],
      [
        ["src/app.ts", 0],
        ["src/api.ts", 1],
        ["src/util.ts", 2],
      ],
    );
  });

  it("gives an entry point zero rather than leaving it out", () => {
    assert.deepEqual(countImporters(graphOf({ "src/main.ts": [] })).get("src/main.ts"), 0);
  });

  /** A file importing the same module twice is one dependent, not two. */
  it("counts a file once however many times it imports its target", () => {
    const graph = graphOf({ "src/app.ts": ["src/util.ts", "src/util.ts"], "src/util.ts": [] });
    assert.equal(countImporters(graph).get("src/util.ts"), 1);
  });

  it("terminates on a cycle", () => {
    const graph = graphOf({ "a.ts": ["b.ts"], "b.ts": ["a.ts"] });
    assert.deepEqual(
      [...countImporters(graph)],
      [
        ["a.ts", 1],
        ["b.ts", 1],
      ],
    );
  });
});

describe("countImporters over a real graph", () => {
  /** Built from source text rather than a hand-written map, since that is what the command does. */
  it("resolves relative specifiers and ignores packages", () => {
    const sources = new Map([
      ["src/app.ts", "import { helper } from './util.ts';\nimport path from 'node:path';\n"],
      ["src/api.ts", "import { helper } from './util.ts';\n"],
      ["src/util.ts", "export const helper = 1;\n"],
    ]);
    assert.equal(countImporters(buildGraph(sources)).get("src/util.ts"), 2);
  });
});

describe("importersOf", () => {
  it("keeps only the files asked about, deduplicated and sorted", () => {
    const counts = new Map([
      ["src/util.ts", 9],
      ["src/app.ts", 0],
      ["src/unrelated.ts", 4],
    ]);
    assert.deepEqual(importersOf(counts, ["src/util.ts", "src/app.ts", "src/util.ts"]), { "src/app.ts": 0, "src/util.ts": 9 });
  });

  /** A suppressed file the graph never saw — an ignored path, an unreadable one — is zero, not absent. */
  it("reports a file the graph does not know as zero", () => {
    assert.deepEqual(importersOf(new Map(), ["src/generated.ts"]), { "src/generated.ts": 0 });
  });
});
