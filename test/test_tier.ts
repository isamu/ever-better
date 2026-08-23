import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  renderTierConfig,
  hasTierImport,
  importsTier,
  importedTierName,
  moduleSystemOf,
  spreadsTier,
  tierConfigFileName,
  withTierImport,
  SPREAD_BLOCK,
  TIER_RECOMPUTE_ENV,
} from "../src/generate/tierConfig.ts";
import { drained, parseLedger, refused, regressions, ruleNames, tierList, violations } from "../src/tier.ts";
import { ESLINT_CONFIG_NAMES } from "../src/eslintConfigNames.ts";
import type { Suppression } from "../src/suppressionsFile.ts";

const failing = (file: string, rule: string, count = 1): Suppression => ({ file, rule, count });

describe("tierList", () => {
  it("carries the count, which is what a flat-config block cannot express", () => {
    const list = tierList([failing("src/a.ts", "no-var", 4), failing("src/a.ts", "no-var", 2), failing("src/a.ts", "max-depth")]);
    assert.deepEqual(list, [{ file: "src/a.ts", rules: { "max-depth": 1, "no-var": 6 } }]);
  });

  /** Two runs over the same repository must produce the same file, or every run is a diff. */
  it("orders files and rules so the generated file is stable", () => {
    const one = tierList([failing("src/b.ts", "z-rule"), failing("src/a.ts", "b-rule"), failing("src/a.ts", "a-rule")]);
    const other = tierList([failing("src/a.ts", "a-rule"), failing("src/b.ts", "z-rule"), failing("src/a.ts", "b-rule")]);
    assert.deepEqual(one, other);
    assert.equal(JSON.stringify(one), JSON.stringify(other));
    assert.deepEqual(
      one.map((entry) => entry.file),
      ["src/a.ts", "src/b.ts"],
    );
  });
});

describe("regressions", () => {
  const before = tierList([failing("src/a.ts", "no-var", 2), failing("src/a.ts", "max-depth")]);

  it("finds nothing when the failing set is within what the list excuses", () => {
    assert.deepEqual(regressions(before, tierList([failing("src/a.ts", "no-var", 2)])), []);
    assert.deepEqual(regressions(before, tierList([failing("src/a.ts", "no-var")])), []);
  });

  /**
   * The hole a file-and-rule list cannot see on its own: the pair is already a warning, so a second
   * violation of the same rule in the same file is a warning too and `eslint .` exits 0. The count
   * in the ledger is the only record of how many there were.
   */
  it("reports a pair that grew, not just a pair that is new", () => {
    assert.deepEqual(regressions(before, tierList([failing("src/a.ts", "no-var", 3)])), [{ file: "src/a.ts", rule: "no-var", count: 3, allowed: 2 }]);
  });

  /** A rule that was already an error for a file it did not cover is new code breaking it. */
  it("reports a rule the file was not excused for", () => {
    assert.deepEqual(regressions(before, tierList([failing("src/a.ts", "complexity")])), [{ file: "src/a.ts", rule: "complexity", count: 1, allowed: 0 }]);
  });

  it("reports a file that was not on the list at all", () => {
    assert.deepEqual(regressions(before, tierList([failing("src/new.ts", "no-var")])), [{ file: "src/new.ts", rule: "no-var", count: 1, allowed: 0 }]);
  });
});

describe("drained", () => {
  it("names what stopped failing, which is the whole point of re-running", () => {
    const before = tierList([failing("src/a.ts", "no-var"), failing("src/b.ts", "no-var")]);
    assert.deepEqual(drained(before, tierList([failing("src/b.ts", "no-var")])), [{ file: "src/a.ts", rule: "no-var", count: 0, allowed: 1 }]);
  });

  it("counts a pair that shrank without disappearing", () => {
    const before = tierList([failing("src/a.ts", "no-var", 5)]);
    assert.deepEqual(drained(before, tierList([failing("src/a.ts", "no-var", 2)])), [{ file: "src/a.ts", rule: "no-var", count: 2, allowed: 5 }]);
  });
});

