import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { everBetter, run, TIMEOUT_MS } from "./harness.ts";

const LEDGER = path.join(".ever-better", "tier.json");

/**
 * Deliberately long. A `files:` entry for this path pushes the generated file's line past the
 * `printWidth` bootstrap writes, and `prettier/prettier` then reports an error in a file the header
 * says not to edit — after the scan that produced the list, so nothing excuses it and the build
 * stays red. The generated file exempts itself for that reason, and this is what proves it.
 */
const OLD =
  "src/a-really-quite-long-directory-name/another-long-segment-for-length/and-one-more-for-good-measure/deeply/nested/inside/again/a-generously-long-file-name-here.ts";

const VIOLATION = "export const loose = (value: any) => value;\n";

const CLEAN = "export const tight = (value: string): string => value;\n";

type Entry = { file: string; rules: Record<string, number> };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isEntry = (value: unknown): value is Entry => isRecord(value) && typeof value["file"] === "string" && isRecord(value["rules"]);

const ledger = async (repo: string): Promise<Entry[]> => {
  const parsed: unknown = JSON.parse(await readFile(path.join(repo, LEDGER), "utf8"));
  assert.ok(Array.isArray(parsed) && parsed.every(isEntry), "the ledger is not a list of entries");
  return parsed;
};

const eslintErrors = async (repo: string): Promise<number> => {
  const result = await run(path.join(repo, "node_modules", ".bin", "eslint"), ["."], repo);
  return Number(/(\d{1,9}) error/.exec(result.stdout)?.[1] ?? "0");
};

/**
 * The tier lifecycle against real ESLint. `freeze` grandfathers a COUNT; this mode grandfathers a
 * file-and-rule list and makes everything else an error, so what has to hold here is that the list
 * only ever shrinks — including when it has shrunk to nothing, which is the state a repository is
 * in exactly when the promise matters most and is where it was broken.
 */
