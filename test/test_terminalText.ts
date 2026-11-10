import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { printableLine } from "../src/util/terminalText.ts";

describe("printableLine", () => {
  it("leaves ordinary text alone, including non-ASCII", () => {
    assert.equal(printableLine("Unexpected 'var' in src/日本語/a.ts — use let"), "Unexpected 'var' in src/日本語/a.ts — use let");
  });

  it("collapses whitespace runs, newlines included, to one space", () => {
    assert.equal(printableLine("  Parsing error:\n\tUnexpected\r\n token  "), "Parsing error: Unexpected token");
  });

  it("shows an escape sequence instead of letting the terminal run it", () => {
    assert.equal(printableLine("\u001b[2K\u001b[1GClean."), "\\x1b[2K\\x1b[1GClean.");
  });

  it("shows every C0, DEL and C1 control that is not whitespace", () => {
    assert.equal(printableLine("a\u0000b\u0008c\u007fd\u009be"), "a\\x00b\\x08c\\x7fd\\x9be");
  });

  it("returns an empty string for empty or all-whitespace input", () => {
    assert.equal(printableLine(""), "");
    assert.equal(printableLine(" \n\t "), "");
  });

  it("never leaves a raw control character in its output, over every code point up to U+00FF", () => {
    const every = Array.from({ length: 0x100 }, (_, code) => String.fromCodePoint(code)).join("");
    const output = printableLine(every);
    Array.from(output).forEach((character) => {
      const code = character.codePointAt(0) ?? 0;
      assert.ok(code >= 0x20 && (code < 0x7f || code > 0x9f), `raw control U+${code.toString(16)} survived`);
    });
  });
});
