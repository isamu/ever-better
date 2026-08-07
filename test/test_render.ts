import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEslintConfig } from "../src/generate/eslintConfig.ts";
import { renderWorkflow } from "../src/generate/workflow.ts";
import { extractNotes, NOTES_END, NOTES_START, renderQuality } from "../src/render/quality.ts";
import { applyRuleCounts, emptyState } from "../src/state.ts";

const configOptions = {
  typed: true,
  fileLineLimit: 600,
  testGlob: "test/**",
  testRunner: "vitest" as const,
};

describe("renderEslintConfig", () => {
  it("emits the type-aware tier for a TypeScript repo", () => {
    const config = renderEslintConfig(configOptions);
    assert.match(config, /recommendedTypeChecked/);
    assert.match(config, /projectService: true/);
  });

  it("exempts config files from the type-aware parser", () => {
    // Without this block the very first `eslint .` after bootstrap reports an unsuppressable
    // parse error on the config it just generated.
    const config = renderEslintConfig(configOptions);
    assert.match(config, /disableTypeChecked/);
    assert.match(config, /\*\*\/\*\.config\.js/);
  });

  it("falls back to the untyped tier for a JavaScript repo", () => {
    const config = renderEslintConfig({ ...configOptions, typed: false });
    assert.ok(!config.includes("recommendedTypeChecked"));
    assert.ok(!config.includes("no-explicit-any"));
  });

  it("carries the requested file limit into the rule", () => {
    const config = renderEslintConfig({ ...configOptions, fileLineLimit: 300 });
    assert.match(config, /"max-lines": \["error", \{ max: 300/);
  });

  it("exempts node:test's describe/it from the floating-promise rule", () => {
    const nodeTest = renderEslintConfig({ ...configOptions, testRunner: "node:test" });
    assert.match(nodeTest, /"@typescript-eslint\/no-floating-promises": "off"/);
  });

  it("does not add that exemption for a runner that does not need it", () => {
    assert.ok(!renderEslintConfig(configOptions).includes("no-floating-promises"));
  });
});

describe("renderWorkflow", () => {
  const scripts = { lint: true, format: true, build: false, typecheck: true, test: true };

  it("runs on all three platforms", () => {
    const workflow = renderWorkflow({ packageManager: "yarn", scripts, nodeVersion: "24" });
    assert.match(workflow, /ubuntu-latest, macos-latest, windows-latest/);
  });

  it("omits a step whose script does not exist", () => {
    const workflow = renderWorkflow({ packageManager: "yarn", scripts, nodeVersion: "24" });
    assert.ok(!workflow.includes("yarn build"));
    assert.match(workflow, /yarn lint/);
  });

  it("uses each package manager's frozen-lockfile install", () => {
    const yarn = renderWorkflow({ packageManager: "yarn", scripts, nodeVersion: "24" });
    const npm = renderWorkflow({ packageManager: "npm", scripts, nodeVersion: "24" });
    assert.match(yarn, /yarn install --frozen-lockfile/);
    assert.match(npm, /npm ci/);
  });

  it("adds the setup action a manager needs before install", () => {
    const pnpm = renderWorkflow({ packageManager: "pnpm", scripts, nodeVersion: "24" });
    assert.match(pnpm, /pnpm\/action-setup/);
  });

  it("declares least-privilege permissions", () => {
    const workflow = renderWorkflow({ packageManager: "npm", scripts, nodeVersion: "24" });
    assert.match(workflow, /permissions:\n {2}contents: read/);
  });
});

describe("QUALITY.md", () => {
  const frozen = () => {
    const state = applyRuleCounts(emptyState(), { "no-any": 4, "max-depth": 1 }, "freeze");
    return { ...state, frozenAt: "2026-08-08T00:00:00.000Z" };
  };

  it("lists the biggest backlog first", () => {
    const rendered = renderQuality(frozen(), "");
    const anyIndex = rendered.indexOf("no-any");
    const depthIndex = rendered.indexOf("max-depth");
    assert.ok(anyIndex < depthIndex);
  });

  it("shows a drop as a negative change", () => {
    const drained = applyRuleCounts(frozen(), { "no-any": 1, "max-depth": 1 }, "observe");
    assert.match(renderQuality(drained, ""), /\| 4 \| 1 \| -3 \|/);
  });

  it("round-trips the owner's notes", () => {
    const rendered = renderQuality(frozen(), "keep me");
    assert.equal(extractNotes(rendered), "keep me");
  });

  it("treats a file with no markers as having no notes", () => {
    assert.equal(extractNotes("# Quality\n\nsomething else"), "");
    assert.equal(extractNotes(null), "");
  });

  it("ignores markers that appear in the wrong order", () => {
    assert.equal(extractNotes(`${NOTES_END}stray${NOTES_START}`), "");
  });

  it("is stable: the same state renders byte-identically", () => {
    assert.equal(renderQuality(frozen(), "n"), renderQuality(frozen(), "n"));
  });
});