describe("violations", () => {
  it("is every violation the list excuses, which is the number to drive to zero", () => {
    assert.equal(violations(tierList([failing("src/a.ts", "no-var", 3), failing("src/b.ts", "max-depth", 2)])), 5);
    assert.equal(violations([]), 0);
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
    assert.deepEqual(parseLedger('[{"file":"a.ts","rules":{"no-var":2}}]'), { present: true, entries: [{ file: "a.ts", rules: { "no-var": 2 } }] });
  });

  /** Starting over from an unreadable ledger would write in everything that has failed since. */
  it("refuses a truncated file rather than starting over", () => {
    assert.equal(parseLedger('[{"file":"a.ts","rul'), null);
  });

  it("refuses valid JSON of the wrong shape", () => {
    assert.equal(parseLedger('{"a.ts":["no-var"]}'), null);
    assert.equal(parseLedger('[{"file":"a.ts","rules":["no-var"]}]'), null, "the countless shape is not a ledger");
    assert.equal(parseLedger('[{"file":"a.ts","rules":{"no-var":0}}]'), null, "a zero count is not an exception");
    assert.equal(parseLedger('[{"file":"a.ts","rules":{"no-var":"2"}}]'), null);
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
    assert.deepEqual(refused({ present: true, entries: [] }, now), [{ file: "src/new.ts", rule: "no-var", count: 1, allowed: 0 }]);
  });

  it("excuses a pair the present ledger already lists", () => {
    assert.deepEqual(refused({ present: true, entries: [{ file: "src/new.ts", rules: { "no-var": 1 } }] }, now), []);
  });
});

describe("renderTierConfig", () => {
  const config = (): string => renderTierConfig(tierList([failing("src/a.ts", "no-var"), failing("src/a.ts", "max-depth")]), "eslint-tier.config.mjs");

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
    const escaped = renderTierConfig(tierList([failing("pages/[id].js", "no-var")]), "eslint-tier.config.mjs");
    assert.match(escaped, /files: \["pages\/\\\\\[id\\\\\]\.js"\]/);
  });

  it("escapes every metacharacter minimatch reads", () => {
    const rendered = renderTierConfig(tierList([failing("a(b)c{d}e!f+g@h|i*j?k.js", "no-var")]), "eslint-tier.config.mjs");
    "(){}!+@|*?".split("").forEach((meta) => assert.ok(rendered.includes(`\\\\${meta}`), `${meta} is not escaped`));
  });

  it("is empty and valid with nothing to excuse", () => {
    assert.match(renderTierConfig([], "eslint-tier.config.mjs"), /const exceptions = \[\n\];/);
  });

  /**
   * The list has to be recomputed with its own downgrades out of the way. Doing that with a CLI
   * `--rule` instead aborts ESLint outright on any file outside the type program, so the generated
   * file steps aside on an environment variable and nothing global is overridden.
   */
  it("steps aside while the list is being recomputed", () => {
    const rendered = config();
    assert.match(rendered, new RegExp(`const recomputing = process\\.env\\.${TIER_RECOMPUTE_ENV} === "1";`));
    assert.match(rendered, /export default recomputing \? \[ignoreSelf\] : \[ignoreSelf, \.\.\.exceptions\];/);
  });
});