describe("tier lifecycle", { timeout: TIMEOUT_MS }, () => {
  let repo = "";

  before(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "ever-better-tier-"));
    await mkdir(path.join(repo, "src"), { recursive: true });
    await run("git", ["init", "-q", "."], repo);
    await writeFile(path.join(repo, "package.json"), `${JSON.stringify({ name: "tier-fixture", private: true, version: "1.0.0", type: "module" }, null, 2)}\n`);
    await writeFile(
      path.join(repo, "tsconfig.json"),
      `${JSON.stringify({ compilerOptions: { target: "ES2022", module: "nodenext", moduleResolution: "nodenext", strict: true, noEmit: true } }, null, 2)}\n`,
    );
    await mkdir(path.dirname(path.join(repo, OLD)), { recursive: true });
    await writeFile(path.join(repo, OLD), VIOLATION);
    const bootstrapped = await everBetter(["bootstrap"], repo);
    assert.equal(bootstrapped.code, 0, bootstrapped.stderr);
  });

  after(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("takes a tier and turns today's failures into warnings", async () => {
    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(
      (await ledger(repo)).some((entry) => entry.file === OLD),
      "the failing file was not written into the list",
    );
    assert.equal(await eslintErrors(repo), 0, "a file the tier excused is still an error");
  });

  /**
   * The hole a file-and-rule list cannot see on its own. The pair is already a warning, so a SECOND
   * violation of the same rule in the same file is a warning too and `eslint .` exits 0 — the count
   * in the ledger is the only record of how many there were, and `--check` is what reads it.
   */
  it("refuses a second violation of a rule the file is already excused for", async () => {
    const clean = await everBetter(["tier", "--check"], repo);
    assert.equal(clean.code, 0, clean.stdout + clean.stderr);

    const before = await readFile(path.join(repo, LEDGER), "utf8");
    await writeFile(path.join(repo, OLD), `${VIOLATION}${VIOLATION.replace("loose", "looser")}`);

    const lint = await run(path.join(repo, "node_modules", ".bin", "eslint"), ["."], repo);
    assert.equal(lint.code, 0, "the premise: eslint itself cannot see this, because the pair is a warning");

    const result = await everBetter(["tier", "--check"], repo);
    assert.equal(result.code, 1, "a violation added inside an excused pair was accepted");
    assert.match(result.stdout, /excused: /);
    assert.equal(await readFile(path.join(repo, LEDGER), "utf8"), before, "--check wrote to the ledger");

    await writeFile(path.join(repo, OLD), VIOLATION);
  });

  it("refuses a violation in a file the list does not excuse", async () => {
    await writeFile(path.join(repo, "src", "new.ts"), VIOLATION);
    const before = await ledger(repo);
    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 1, "a new violation must not be written into the list");
    assert.match(result.stdout, /may only shrink/);
    assert.deepEqual(await ledger(repo), before, "the refused run edited the ledger anyway");
  });

  /**
   * `bootstrap`'s own generated `eslint.config.js` fails the `prettier/prettier` rule it writes, so
   * the fixture starts with an entry nothing in this test put there (issue #66). Fixing it here is
   * what a user would do, and it lets the list drain to nothing — the state the next case needs.
   */
  it("drains the list as the excused violations are fixed", async () => {
    await rm(path.join(repo, "src", "new.ts"));
    await writeFile(path.join(repo, OLD), CLEAN);
    await run(path.join(repo, "node_modules", ".bin", "eslint"), ["eslint.config.js", "--fix"], repo);

    // The gate runs on pull requests, so it may not edit what it is gating: it reports the shrink
    // and leaves the ledger for `tier` to rewrite.
    const before = await readFile(path.join(repo, LEDGER), "utf8");
    const gate = await everBetter(["tier", "--check"], repo);
    assert.equal(gate.code, 0, gate.stdout + gate.stderr);
    assert.match(gate.stdout, /have been fixed since the ledger was written/);
    assert.equal(await readFile(path.join(repo, LEDGER), "utf8"), before, "--check rewrote the ledger");

    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(await ledger(repo), [], "the list did not drain");
  });

  /**
   * The regression this pins: a drained list is a repository that has finished, and the run that
   * follows it used to read `[]` as "no tier taken yet" and grandfather the next violation.
   */
  it("still refuses once the list has drained to nothing", async () => {
    await writeFile(path.join(repo, OLD), VIOLATION);
    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 1, "an empty list rebaselined instead of enforcing shrink-only");
    assert.deepEqual(await ledger(repo), [], "the refused run wrote the violation into the ledger");
  });

  /**
   * A `.cjs` config takes `require`, and the generated file has to be CommonJS to match. Wiring it
   * with ESM syntax does not fail loudly — ESLint reports the config as unloadable and the
   * repository is left with no linter at all, which is what this asserts against.
   */
  it("wires a CommonJS config with require and generates a .cjs list", async () => {
    await rm(path.join(repo, LEDGER));
    await rm(path.join(repo, "eslint.config.js"));
    await rm(path.join(repo, "eslint-tier.config.mjs"), { force: true });
    await writeFile(path.join(repo, "eslint.config.cjs"), 'module.exports = [{ rules: { "no-var": "error" } }];\n');
    await writeFile(path.join(repo, "src", "old.js"), "var loose = 1;\nmodule.exports = { loose };\n");

    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 0, result.stderr);

    const generated = await readFile(path.join(repo, "eslint-tier.config.cjs"), "utf8");
    assert.match(generated, /module\.exports = recomputing \? \[ignoreSelf\] : \[ignoreSelf, \.\.\.exceptions\];/);
    assert.doesNotMatch(generated, /^import /m);
    assert.match(await readFile(path.join(repo, "eslint.config.cjs"), "utf8"), /^const everBetterTier = require\("\.\/eslint-tier\.config\.cjs"\);/);

    const lint = await run(path.join(repo, "node_modules", ".bin", "eslint"), ["."], repo);
    assert.ok(!lint.stderr.includes("Oops"), `eslint could not load the config it was given:\n${lint.stderr}`);
    assert.equal(await eslintErrors(repo), 0, "the tiered violation is still an error");
  });

  /**
   * A flat config may be CommonJS in a plain `eslint.config.js` — in a package that does not declare
   * `"type": "module"`, which is what decides it. Wired with an `import`, ESLint answers
   * `ReferenceError: module is not defined in ES module scope`: no linter at all, while `tier`
   * reports success.
   */
  it("reads a CommonJS eslint.config.js as CommonJS", async () => {
    const manifest = path.join(repo, "package.json");
    const esm = await readFile(manifest, "utf8");
    await writeFile(manifest, esm.replace('"type": "module",', ""));
    await rm(path.join(repo, LEDGER), { force: true });
    await rm(path.join(repo, "eslint.config.cjs"), { force: true });
    await rm(path.join(repo, "eslint-tier.config.cjs"), { force: true });
    await writeFile(path.join(repo, "eslint.config.js"), 'module.exports = [{ rules: { "no-var": "error" } }];\n');
    await writeFile(path.join(repo, "src", "old.js"), "var loose = 1;\nmodule.exports = { loose };\n");

    try {
      const result = await everBetter(["tier"], repo);
      assert.equal(result.code, 0, result.stderr);
      assert.match(await readFile(path.join(repo, "eslint.config.js"), "utf8"), /^const everBetterTier = require\("\.\/eslint-tier\.config\.cjs"\);/);

      const lint = await run(path.join(repo, "node_modules", ".bin", "eslint"), ["."], repo);
      assert.ok(!lint.stderr.includes("Oops"), `eslint could not load the config it was given:\n${lint.stderr}`);
    } finally {
      await writeFile(manifest, esm);
    }
  });

  /**
   * A config left pointing at a name an earlier version generated keeps applying that file's
   * exceptions while the ledger describes the new one, and the stale file is the more permissive.
   */
  it("repoints a config wired to a superseded generated file", async () => {
    await rm(path.join(repo, "eslint.config.js"), { force: true });
    await rm(path.join(repo, "eslint.config.cjs"), { force: true });
    await rm(path.join(repo, "src", "old.js"), { force: true });
    await writeFile(
      path.join(repo, "eslint-tier.config.js"),
      "// Generated by ever-better. Do not edit — `ever-better tier` rewrites this file.\nexport default [];\n",
    );
    await writeFile(path.join(repo, "eslint.config.js"), 'import everBetterTier from "./eslint-tier.config.js";\nexport default [...everBetterTier];\n');

    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Repointed eslint\.config\.js at eslint-tier\.config\.mjs/);
    assert.match(await readFile(path.join(repo, "eslint.config.js"), "utf8"), /from "\.\/eslint-tier\.config\.mjs"/);
    await assert.rejects(readFile(path.join(repo, "eslint-tier.config.js"), "utf8"), "the superseded file was left behind");
  });

  /**
   * Text that looks like wiring is not wiring that works, and one sampled pair is not the list. A
   * later block re-raising ONE of the listed rules leaves the tier partly inert: every textual check
   * passes, the earlier listed pairs are warnings, and that one is still an error. Only running
   * ESLint over the whole list sees it — from both the recording path and the gate.
   */
  it("refuses when a later block re-raises one of the listed rules", async () => {
    const config = (extra: string): string =>
      [
        'import everBetterTier from "./eslint-tier.config.mjs";',
        "export default [",
        '  { rules: { "no-var": "error", "no-console": "error" } },',
        "  ...everBetterTier,",
        extra,
        "];",
        "",
      ]
        .filter((line) => line !== "")
        .join("\n");

    await rm(path.join(repo, LEDGER), { force: true });
    await rm(path.join(repo, "eslint.config.cjs"), { force: true });
    await rm(path.join(repo, "src", "old.js"), { force: true });
    await writeFile(path.join(repo, "src", "late.js"), "var loose = 1;\nexport { loose };\n");
    await writeFile(path.join(repo, "src", "talks.js"), 'export const talk = () => console.log("hi");\n');
    await writeFile(path.join(repo, "eslint.config.js"), config(""));

    try {
      const taken = await everBetter(["tier"], repo);
      assert.equal(taken.code, 0, taken.stderr);
      const ledgerBefore = await readFile(path.join(repo, LEDGER), "utf8");
      assert.match(ledgerBefore, /no-console/, "the fixture needs a second listed rule to sample past");

      // Only `no-console` is re-raised, and it is not the first entry in the ledger.
      await writeFile(path.join(repo, "eslint.config.js"), config('  { rules: { "no-console": "error" } },'));

      const gate = await everBetter(["tier", "--check"], repo);
      assert.equal(gate.code, 1, "the gate passed a tier ESLint only partly applies");
      assert.match(gate.stdout, /no-console/);

      const rerun = await everBetter(["tier"], repo);
      assert.equal(rerun.code, 1, "a tier ESLint only partly applies was recorded");
      assert.equal(await readFile(path.join(repo, LEDGER), "utf8"), ledgerBefore, "the refused run rewrote the ledger");
    } finally {
      await rm(path.join(repo, "src", "late.js"), { force: true });
      await rm(path.join(repo, "src", "talks.js"), { force: true });
    }
  });

  /**
   * The import is half the wiring. A config that imports the list and never spreads it downgrades
   * nothing, so calling it wired records a tier the repository is not living under — and the file
   * the ledger says is excused is still an error.
   */
  it("adds the spread when the config imports the list without using it", async () => {
    await rm(path.join(repo, LEDGER), { force: true });
    await rm(path.join(repo, "eslint.config.cjs"), { force: true });
    await rm(path.join(repo, "src", "old.js"), { force: true });
    await writeFile(
      path.join(repo, "eslint.config.js"),
      'import everBetterTier from "./eslint-tier.config.mjs";\nexport default [{ rules: { "no-var": "error" } }];\n',
    );
    await writeFile(path.join(repo, "src", "half.js"), "var loose = 1;\nexport { loose };\n");

    try {
      const result = await everBetter(["tier"], repo);
      assert.equal(result.code, 0, result.stderr);

      const lint = await run(path.join(repo, "node_modules", ".bin", "eslint"), ["."], repo);
      assert.ok(!lint.stderr.includes("Oops"), lint.stderr);
      assert.equal(await eslintErrors(repo), 0, "the ledger recorded a tier that is not in force");
    } finally {
      await rm(path.join(repo, "src", "half.js"), { force: true });
    }
  });

  /**
   * A tier that is not spread into the config is not in force: every listed pair is still an error.
   * Recording it in the ledger anyway and exiting 0 tells the user they are covered when they are
   * not, so this refuses — after writing the generated file, so the import they add resolves.
   */
  it("refuses to record a tier it could not put in force", async () => {
    await rm(path.join(repo, LEDGER), { force: true });
    await rm(path.join(repo, "eslint.config.cjs"), { force: true });
    await rm(path.join(repo, "eslint-tier.config.mjs"), { force: true });
    await writeFile(path.join(repo, "eslint.config.js"), 'const config = [{ rules: { "no-var": "error" } }];\nexport default config;\n');

    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 1, "a tier that is not in force must not be recorded");
    assert.match(result.stdout, /import everBetterTier from "\.\/eslint-tier\.config\.mjs";/);
    await assert.rejects(readFile(path.join(repo, LEDGER), "utf8"), "the ledger recorded a tier nobody is living under");
    await readFile(path.join(repo, "eslint-tier.config.mjs"), "utf8");
  });

  /**
   * A lock that cannot be READ is not a lock with no holder. Taking it over on that reading removes
   * one held by a live run, which is the whole thing the lock exists to prevent. A directory stands
   * in for "unreadable" because it is unreadable for root too.
   */
  it("refuses a lock it cannot read rather than taking it over", async () => {
    const lock = path.join(repo, ".ever-better", "tier.lock");
    await mkdir(lock, { recursive: true });
    try {
      const result = await everBetter(["tier"], repo);
      assert.equal(result.code, 1, "an unreadable lock was taken over");
      assert.match(result.stdout, /cannot be read/);
    } finally {
      await rm(lock, { recursive: true, force: true });
    }
  });

  /** Unreadable is not missing: starting over would forgive everything failing today. */
  it("refuses a ledger it cannot read at all", async () => {
    await rm(path.join(repo, LEDGER), { force: true });
    await mkdir(path.join(repo, LEDGER), { recursive: true });
    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 1, "a ledger that cannot be read was treated as a fresh start");
    assert.match(result.stdout, /could not be read/);
    await rm(path.join(repo, LEDGER), { recursive: true });
  });

  it("refuses a ledger it cannot read rather than starting over", async () => {
    await writeFile(path.join(repo, LEDGER), '[{"file":"src/old.ts","rul');
    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 1, "an unreadable ledger was treated as a fresh start");
    assert.match(result.stdout, /could not be read as a list of \{file, rules\} entries/);
  });
});
