import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addCompilerOptions } from "../src/generate/tsconfigEdit.ts";

const COMMENT = "measured at zero cost";

describe("addCompilerOptions", () => {
  it("inserts after the compilerOptions anchor", () => {
    const source = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    const updated = addCompilerOptions(source, ["noImplicitReturns"], COMMENT);
    assert.match(updated ?? "", /"noImplicitReturns": true,/);
    assert.match(updated ?? "", /"strict": true/);
  });

  it("preserves comments, because a tsconfig is usually JSONC", () => {
    // Parsing and re-serialising would delete the reasons somebody wrote down.
    const source = '{\n  // keep me\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    const updated = addCompilerOptions(source, ["noImplicitReturns"], COMMENT);
    assert.match(updated ?? "", /\/\/ keep me/);
  });

  it("skips a flag the file already mentions", () => {
    const source = '{\n  "compilerOptions": {\n    "noImplicitReturns": false\n  }\n}\n';
    assert.equal(addCompilerOptions(source, ["noImplicitReturns"], COMMENT), null);
  });

  it("returns null rather than guessing when there is no anchor", () => {
    assert.equal(addCompilerOptions('{\n  "files": []\n}\n', ["noImplicitReturns"], COMMENT), null);
  });

  it("indents to the level INSIDE compilerOptions, not the level of the key", () => {
    // Taking the first indented line in the file finds the outer level, and the inserted flags
    // then sit a level short of every option around them.
    const two = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    assert.match(addCompilerOptions(two, ["noImplicitReturns"], COMMENT) ?? "", /\n {4}"noImplicitReturns"/);

    const four = '{\n    "compilerOptions": {\n        "strict": true\n    }\n}\n';
    assert.match(addCompilerOptions(four, ["noImplicitReturns"], COMMENT) ?? "", /\n {8}"noImplicitReturns"/);
  });

  it("adds only the flags that are missing", () => {
    const source = '{\n  "compilerOptions": {\n    "noImplicitReturns": true\n  }\n}\n';
    const updated = addCompilerOptions(source, ["noImplicitReturns", "noImplicitOverride"], COMMENT);
    assert.match(updated ?? "", /"noImplicitOverride": true,/);
    assert.equal((updated ?? "").match(/noImplicitReturns/g)?.length, 1);
  });
});