describe("the generated file's name and module system", () => {
  /**
   * The extension does not answer this on its own: a flat config may be CommonJS in a plain
   * `eslint.config.js`, and an `import` prepended to one leaves ESLint with `ReferenceError: module
   * is not defined in ES module scope` — no linter at all, while `tier` reports success.
   */
  it("reads a CommonJS eslint.config.js as CommonJS", () => {
    assert.equal(moduleSystemOf("eslint.config.js", "module.exports = [];\n", null), "cjs");
  });

  /** Node decides a `.js` file by the package type first, so this does too. */
  it('lets "type": "module" outrank what the source looks like', () => {
    assert.equal(moduleSystemOf("eslint.config.js", "module.exports = [];\n", "module"), "esm");
    assert.equal(moduleSystemOf("eslint.config.js", "export default [];\n", "commonjs"), "esm");
  });

  it("reads an ESM eslint.config.js as ESM", () => {
    assert.equal(moduleSystemOf("eslint.config.js", "export default [];\n", null), "esm");
  });

  /** ESLint 10 searches six names; three commands here knew four, so a `.mts` repo looked unconfigured. */
  it("covers every name ESLint searches, in ESLint's order", () => {
    assert.deepEqual(ESLINT_CONFIG_NAMES, [
      "eslint.config.js",
      "eslint.config.mjs",
      "eslint.config.cjs",
      "eslint.config.ts",
      "eslint.config.mts",
      "eslint.config.cts",
    ]);
  });

  it("reads the TypeScript config extensions the same way as their JS counterparts", () => {
    assert.equal(moduleSystemOf("eslint.config.mts", "module.exports = [];\n", null), "esm");
    assert.equal(moduleSystemOf("eslint.config.cts", "export default [];\n", "module"), "cjs");
    assert.equal(tierConfigFileName(moduleSystemOf("eslint.config.cts", "", null)), "eslint-tier.config.cjs");
  });

  it("trusts an explicit extension over the source", () => {
    assert.equal(moduleSystemOf("eslint.config.cjs", "export default [];\n", "module"), "cjs");
    assert.equal(moduleSystemOf("eslint.config.mjs", "module.exports = [];\n", null), "esm");
    assert.equal(moduleSystemOf("eslint.config.ts", "module.exports = [];\n", null), "esm");
  });

  /**
   * Never a bare `.js`: that means "whatever the nearest package.json says", so in a package without
   * `"type": "module"` an ESM file is read as CommonJS. Node below 20.19 refuses it and the
   * repository is left with no working linter.
   */
  it("names the file for the module system, never .js", () => {
    assert.equal(tierConfigFileName("esm"), "eslint-tier.config.mjs");
    assert.equal(tierConfigFileName("cjs"), "eslint-tier.config.cjs");
  });

  it("renders ESM for a .mjs name", () => {
    const rendered = renderTierConfig([], "eslint-tier.config.mjs");
    assert.match(rendered, /^import process from "node:process";$/m);
    assert.match(rendered, /^export default recomputing \? \[ignoreSelf\] : \[ignoreSelf, \.\.\.exceptions\];$/m);
  });

  /** ESM syntax in a `.cjs` file does not fail loudly — ESLint reports the config as unloadable. */
  it("renders CommonJS for a .cjs name", () => {
    const rendered = renderTierConfig([], "eslint-tier.config.cjs");
    assert.match(rendered, /^const process = require\("node:process"\);$/m);
    assert.match(rendered, /^module\.exports = recomputing \? \[ignoreSelf\] : \[ignoreSelf, \.\.\.exceptions\];$/m);
    assert.doesNotMatch(rendered, /^import /m);
    assert.doesNotMatch(rendered, /^export /m);
  });

  /**
   * A long path pushes a `files:` line past the repository's `printWidth`, and `prettier/prettier`
   * then reports an error in a file whose header says not to edit it — after the scan that produced
   * the list, so nothing excuses it and the build stays red.
   */
  it("exempts itself from linting, in both branches", () => {
    const rendered = renderTierConfig(tierList([failing("src/a.ts", "no-var")]), "eslint-tier.config.mjs");
    assert.match(rendered, /const ignoreSelf = \{ ignores: \["eslint-tier\.config\.mjs"\] \};/);
    assert.match(rendered, /recomputing \? \[ignoreSelf\] :/);
  });
});

