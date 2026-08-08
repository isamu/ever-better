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

  it("appends inside defineConfig([...])", () => {
    const source = "export default defineConfig([\n  base,\n]);\n";
    const updated = appendConfigBlocks(source, BLOCK);
    assert.match(updated ?? "", /max-depth/);
    assert.match(updated ?? "", /\]\);\s*$/);
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
