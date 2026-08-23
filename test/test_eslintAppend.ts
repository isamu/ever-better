import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appendConfigBlocks, renderRuleBlock } from "../src/generate/eslintAppend.ts";

const BLOCK = renderRuleBlock([{ name: "max-depth", setting: '["error", 4]' }], ["measured"]);

describe("appendConfigBlocks", () => {
  it("appends inside a plain array export", () => {
    const updated = appendConfigBlocks("export default [\n  js.configs.recommended,\n];\n", BLOCK);
    assert.match(updated ?? "", /max-depth/);
    assert.match(updated ?? "", /\];\s*$/);
  });

  it("appends inside tseslint.config(...)", () => {
    const source = "export default tseslint.config(\n  js.configs.recommended,\n);\n";
    const updated = appendConfigBlocks(source, BLOCK);
    assert.match(updated ?? "", /max-depth/);
    assert.match(updated ?? "", /\);\s*$/);
  });

  it("appends INSIDE the array of defineConfig([...]), not after it", () => {
    // Taking the last closer instead of the innermost makes the block a second argument to
    // defineConfig — silently not a config at all.
    const source = "export default defineConfig([\n  base,\n]);\n";
    const updated = appendConfigBlocks(source, BLOCK) ?? "";
    assert.match(updated, /\]\);\s*$/);
    assert.ok(updated.indexOf("max-depth") < updated.indexOf("]);"));
  });

  it("does not double the separating comma", () => {
    const updated = appendConfigBlocks("export default [\n  base,\n];\n", BLOCK) ?? "";
    assert.ok(!updated.includes(",,"));
  });

  it("adds the comma when the last entry has none", () => {
    const updated = appendConfigBlocks("export default [\n  base\n];\n", BLOCK) ?? "";
    assert.match(updated, /base,\n/);
  });

  it("keeps everything that was already there", () => {
    const source = "// a reason someone wrote down\nexport default [\n  base,\n];\n";
    assert.match(appendConfigBlocks(source, BLOCK) ?? "", /a reason someone wrote down/);
  });

  it("returns null rather than guessing when there is no closer", () => {
    assert.equal(appendConfigBlocks("export default base", BLOCK), null);
  });

  it("returns null when there is nothing to add", () => {
    assert.equal(appendConfigBlocks("export default [];\n", []), null);
  });
});

describe("renderRuleBlock", () => {
  it("writes each rule with its setting", () => {
    const block = renderRuleBlock(
      [
        { name: "complexity", setting: '["error", 20]' },
        { name: "@typescript-eslint/no-explicit-any", setting: '"error"' },
      ],
      ["why"],
    ).join("\n");
    assert.match(block, /"complexity": \["error", 20\],/);
    assert.match(block, /"@typescript-eslint\/no-explicit-any": "error",/);
    assert.match(block, /\/\/ why/);
  });
});

describe("appending past a trailing comment", () => {
  /**
   * The comma separating the previous entry from the appended one has to land after the ENTRY. Put
   * at the end of the text it lands after a trailing comment — harmlessly inside a `//` one, and
   * outside a `/* … *\/` one, where it leaves a hole in the config array that ESLint refuses to load.
   */
  it("puts the comma after the last entry, not after a block comment", () => {
    const appended = appendConfigBlocks("export default [\n  { rules: {} },\n  /* off for now */\n];\n", ["  BLOCK,"]);
    assert.ok(appended !== null);
    assert.doesNotMatch(appended, /\*\/,/);
    assert.match(appended, /\{ rules: \{\} \},/);
    assert.match(appended, /\/\* off for now \*\/\n {2}BLOCK,/);
  });

  it("still adds the comma when the last entry has none", () => {
    const appended = appendConfigBlocks("export default [\n  { rules: {} }\n];\n", ["  BLOCK,"]);
    assert.ok(appended !== null);
    assert.match(appended, /\{ rules: \{\} \},\n {2}BLOCK,/);
  });

  it("adds none after an empty array", () => {
    const appended = appendConfigBlocks("export default [\n];\n", ["  BLOCK,"]);
    assert.ok(appended !== null);
    assert.doesNotMatch(appended, /\[,/);
  });
});
