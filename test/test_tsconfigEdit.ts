import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addCompilerOptions } from "../src/generate/tsconfigEdit.ts";
import type { StrictnessFlag } from "../src/probe/effectiveTsconfig.ts";

const COMMENT = "measured at zero cost";

const flag = (name: string, value = true): StrictnessFlag => ({ name, why: "because", value });

describe("addCompilerOptions", () => {
  it("inserts after the compilerOptions anchor", () => {
    const source = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    const updated = addCompilerOptions(source, [flag("noImplicitReturns")], COMMENT);
    assert.match(updated ?? "", /"noImplicitReturns": true,/);
    assert.match(updated ?? "", /"strict": true/);
  });

  it("preserves comments, because a tsconfig is usually JSONC", () => {
    // Parsing and re-serialising would delete the reasons somebody wrote down.
    const source = '{\n  // keep me\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    const updated = addCompilerOptions(source, [flag("noImplicitReturns")], COMMENT);
    assert.match(updated ?? "", /\/\/ keep me/);
  });

  it("skips a flag the file already mentions", () => {
    const source = '{\n  "compilerOptions": {\n    "noImplicitReturns": false\n  }\n}\n';
    assert.equal(addCompilerOptions(source, [flag("noImplicitReturns")], COMMENT), null);
  });

  it("returns null rather than guessing when there is no anchor", () => {
    assert.equal(addCompilerOptions('{\n  "files": []\n}\n', [flag("noImplicitReturns")], COMMENT), null);
  });

  it("indents to the level INSIDE compilerOptions, not the level of the key", () => {
    // Taking the first indented line in the file finds the outer level, and the inserted flags
    // then sit a level short of every option around them.
    const two = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    assert.match(addCompilerOptions(two, [flag("noImplicitReturns")], COMMENT) ?? "", /\n {4}"noImplicitReturns"/);

    const four = '{\n    "compilerOptions": {\n        "strict": true\n    }\n}\n';
    assert.match(addCompilerOptions(four, [flag("noImplicitReturns")], COMMENT) ?? "", /\n {8}"noImplicitReturns"/);
  });

  it("adds only the flags that are missing", () => {
    const source = '{\n  "compilerOptions": {\n    "noImplicitReturns": true\n  }\n}\n';
    const updated = addCompilerOptions(source, [flag("noImplicitReturns"), flag("noImplicitOverride")], COMMENT);
    assert.match(updated ?? "", /"noImplicitOverride": true,/);
    assert.equal((updated ?? "").match(/noImplicitReturns/g)?.length, 1);
  });

  it("writes the value that makes the flag strict, which is not always true", () => {
    // `allowUnreachableCode` is permissive when on, so writing `true` for every flag would hand
    // the repository the opposite of what was measured.
    const source = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    const updated = addCompilerOptions(source, [flag("allowUnreachableCode", false)], COMMENT);
    assert.match(updated ?? "", /"allowUnreachableCode": false,/);
  });

  it("mixes flags that want different values in one insertion", () => {
    const source = '{\n  "compilerOptions": {\n    "strict": true\n  }\n}\n';
    const updated = addCompilerOptions(source, [flag("noUncheckedSideEffectImports"), flag("allowUnreachableCode", false)], COMMENT);
    assert.match(updated ?? "", /"noUncheckedSideEffectImports": true,/);
    assert.match(updated ?? "", /"allowUnreachableCode": false,/);
  });
});
