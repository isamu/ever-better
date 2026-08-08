import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogSources, extractExports, renderCatalog } from "../src/catalog.ts";
import type { SourceFile } from "../src/types.ts";

const file = (path: string, ext: string): SourceFile => ({ path, ext, lines: 10 });

describe("extractExports", () => {
  it("finds an exported arrow function", () => {
    const found = extractExports("export const parse = (raw: string) => raw;\n", "a.ts");
    assert.deepEqual(
      found.map((entry) => entry.name),
      ["parse"],
    );
    assert.equal(found[0]?.line, 1);
  });

  it("finds an exported function declaration", () => {
    const found = extractExports("export function parse(raw) {}\n", "a.js");
    assert.deepEqual(
      found.map((entry) => entry.name),
      ["parse"],
    );
  });

  it("finds async and generic forms", () => {
    const source = "export async function load() {}\nexport const pick = async <T,>(x: T) => x;\n";
    assert.deepEqual(
      extractExports(source, "a.ts").map((entry) => entry.name),
      ["load", "pick"],
    );
  });

  it("finds one with an explicit return type before the arrow", () => {
    const source = "export const total = (rows: number[]): number => rows.length;\n";
    assert.deepEqual(
      extractExports(source, "a.ts").map((entry) => entry.name),
      ["total"],
    );
  });

  it("ignores exported values that are not callable", () => {
    // The catalogue is for things somebody might write a second time, not for constants.
    const source = "export const LIMIT = 600;\nexport type Thing = { a: 1 };\n";
    assert.deepEqual(extractExports(source, "a.ts"), []);
  });

  it("ignores a non-exported function", () => {
    assert.deepEqual(extractExports("const hidden = () => 1;\n", "a.ts"), []);
  });

  it("takes the doc comment's first SENTENCE, not its first line", () => {
    // These comments are written to wrap, so a first line alone usually stops mid-clause.
    const source = [
      "/**",
      " * Counts lines without ever holding the file as a string. A repository can contain a",
      " * generated source file of any size.",
      " */",
      "export const countLines = (path: string) => 0;",
      "",
    ].join("\n");
    const found = extractExports(source, "a.ts");
    assert.equal(found[0]?.summary, "Counts lines without ever holding the file as a string.");
  });

  it("leaves the summary empty when there is no doc comment", () => {
    assert.equal(extractExports("export const go = () => 1;\n", "a.ts")[0]?.summary, null);
  });

  it("does not attach a comment that is not directly above", () => {
    const source = "/** far away */\n\nexport const go = () => 1;\n";
    assert.equal(extractExports(source, "a.ts")[0]?.summary, null);
  });
});

describe("catalogSources", () => {
  it("skips tests and declarations", () => {
    const files = [file("src/a.ts", "ts"), file("test/a.ts", "ts"), file("src/a.d.ts", "ts")];
    assert.deepEqual(
      catalogSources(files).map((entry) => entry.path),
      ["src/a.ts"],
    );
  });
});

describe("renderCatalog", () => {
  const entries = [
    { name: "beta", file: "src/b.ts", line: 2, summary: "Second." },
    { name: "alpha", file: "src/a.ts", line: 1, summary: null },
    { name: "gamma", file: "lib/c.ts", line: 3, summary: "Third." },
  ];

  it("groups by directory and sorts within each", () => {
    const doc = renderCatalog(entries);
    assert.ok(doc.indexOf("## lib") < doc.indexOf("## src"));
    assert.ok(doc.indexOf("`alpha`") < doc.indexOf("`beta`"));
  });

  it("carries the file and line, so the reader can go and look", () => {
    assert.match(renderCatalog(entries), /src\/b\.ts:2/);
  });

  it("says why it exists, at the top where it will be read", () => {
    assert.match(renderCatalog(entries), /sixth time under a sixth name/);
  });

  it("says plainly when it found nothing", () => {
    assert.match(renderCatalog([]), /No exported functions found\./);
  });
});
