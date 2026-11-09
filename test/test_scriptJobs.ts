import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { basename, commandOf, runsTool, tokensOf } from "../src/detect/commandText.ts";
import { scriptNameFor } from "../src/detect/scriptJobs.ts";

describe("commandOf", () => {
  it("looks past the wrappers to the command", () => {
    assert.equal(commandOf(tokensOf("npx eslint .")), "eslint");
    assert.equal(commandOf(tokensOf("yarn run eslint")), "eslint");
    assert.equal(commandOf(tokensOf("CI=1 sudo gitleaks git .")), "gitleaks");
  });

  it("looks past a workspaces delegation, which is how a monorepo root runs anything", () => {
    assert.equal(commandOf(tokensOf("yarn workspaces run eslint")), "eslint");
  });

  it("is null for nothing at all", () => {
    assert.equal(commandOf(tokensOf("   ")), null);
    assert.equal(commandOf(tokensOf("yarn run")), null);
  });
});

describe("basename", () => {
  it("is the command without its path", () => {
    assert.equal(basename("./node_modules/.bin/eslint"), "eslint");
    assert.equal(basename("eslint"), "eslint");
  });
});

describe("runsTool", () => {
  it("separates the tool from a command that merely mentions it", () => {
    assert.equal(runsTool("eslint --fix .", "eslint"), true);
    assert.equal(runsTool("echo eslint", "eslint"), false);
  });
});

describe("scriptNameFor", () => {
  it("prefers the conventional name, which is what CI will look for", () => {
    assert.equal(scriptNameFor({ scripts: { lint: "eslint .", eslint: "eslint ." } }, "lint"), "lint");
  });

  it("accepts the namespaced form of the conventional name", () => {
    assert.equal(scriptNameFor({ scripts: { "lint:fix": "eslint --fix ." } }, "lint"), "lint:fix");
  });

  it("finds the gate under an unexpected name, by what it runs", () => {
    assert.equal(scriptNameFor({ scripts: { eslint: "eslint ." } }, "lint"), "eslint");
    assert.equal(scriptNameFor({ scripts: { "check-types": "tsc --noEmit" } }, "typecheck"), "check-types");
  });

  it("finds it behind a workspaces delegation", () => {
    assert.equal(scriptNameFor({ scripts: { eslint: "yarn workspaces run eslint" } }, "lint"), "eslint");
  });

  it("reads past the first command in a chain", () => {
    assert.equal(scriptNameFor({ scripts: { verify: "prettier --check . && eslint ." } }, "lint"), "verify");
  });

  it("does not read an emitting `tsc` as the typecheck gate", () => {
    // `build: tsc` compiles; only --noEmit is the check, and calling the build a typecheck would
    // report a gate that nothing enforces.
    assert.equal(scriptNameFor({ scripts: { build: "tsc -p tsconfig.build.json" } }, "typecheck"), null);
    assert.equal(scriptNameFor({ scripts: { build: "tsc --noemit" } }, "typecheck"), "build");
  });

  it("is null when nothing performs the job, and when there are no scripts at all", () => {
    assert.equal(scriptNameFor({ scripts: { test: "node --test" } }, "lint"), null);
    assert.equal(scriptNameFor({ name: "bare" }, "lint"), null);
    assert.equal(scriptNameFor(null, "lint"), null);
  });
});
