import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { after, before, describe, it } from "node:test";
import { runReport } from "../src/commands/report.ts";

const SUMMARY = "GITHUB_STEP_SUMMARY";

/**
 * The command promises it is not a gate: it never changes an exit code, and it degrades rather than
 * throwing when ESLint cannot run or the summary cannot be written. Those are the two `catch`es in
 * the file, and neither is reachable from the pure tests.
 */
describe("ever-better report", () => {
  let repo = "";
  const original = process.env[SUMMARY];

  before(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "ever-better-report-"));
    await writeFile(
      path.join(repo, "eslint-suppressions.json"),
      JSON.stringify({ "src/a.ts": { "no-var": { count: 2 } }, "test/b.ts": { "max-depth": { count: 1 } } }),
      "utf8",
    );
  });

  after(async () => {
    if (original === undefined) delete process.env[SUMMARY];
    else process.env[SUMMARY] = original;
    await rm(repo, { recursive: true, force: true });
  });

  it("reports the backlog from the ratchet file when ESLint cannot run", async () => {
    delete process.env[SUMMARY];
    const markdown = await runReport({ cwd: repo, json: false });
    assert.match(markdown, /3 suppressed/);
    assert.match(markdown, /ratchet file alone/);
    assert.match(markdown, /\| `no-var` \|/);
  });

  it("appends to the step summary when Actions asks for one", async () => {
    const summary = path.join(repo, "summary.md");
    process.env[SUMMARY] = summary;
    const markdown = await runReport({ cwd: repo, json: false });
    assert.equal(await readFile(summary, "utf8"), `${markdown}\n`);
  });

  it("appends rather than replacing, so other steps keep theirs", async () => {
    const summary = path.join(repo, "shared.md");
    await writeFile(summary, "## an earlier step\n", "utf8");
    process.env[SUMMARY] = summary;
    await runReport({ cwd: repo, json: false });
    assert.match(await readFile(summary, "utf8"), /^## an earlier step\n/);
  });

  /** Outside Actions the variable is unset and a terminal run must leave nothing behind. */
  it("writes no summary when Actions did not ask for one", async () => {
    const summary = path.join(repo, "once.md");
    process.env[SUMMARY] = summary;
    await runReport({ cwd: repo, json: false });
    const afterFirst = await readFile(summary, "utf8");

    delete process.env[SUMMARY];
    await runReport({ cwd: repo, json: false });
    assert.equal(await readFile(summary, "utf8"), afterFirst, "the second run appended with no summary requested");
  });

  /** A report that failed the job because it could not write its own summary would be a gate. */
  it("still returns the report when the summary cannot be written", async () => {
    process.env[SUMMARY] = path.join(repo, "no-such-directory", "summary.md");
    const markdown = await runReport({ cwd: repo, json: false });
    assert.match(markdown, /Lint findings/);
  });

  it("emits parseable JSON, and does not touch the summary for it", async () => {
    const summary = path.join(repo, "json.md");
    process.env[SUMMARY] = summary;
    const output = await runReport({ cwd: repo, json: true });
    const parsed: unknown = JSON.parse(output);
    assert.ok(typeof parsed === "object" && parsed !== null);
    await assert.rejects(readFile(summary, "utf8"));
  });
});
