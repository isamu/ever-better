import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { everBetter, run, TIMEOUT_MS } from "./harness.ts";

const LEDGER = path.join(".ever-better", "tier.json");

const VIOLATION = "export const loose = (value: any) => value;\n";

const CLEAN = "export const tight = (value: string): string => value;\n";

type Entry = { file: string; rules: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isEntry = (value: unknown): value is Entry => isRecord(value) && typeof value["file"] === "string" && Array.isArray(value["rules"]);

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
    await writeFile(path.join(repo, "src", "old.ts"), VIOLATION);
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
      (await ledger(repo)).some((entry) => entry.file === "src/old.ts"),
      "the failing file was not written into the list",
    );
    assert.equal(await eslintErrors(repo), 0, "a file the tier excused is still an error");
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
    await writeFile(path.join(repo, "src", "old.ts"), CLEAN);
    await run(path.join(repo, "node_modules", ".bin", "eslint"), ["eslint.config.js", "--fix"], repo);

    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(await ledger(repo), [], "the list did not drain");
  });

  /**
   * The regression this pins: a drained list is a repository that has finished, and the run that
   * follows it used to read `[]` as "no tier taken yet" and grandfather the next violation.
   */
  it("still refuses once the list has drained to nothing", async () => {
    await writeFile(path.join(repo, "src", "old.ts"), VIOLATION);
    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 1, "an empty list rebaselined instead of enforcing shrink-only");
    assert.deepEqual(await ledger(repo), [], "the refused run wrote the violation into the ledger");
  });

  it("refuses a ledger it cannot read rather than starting over", async () => {
    await writeFile(path.join(repo, LEDGER), '[{"file":"src/old.ts","rul');
    const result = await everBetter(["tier"], repo);
    assert.equal(result.code, 1, "an unreadable ledger was treated as a fresh start");
    assert.match(result.stdout, /not a list of \{file, rules\} entries/);
  });
});
