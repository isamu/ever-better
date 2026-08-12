import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withScripts } from "../src/packageScripts.ts";

const original = (indent = "  ", ending = "\n"): string =>
  [
    "{",
    `${indent}"name": "thing",`,
    `${indent}"version": "1.0.0",`,
    `${indent}"dependencies": {`,
    `${indent}${indent}"left-pad": "^1.3.0"`,
    `${indent}},`,
    `${indent}"scripts": {`,
    `${indent}${indent}"build": "tsc"`,
    `${indent}}`,
    "}",
    "",
  ].join(ending);

/**
 * The whole write path, without an install behind it. `bootstrap` edits a file somebody else owns,
 * and every promise about that edit is a property of this function.
 */
describe("withScripts", () => {
  it("keeps the fields it knows nothing about", () => {
    const parsed: unknown = JSON.parse(withScripts(original(), { lint: "eslint ." }));
    assert.deepEqual(parsed, {
      name: "thing",
      version: "1.0.0",
      dependencies: { "left-pad": "^1.3.0" },
      scripts: { build: "tsc", lint: "eslint ." },
    });
  });

  it("does not replace a script that is already there", () => {
    const written = withScripts(original(), { build: "webpack" });
    assert.match(written, /"build": "webpack"/);
    // The caller decides what to add; this function merges what it is given, and `scriptsToAdd`
    // is what refuses to hand over a script the repo already has.
    assert.doesNotMatch(withScripts(original(), {}), /"lint"/);
  });

  it("leaves a four-space file four-space", () => {
    assert.match(withScripts(original("    "), { lint: "eslint ." }), /\n {4}"name"/);
  });

  it("leaves a tab file tabbed", () => {
    assert.match(withScripts(original("\t"), { lint: "eslint ." }), /\n\t"name"/);
  });

  /** The write path, not the detector: this is what iteration 1 fixed and could not prove here. */
  it("leaves a CRLF file CRLF", () => {
    const written = withScripts(original("\t", "\r\n"), { lint: "eslint ." });
    assert.ok(written.includes("\r\n"), "line endings were converted to LF");
    assert.doesNotMatch(written, /[^\r]\n/, "a bare LF survived in a CRLF file");
  });

  it("leaves an indent wider than JSON.stringify accepts alone", () => {
    const written = withScripts(original(" ".repeat(14)), { lint: "eslint ." });
    assert.match(written, /\n {14}"name"/);
  });

  it("adds scripts to a file that has none", () => {
    const written = withScripts('{\n  "name": "thing"\n}\n', { lint: "eslint ." });
    assert.equal(written, '{\n  "name": "thing",\n  "scripts": {\n    "lint": "eslint ."\n  }\n}\n');
  });

  it("refuses anything that is not an object", () => {
    assert.throws(() => withScripts("[1, 2]", { lint: "eslint ." }), /not an object/);
    assert.throws(() => withScripts("null", { lint: "eslint ." }), /not an object/);
  });

  /** `"scripts": null` is legal JSON and spreading it would throw before the merge. */
  it("survives a null scripts field", () => {
    assert.match(withScripts('{\n  "scripts": null\n}\n', { lint: "eslint ." }), /"lint": "eslint \."/);
  });
});
