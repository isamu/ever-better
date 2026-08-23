import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withoutComments } from "../src/generate/configText.ts";

describe("withoutComments", () => {
  /** Offsets are used to place an inserted comma, so a shorter string would put it somewhere else. */
  it("keeps the length and the line breaks", () => {
    const source = "const a = 1; // note\n/* two\n   lines */\nconst b = 2;\n";
    const blanked = withoutComments(source);
    assert.equal(blanked.length, source.length);
    assert.equal(blanked.split("\n").length, source.split("\n").length);
  });

  it("blanks a line comment and keeps the code before it", () => {
    assert.equal(withoutComments("const a = 1; // ...spread"), "const a = 1;             ");
  });

  it("blanks a block comment that opens and closes on one line", () => {
    assert.equal(withoutComments("[ /* ...spread, */ ]"), "[                  ]");
  });

  it("blanks a block comment that spans lines, and resumes after it", () => {
    assert.equal(withoutComments("a /* one\ntwo */ b"), "a       \n       b");
  });

  it("leaves code with no comments untouched", () => {
    assert.equal(withoutComments("export default [];\n"), "export default [];\n");
  });
});
