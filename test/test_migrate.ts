import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGraph, resolveLocalImports } from "../src/migrate/importGraph.ts";
import { migratedName, planMigration } from "../src/migrate/order.ts";

const known = (...files: string[]) => new Set(files);

describe("resolveLocalImports", () => {
  it("resolves a relative import to a file in the repo", () => {
    const found = resolveLocalImports("src/a.js", 'import { x } from "./b.js";\n', known("src/a.js", "src/b.js"));
    assert.deepEqual(found, ["src/b.js"]);
  });

  it("resolves an extensionless specifier", () => {
    const found = resolveLocalImports("src/a.js", 'import x from "./b";\n', known("src/b.js"));
    assert.deepEqual(found, ["src/b.js"]);
  });

  it("resolves a directory to its index", () => {
    const found = resolveLocalImports("src/a.js", 'import x from "./util";\n', known("src/util/index.js"));
    assert.deepEqual(found, ["src/util/index.js"]);
  });

  it("follows require as well as import", () => {
    const found = resolveLocalImports("src/a.js", 'const b = require("./b.js");\n', known("src/b.js"));
    assert.deepEqual(found, ["src/b.js"]);
  });

  it("follows a re-export", () => {
    const found = resolveLocalImports("src/a.js", 'export { x } from "./b.js";\n', known("src/b.js"));
    assert.deepEqual(found, ["src/b.js"]);
  });

  it("ignores a package import, which is already typed or already is not", () => {
    const found = resolveLocalImports("src/a.js", 'import fs from "node:fs";\n', known("src/a.js"));
    assert.deepEqual(found, []);
  });

  it("ignores a relative specifier pointing outside the repo", () => {
    const found = resolveLocalImports("src/a.js", 'import x from "./missing.js";\n', known("src/a.js"));
    assert.deepEqual(found, []);
  });

  it("lists each dependency once", () => {
    const source = 'import { x } from "./b.js";\nimport { y } from "./b.js";\n';
    assert.deepEqual(resolveLocalImports("src/a.js", source, known("src/b.js")), ["src/b.js"]);
  });
});

describe("planMigration", () => {
  const graph = (entries: Record<string, string[]>) => new Map(Object.entries(entries));

  it("puts a dependency before its dependent", () => {
    // Typing a file whose imports are still JavaScript means typing it against `any`, and all of
    // it has to be redone once the dependency is typed.
    const { order } = planMigration(graph({ "a.js": ["b.js"], "b.js": [] }));
    assert.deepEqual(order, ["b.js", "a.js"]);
  });

  it("orders a three-deep chain leaf-first", () => {
    const { order } = planMigration(graph({ "a.js": ["b.js"], "b.js": ["c.js"], "c.js": [] }));
    assert.deepEqual(order, ["c.js", "b.js", "a.js"]);
  });

  it("reports a cycle rather than looping forever", () => {
    const { cycles } = planMigration(graph({ "a.js": ["b.js"], "b.js": ["a.js"] }));
    assert.equal(cycles.length > 0, true);
  });

  it("still lists every file when there is a cycle", () => {
    const { order } = planMigration(graph({ "a.js": ["b.js"], "b.js": ["a.js"] }));
    assert.deepEqual(
      [...order].sort((left, right) => left.localeCompare(right)),
      ["a.js", "b.js"],
    );
  });

  it("is deterministic for unrelated files", () => {
    const plan = graph({ "b.js": [], "a.js": [] });
    assert.deepEqual(planMigration(plan).order, planMigration(plan).order);
  });
});

describe("buildGraph", () => {
  it("links the files it was given and nothing else", () => {
    const files = new Map([
      ["src/a.js", 'import { b } from "./b.js";\n'],
      ["src/b.js", 'import fs from "node:fs";\n'],
    ]);
    assert.deepEqual(buildGraph(files).get("src/a.js"), ["src/b.js"]);
    assert.deepEqual(buildGraph(files).get("src/b.js"), []);
  });
});

describe("migratedName", () => {
  it("keeps JSX as .tsx, which the compiler requires for the syntax", () => {
    assert.equal(migratedName("src/App.jsx"), "src/App.tsx");
  });

  it("maps the module variants", () => {
    assert.equal(migratedName("a.mjs"), "a.mts");
    assert.equal(migratedName("a.cjs"), "a.cts");
    assert.equal(migratedName("a.js"), "a.ts");
  });

  it("leaves a path that only contains .js elsewhere alone", () => {
    assert.equal(migratedName("src/js.helpers/a.js"), "src/js.helpers/a.ts");
  });
});
