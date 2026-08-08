import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { load } from "js-yaml";
import { renderCodexReviewWorkflow } from "../src/generate/codexReview.ts";
import { renderDependabot } from "../src/generate/dependabot.ts";
import { renderGateWorkflow } from "../src/generate/gateWorkflow.ts";
import { renderDeadCodeWorkflow, renderDuplicationWorkflow } from "../src/generate/scanWorkflows.ts";
import { renderWorkflow } from "../src/generate/workflow.ts";

const SCRIPTS = { lint: true, format: true, build: true, typecheck: true, test: true };

const GENERATED: readonly (readonly [string, string])[] = [
  ["ci.yml", renderWorkflow({ packageManager: "yarn", scripts: SCRIPTS, nodeVersion: "24" })],
  ["ever-better.yml", renderGateWorkflow("yarn", "24")],
  ["codex-review.yml", renderCodexReviewWorkflow("24")],
  ["duplication-scan.yml", renderDuplicationWorkflow("24")],
  ["dead-code-scan.yml", renderDeadCodeWorkflow("yarn", "24")],
  ["dependabot.yml", renderDependabot("yarn")],
];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/**
 * Every one of these is built by concatenating strings, so a stray quote or a mis-indented line
 * ships to every repository this tool touches and only fails once it is on GitHub. Parsing is the
 * cheapest thing that would have caught it.
 */
describe("generated YAML", () => {
  for (const [name, contents] of GENERATED) {
    it(`${name} parses`, () => {
      assert.doesNotThrow(() => load(contents));
    });
  }

  for (const [name, contents] of GENERATED.filter(([file]) => file !== "dependabot.yml")) {
    it(`${name} declares jobs and least-privilege permissions`, () => {
      const parsed: unknown = load(contents);
      assert.ok(isRecord(parsed));
      assert.ok(isRecord(parsed["jobs"]), "no jobs");
      assert.deepEqual(parsed["permissions"], { contents: "read" }, "permissions must start read-only");
    });
  }

  // Both Windows failures this repo has had passed on Linux and macOS first, and neither was
  // reproducible on a Mac. The matrix is the only thing that sees them.
  it("ci.yml runs on all three platforms", () => {
    const parsed: unknown = load(renderWorkflow({ packageManager: "yarn", scripts: SCRIPTS, nodeVersion: "24" }));
    assert.ok(isRecord(parsed) && isRecord(parsed["jobs"]));
    const job = Object.values(parsed["jobs"])[0];
    assert.ok(isRecord(job) && isRecord(job["strategy"]) && isRecord(job["strategy"]["matrix"]));
    assert.deepEqual(job["strategy"]["matrix"]["os"], ["ubuntu-latest", "macos-latest", "windows-latest"]);
  });

  // Extra permissions belong on the JOB that needs them, never at the top of the file where they
  // apply to everything the workflow might grow.
  it("scopes the SARIF upload's write to the job", () => {
    const parsed: unknown = load(renderDuplicationWorkflow("24"));
    assert.ok(isRecord(parsed) && isRecord(parsed["jobs"]));
    const job = Object.values(parsed["jobs"])[0];
    assert.ok(isRecord(job));
    assert.deepEqual(job["permissions"], { contents: "read", "security-events": "write" });
  });

  it("scopes the Codex comment's write to the job", () => {
    const parsed: unknown = load(renderCodexReviewWorkflow("24"));
    assert.ok(isRecord(parsed) && isRecord(parsed["jobs"]));
    const job = Object.values(parsed["jobs"])[0];
    assert.ok(isRecord(job));
    assert.deepEqual(job["permissions"], { contents: "read", "pull-requests": "write" });
  });

  it("dependabot.yml declares version 2 and both ecosystems", () => {
    const parsed: unknown = load(renderDependabot("yarn"));
    assert.ok(isRecord(parsed));
    assert.equal(parsed["version"], 2);
    assert.ok(Array.isArray(parsed["updates"]));
    assert.equal(parsed["updates"].length, 2);
  });
});