describe("wiring the repository's own config", () => {
  it("recognises a config that already spreads the list", () => {
    const wired = withTierImport(`export default [\n${SPREAD_BLOCK.join("\n")}\n];\n`, "eslint-tier.config.mjs");
    assert.equal(importsTier(wired, "eslint-tier.config.mjs"), true);
  });

  it("imports a CommonJS config with require, not import", () => {
    const wired = withTierImport("module.exports = [];\n", "eslint-tier.config.cjs");
    assert.match(wired, /^const everBetterTier = require\("\.\/eslint-tier\.config\.cjs"\);$/m);
    assert.doesNotMatch(wired, /^import /m);
  });

  /**
   * The import is half the wiring and the spread is the half that does anything. A config with the
   * import alone downgrades nothing, so treating it as wired records a tier the repository is not
   * living under — the same defect as a config that could not be edited, disguised as an edited one.
   */
  it("does not call a config wired when it imports the list and never spreads it", () => {
    const halfway = 'import everBetterTier from "./eslint-tier.config.mjs";\nexport default [];\n';
    assert.equal(importsTier(halfway, "eslint-tier.config.mjs"), true);
    assert.equal(spreadsTier(halfway), false);
  });

  /** Commenting the spread out is how somebody turns the tier off by hand. It is not wiring. */
  it("does not read a spread inside a comment as wiring", () => {
    assert.equal(spreadsTier("export default [\n  // ...everBetterTier,\n];\n"), false);
    assert.equal(spreadsTier("export default [\n  /**\n   * ...everBetterTier\n   */\n];\n"), false);
    assert.equal(spreadsTier("export default [\n  /* ...everBetterTier, */\n];\n"), false, "a block comment on one line");
    assert.equal(spreadsTier("export default [\n  ...everBetterTier, // last so it wins\n];\n"), true);
    assert.equal(spreadsTier("export default [...everBetterTier];\n"), true);
  });

  /** Indentation and quote style are legal. Missing an import because of either declares it twice. */
  it("finds an import however it is written", () => {
    assert.equal(hasTierImport('  import everBetterTier from "./eslint-tier.config.mjs";\n'), true);
    assert.equal(hasTierImport("import everBetterTier from './eslint-tier.config.mjs';\n"), true);
    assert.equal(hasTierImport('\timport everBetterTier from "./eslint-tier.config.js";\n'), true);
  });

  /**
   * The stuck state this prevents: a second declaration of the same binding is a syntax error, and
   * no later run can repair it — the line it would add is the one the detector already sees.
   */
  it("never leaves two bindings, whatever the existing one looks like", () => {
    ['  import everBetterTier from "./eslint-tier.config.mjs";', "import everBetterTier from './eslint-tier.config.js';"].forEach((existing) => {
      const rewritten = withTierImport(`${existing}\nexport default [];\n`, "eslint-tier.config.mjs");
      assert.equal(rewritten.split("\n").filter((line) => line.includes("everBetterTier")).length, 1, existing);
      assert.equal(importsTier(rewritten, "eslint-tier.config.mjs"), true, existing);
    });
  });

  it("names the generated file a config actually imports, which need not be the current one", () => {
    assert.equal(importedTierName('import everBetterTier from "./eslint-tier.config.js";\n'), "eslint-tier.config.js");
    assert.equal(importedTierName('const everBetterTier = require("./eslint-tier.config.cjs");\n'), "eslint-tier.config.cjs");
    assert.equal(importedTierName("export default [];\n"), null);
  });

  it("does not mistake an unwired config for a wired one", () => {
    assert.equal(importsTier("export default [];\n", "eslint-tier.config.mjs"), false);
    assert.equal(hasTierImport("export default [];\n"), false);
  });

  /**
   * A config left pointing at the name an earlier version generated keeps applying that file's
   * exceptions while the ledger describes the new one — and the stale file is the more permissive.
   */
  it("is not satisfied by an import of a different generated file", () => {
    const stale = 'import everBetterTier from "./eslint-tier.config.js";\nexport default [];\n';
    assert.equal(hasTierImport(stale), true);
    assert.equal(importsTier(stale, "eslint-tier.config.mjs"), false);
  });

  /** Wiring twice declares the binding twice — a syntax error, and the repository loses its linter. */
  it("repoints an existing import instead of adding a second one", () => {
    const stale = 'import everBetterTier from "./eslint-tier.config.js";\nexport default [];\n';
    const repointed = withTierImport(stale, "eslint-tier.config.mjs");
    assert.equal(repointed.split("\n").filter((line) => line.includes("everBetterTier")).length, 1);
    assert.equal(importsTier(repointed, "eslint-tier.config.mjs"), true);
  });

  it("repoints across module systems too", () => {
    const stale = 'const everBetterTier = require("./eslint-tier.config.cjs");\nmodule.exports = [];\n';
    assert.equal(importsTier(withTierImport(stale, "eslint-tier.config.mjs"), "eslint-tier.config.mjs"), true);
  });
});
