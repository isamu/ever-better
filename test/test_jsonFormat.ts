import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { stringifyLike } from "../src/util/jsonFormat.ts";

const packageJson = (indent: string, ending = "\n"): string =>
  ["{", `${indent}"name": "x",`, `${indent}"scripts": {`, `${indent}${indent}"lint": "eslint ."`, `${indent}}`, "}", ""].join(ending);

/** The property that matters: reading a file and writing it back changes nothing. */
const roundTrips = (text: string): boolean => stringifyLike(text, JSON.parse(text)) === text;

describe("stringifyLike", () => {
  it("keeps two spaces", () => {
    assert.ok(roundTrips(packageJson("  ")));
  });

  it("keeps four spaces", () => {
    assert.ok(roundTrips(packageJson("    ")));
  });

  it("keeps tabs", () => {
    assert.ok(roundTrips(packageJson("\t")));
  });

  /**
   * A Windows checkout without `.gitattributes` is CRLF throughout, and `JSON.stringify` only ever
   * emits `\n` — so preserving the indentation alone still rewrote every line of the file.
   */
  it("keeps CRLF line endings", () => {
    assert.ok(roundTrips(packageJson("\t", "\r\n")));
    assert.ok(!stringifyLike(packageJson("  ", "\r\n"), { a: 1 }).includes("\n\n"));
  });

  /** `JSON.stringify` clips a string `space` to ten characters; indenting by depth does not. */
  it("keeps an indent wider than JSON.stringify would accept", () => {
    assert.ok(roundTrips(packageJson(" ".repeat(14))));
    assert.equal(JSON.stringify({ a: 1 }, null, " ".repeat(14)).split("\n")[1], `${" ".repeat(10)}"a": 1`);
  });

  it("falls back to two spaces when there is nothing to preserve", () => {
    assert.equal(stringifyLike('{"name":"x"}', { name: "x" }), '{\n  "name": "x"\n}\n');
    assert.equal(stringifyLike("", { a: 1 }), '{\n  "a": 1\n}\n');
  });

  it("takes the outermost indent rather than the deepest", () => {
    assert.ok(roundTrips('{\n  "a": {\n    "b": 1\n  }\n}\n'));
  });

  /** An array's first indented line opens with `{` or a digit, never a quote. */
  it("detects the indent of a file whose first indented line is not a string", () => {
    assert.ok(roundTrips('[\n\t{\n\t\t"a": 1\n\t}\n]\n'));
    assert.ok(roundTrips("[\n    1,\n    2\n]\n"));
  });

  /** A newline inside a value is escaped in JSON text, so it cannot be mistaken for a line break. */
  it("does not reindent inside a string value", () => {
    const written = stringifyLike(packageJson("\t"), { script: "a\n      b" });
    assert.equal(written, '{\n\t"script": "a\\n      b"\n}\n');
  });

  it("adds the trailing newline even when the original lacked one", () => {
    assert.ok(stringifyLike('{\n  "a": 1\n}', { a: 1 }).endsWith("1\n}\n"));
  });
});
