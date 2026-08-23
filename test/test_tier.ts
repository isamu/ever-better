import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderTierConfig, importsTier, withTierImport, SPREAD_BLOCK } from "../src/generate/tierConfig.ts";
import { drained, regressions, ruleNames, tierList } from "../src/tier.ts";
import type { Suppression } from "../src/suppressionsFile.ts";

const failing = (file: string, rule: string, count = 1): Suppression => ({ file, rule, count });

describe("tierList", () => {
  it("collapses counts into one exception per file and rule", () => {
    const list = tierList([failing("src/a.ts", "no-var", 4), failing("src/a.ts", "no-var", 4), failing("src/a.ts", "max-depth")]);
    assert.deepEqual(list, [{ file: "src/a.ts", rules: ["max-depth", "no-var"] }]);
  });

  /** Two runs over the same repository must produce the same file, or every run is a diff. */
  it("orders files and rules so the generated file is stable", () => {
    const one = tierList([failing("src/b.ts", "z-rule"), failing("src/a.ts", "b-rule"), failing("src/a.ts", "a-rule")]);
    const other = tierList([failing("src/a.ts", "a-rule"), failing("src/b.ts", "z-rule"), failing("src/a.ts", "b-rule")]);
    assert.deepEqual(one, other);
    assert.deepEqual(
      one.map((entry) => entry.file),
      ["src/a.ts", "src/b.ts"],
    );
  });
});

describe("regressions", () => {
  const before = tierList([failing("src/a.ts", "no-var"), failing("src/a.ts", "max-depth")]);

  it("finds nothing when the failing set is a subset of the list", () => {
    assert.deepEqual(regressions(before, tierList([failing("src/a.ts", "no-var")])), []);
  });

  /** A rule that was already an error for a file it did not cover is new code breaking it. */
  it("reports a rule the file was not excused for", () => {
    assert.deepEqual(regressions(before, tierList([failing("src/a.ts", "complexity")])), [{ file: "src/a.ts", rule: "complexity" }]);
  });

  it("reports a file that was not on the list at all", () => {
    assert.deepEqual(regressions(before, tierList([failing("src/new.ts", "no-var")])), [{ file: "src/new.ts", rule: "no-var" }]);
  });
});

describe("drained", () => {
  it("names what stopped failing, which is the whole point of re-running", () => {
    const before = tierList([failing("src/a.ts", "no-var"), failing("src/b.ts", "no-var")]);
    assert.deepEqual(drained(before, tierList([failing("src/b.ts", "no-var")])), [{ file: "src/a.ts", rule: "no-var" }]);
  });
});

describe("ruleNames", () => {
  /** These are the rules forced back to `error` on the next run, so the list can be recomputed. */
  it("is every rule the list excuses, deduplicated", () => {
    const list = tierList([failing("src/a.ts", "no-var"), failing("src/b.ts", "no-var"), failing("src/b.ts", "max-depth")]);
    assert.deepEqual(ruleNames(list), ["max-depth", "no-var"]);
  });
});

describe("renderTierConfig", () => {
  const config = (): string => renderTierConfig(tierList([failing("src/a.ts", "no-var"), failing("src/a.ts", "max-depth")]));

  it("downgrades to warn rather than off, so the finding stays visible", () => {
    assert.match(config(), /"no-var": "warn"/);
    assert.doesNotMatch(config(), /"off"/);
  });

  it("scopes each block to one file", () => {
    assert.match(config(), /files: \["src\/a\.ts"\]/);
  });

  it("says in the file that it is generated and may only shrink", () => {
    assert.match(config(), /Do not edit/);
    assert.match(config(), /may only shrink/);
  });

  it("is empty and valid with nothing to excuse", () => {
    assert.match(renderTierConfig([]), /export default \[\n\];/);
  });
});

describe("wiring the repository's own config", () => {
  it("recognises a config that already spreads the list", () => {
    const wired = withTierImport(`export default [\n${SPREAD_BLOCK.join("\n")}\n];\n`);
    assert.equal(importsTier(wired), true);
  });

  it("does not mistake an unwired config for a wired one", () => {
    assert.equal(importsTier("export default [];\n"), false);
  });
});
