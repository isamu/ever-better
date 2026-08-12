import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectJsonIndent } from "../src/util/jsonIndent.ts";

const packageJson = (indent: string): string => `{\n${indent}"name": "x",\n${indent}"scripts": {\n${indent}${indent}"lint": "eslint ."\n${indent}}\n}\n`;

describe("detectJsonIndent", () => {
  it("finds two spaces", () => {
    assert.equal(detectJsonIndent(packageJson("  ")), "  ");
  });

  it("finds four spaces", () => {
    assert.equal(detectJsonIndent(packageJson("    ")), "    ");
  });

  it("finds a tab", () => {
    assert.equal(detectJsonIndent(packageJson("\t")), "\t");
  });

  /** A file checked out with CRLF still has the indentation after the newline pair. */
  it("finds it through CRLF line endings", () => {
    assert.equal(detectJsonIndent('{\r\n\t"name": "x"\r\n}\r\n'), "\t");
  });

  it("falls back to two spaces when there is nothing to preserve", () => {
    assert.equal(detectJsonIndent('{"name":"x","version":"1.0.0"}'), "  ");
    assert.equal(detectJsonIndent(""), "  ");
  });

  /** The outermost level is what the file is indented with; a nested one would double it. */
  it("takes the first indented line rather than the deepest", () => {
    assert.equal(detectJsonIndent('{\n  "a": {\n      "b": 1\n  }\n}\n'), "  ");
  });

  it("round-trips: writing with what it found leaves the shape alone", () => {
    const original = packageJson("\t");
    const parsed: unknown = JSON.parse(original);
    assert.equal(`${JSON.stringify(parsed, null, detectJsonIndent(original))}\n`, original);
  });
});
