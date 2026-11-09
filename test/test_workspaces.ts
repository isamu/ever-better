import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workspaceDirs, workspaceEntries, workspacePatterns } from "../src/detect/workspaces.ts";
import type { PackageJson } from "../src/types.ts";

/** The same narrowing `gatherFacts` does, so a test can hand this malformed input without a cast. */
const parseManifest = (text: string): PackageJson | null => {
  const parsed: unknown = JSON.parse(text);
  return typeof parsed === "object" && parsed !== null ? parsed : null;
};

const MONOREPO = [
  "package.json",
  "packages/a/package.json",
  "packages/a/tsconfig.json",
  "packages/a/src/index.ts",
  "packages/b/package.json",
  "tools/c/package.json",
];

describe("workspacePatterns", () => {
  it("reads the array form", () => {
    assert.deepEqual(workspacePatterns({ workspaces: ["packages/*", "tools/*"] }), ["packages/*", "tools/*"]);
  });

  it("reads the { packages } form", () => {
    assert.deepEqual(workspacePatterns({ workspaces: { packages: ["apps/*"] } }), ["apps/*"]);
  });

  it("is empty for a single-package repo and for no manifest at all", () => {
    assert.deepEqual(workspacePatterns({ name: "one" }), []);
    assert.deepEqual(workspacePatterns(null), []);
  });

  it("drops an entry that is not a string, because the manifest is unvalidated JSON", () => {
    // A number would become a pattern, and `new RegExp` on it matches something.
    assert.deepEqual(workspacePatterns(parseManifest('{"workspaces":["packages/*",7,null]}')), ["packages/*"]);
  });
});

describe("workspaceDirs", () => {
  it("selects the directories holding a manifest the pattern matches", () => {
    assert.deepEqual(workspaceDirs({ workspaces: ["packages/*"] }, MONOREPO), ["packages/a", "packages/b"]);
  });

  it("never selects the root, whose entries are already answered directly", () => {
    assert.deepEqual(workspaceDirs({ workspaces: ["*"] }, ["package.json"]), []);
  });

  it("selects nothing from a pattern matching no package, so a stale entry is harmless", () => {
    assert.deepEqual(workspaceDirs({ workspaces: ["removed/*"] }, MONOREPO), []);
  });

  it("honours a negated pattern", () => {
    assert.deepEqual(workspaceDirs({ workspaces: ["packages/*", "!packages/b"] }, MONOREPO), ["packages/a"]);
  });

  it("keeps `*` to one segment and lets `**` span any", () => {
    const nested = ["packages/a/package.json", "packages/group/b/package.json"];
    assert.deepEqual(workspaceDirs({ workspaces: ["packages/*"] }, nested), ["packages/a"]);
    assert.deepEqual(
      workspaceDirs({ workspaces: ["packages/**"] }, nested),
      nested.map((file) => file.replace("/package.json", "")),
    );
  });

  it("treats a dot in a pattern as a dot rather than as any character", () => {
    assert.deepEqual(workspaceDirs({ workspaces: ["pkg.d/*"] }, ["pkgxd/a/package.json"]), []);
  });

  it("selects nothing without a workspaces field", () => {
    assert.deepEqual(workspaceDirs({ name: "one" }, MONOREPO), []);
  });
});

describe("workspaceEntries", () => {
  it("lists the names directly inside a workspace", () => {
    const entries = workspaceEntries(["packages/a"], MONOREPO);
    assert.deepEqual(
      entries.toSorted((left, right) => left.localeCompare(right)),
      ["package.json", "tsconfig.json"],
    );
  });

  it("does not reach into a subdirectory of one, which would report any nested name as present", () => {
    assert.equal(workspaceEntries(["packages/a"], MONOREPO).includes("index.ts"), false);
  });

  it("skips files at the root", () => {
    assert.deepEqual(workspaceEntries(["packages/a"], ["tsconfig.json"]), []);
  });

  it("lists a name once however many workspaces hold it", () => {
    const entries = workspaceEntries(["packages/a", "packages/b"], ["packages/a/eslint.config.mjs", "packages/b/eslint.config.mjs"]);
    assert.deepEqual(entries, ["eslint.config.mjs"]);
  });

  it("is empty when there are no workspaces", () => {
    assert.deepEqual(workspaceEntries([], MONOREPO), []);
  });
});
