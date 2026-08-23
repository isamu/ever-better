import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderTierConfig, importsTier, withTierImport, SPREAD_BLOCK, TIER_RECOMPUTE_ENV } from "../src/generate/tierConfig.ts";
import { drained, parseLedger, refused, regressions, ruleNames, tierList } from "../src/tier.ts";
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

describe("parseLedger", () => {
  it("reads a file that is not there as a first run", () => {
    assert.deepEqual(parseLedger(null), { present: false });
  });

  /** A drained repository is the strictest state there is, and it is spelled `[]`. */
  it("reads an empty list as a ledger that is present", () => {
    assert.deepEqual(parseLedger("[]"), { present: true, entries: [] });
  });

  it("reads a list of entries", () => {
    assert.deepEqual(parseLedger('[{"file":"a.ts","rules":["no-var"]}]'), { present: true, entries: [{ file: "a.ts", rules: ["no-var"] }] });
  });

  /** Starting over from an unreadable ledger would write in everything that has failed since. */
  it("refuses a truncated file rather than starting over", () => {
    assert.equal(parseLedger('[{"file":"a.ts","rul'), null);
  });

  it("refuses valid JSON of the wrong shape", () => {
    assert.equal(parseLedger('{"a.ts":["no-var"]}'), null);
    assert.equal(parseLedger('[{"file":"a.ts","rules":[1]}]'), null);
    assert.equal(parseLedger('[{"file":"a.ts"}]'), null);
  });
});

describe("refused", () => {
  const now = tierList([failing("src/new.ts", "no-var")]);

  it("excuses everything on the first run, which is what taking a tier means", () => {
    assert.deepEqual(refused({ present: false }, now), []);
  });

  /**
   * The regression that ended the shrink-only promise at the moment a repo succeeded: an empty
   * ledger is a DRAINED repo, and a new violation in it must be refused, not written back in.
   */
  it("refuses a new violation against a drained ledger", () => {
    assert.deepEqual(refused({ present: true, entries: [] }, now), [{ file: "src/new.ts", rule: "no-var" }]);
  });

  it("excuses a pair the present ledger already lists", () => {
    assert.deepEqual(refused({ present: true, entries: [{ file: "src/new.ts", rules: ["no-var"] }] }, now), []);
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

  /**
   * A `files` entry is a glob. Unescaped, `pages/[id].js` is a character class: it matches
   * `pages/i.js` and NOT the file ESLint recorded, so the excused file stays an error and an
   * innocent one is downgraded instead.
   */
  it("escapes a path that is also glob syntax", () => {
    const escaped = renderTierConfig(tierList([failing("pages/[id].js", "no-var")]));
    assert.match(escaped, /files: \["pages\/\\\\\[id\\\\\]\.js"\]/);
  });

  it("escapes every metacharacter minimatch reads", () => {
    const rendered = renderTierConfig(tierList([failing("a(b)c{d}e!f+g@h|i*j?k.js", "no-var")]));
    "(){}!+@|*?".split("").forEach((meta) => assert.ok(rendered.includes(`\\\\${meta}`), `${meta} is not escaped`));
  });

  it("is empty and valid with nothing to excuse", () => {
    assert.match(renderTierConfig([]), /const exceptions = \[\n\];/);
  });

  /**
   * The list has to be recomputed with its own downgrades out of the way. Doing that with a CLI
   * `--rule` instead aborts ESLint outright on any file outside the type program, so the generated
   * file steps aside on an environment variable and nothing global is overridden.
   */
  it("steps aside while the list is being recomputed", () => {
    const rendered = config();
    assert.match(rendered, new RegExp(`const recomputing = process\\.env\\.${TIER_RECOMPUTE_ENV} === "1";`));
    assert.match(rendered, /export default recomputing \? \[\] : exceptions;/);
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
