import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ACTION_VERSIONS, DEFAULT_NODE_VERSION } from "../src/generate/actionVersions.ts";

const workflowDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".github",
  "workflows",
);

const ownWorkflows = async (): Promise<string> => {
  const names = await readdir(workflowDir);
  const contents = await Promise.all(
    names
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .map((name) => readFile(path.join(workflowDir, name), "utf8")),
  );
  return contents.join("\n");
};

const usedActions = (yaml: string, owner: string): string[] => {
  // Dedupe the STRINGS, not the match objects — a Set of matches never collapses anything.
  const pattern = new RegExp(`${owner}[\\w./-]*@v\\d+`, "g");
  return [...new Set([...yaml.matchAll(pattern)].map((match) => match[0]))];
};

/**
 * A hardcoded action version rots, and a stale one is invisible — the generated workflow keeps
 * working two majors behind and nobody looks. Dependabot bumps THIS repository's workflows; these
 * assertions then fail until the generator follows, which is the only signal that would arrive.
 */
describe("generated action versions match this repo's own", () => {
  it("uses the same actions/checkout", async () => {
    const yaml = await ownWorkflows();
    assert.deepEqual(usedActions(yaml, "actions/checkout"), [ACTION_VERSIONS.checkout]);
  });

  it("uses the same actions/setup-node", async () => {
    const yaml = await ownWorkflows();
    assert.deepEqual(usedActions(yaml, "actions/setup-node"), [ACTION_VERSIONS.setupNode]);
  });

  it("uses the same codeql-action for the SARIF upload", async () => {
    const yaml = await ownWorkflows();
    assert.deepEqual(usedActions(yaml, "github/codeql-action"), [ACTION_VERSIONS.uploadSarif]);
  });

  it("uses the same Node major", async () => {
    const yaml = await ownWorkflows();
    const versions = [...new Set([...yaml.matchAll(/node-version: "\d+"/g)].map((m) => m[0]))];
    assert.deepEqual(versions, [`node-version: "${DEFAULT_NODE_VERSION}"`]);
  });
});
