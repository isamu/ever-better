import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEslintConfig } from "../src/generate/eslintConfig.ts";
import { renderWorkflow } from "../src/generate/workflow.ts";
import { extractNotes, NOTES_END, NOTES_START, renderQuality } from "../src/render/quality.ts";
import { applyRuleCounts, emptyState } from "../src/state.ts";
import type { Freshness } from "../src/freshness.ts";
import type { Framework } from "../src/types.ts";

const configOptions = {
  framework: "none" as const,
  runtime: "node" as const,
  typed: true,
  fileLineLimit: 600,
  testGlob: "test/**",
  testRunner: "vitest" as const,
};

describe("renderEslintConfig", () => {
  it("emits the type-aware tier for a TypeScript repo", () => {
    // strictTypeChecked, not recommendedTypeChecked: the rules that find real bugs live only in
    // the TypeChecked presets, and the `any` family only in the strict one.
    const config = renderEslintConfig(configOptions);
    assert.match(config, /strictTypeChecked/);
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
    assert.ok(!config.includes("TypeChecked"));
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

describe("renderEslintConfig — frameworks", () => {
  const forFramework = (framework: Framework, overrides: Partial<typeof configOptions> = {}) =>
    renderEslintConfig({ ...configOptions, framework, runtime: "both", ...overrides });

  it("spreads eslint-plugin-vue's flat config and parses SFCs afterwards", () => {
    const config = forFramework("vue");
    assert.match(config, /\.\.\.pluginVue\.configs\["flat\/recommended"\]/);
    // The .vue block must come after the plugin's own config, or vue-eslint-parser is replaced
    // and every component fails to parse.
    assert.ok(config.indexOf("flat/recommended") < config.indexOf('files: ["**/*.vue"]'));
  });

  it("tells the type program about .vue, without which every SFC is a parse error", () => {
    assert.match(forFramework("vue"), /extraFileExtensions: \[".vue"\]/);
  });

  it("turns off the unsafe-any family for SFCs, which the type program cannot resolve", () => {
    const config = forFramework("vue");
    assert.match(config, /"@typescript-eslint\/no-unsafe-member-access": "off"/);
  });

  it("does not emit the SFC exemption for an untyped Vue repo", () => {
    assert.ok(!forFramework("vue", { typed: false }).includes("no-unsafe-member-access"));
  });

  it("reaches react-hooks through configs.flat, not the eslintrc-shaped top level", () => {
    // `configs["recommended-latest"]` has `plugins: ["react-hooks"]` as an ARRAY, which makes
    // flat config refuse to load the whole file.
    assert.match(forFramework("react"), /reactHooks\.configs\.flat\["recommended-latest"\]/);
  });

  it("adds the Next plugin on top of the React one", () => {
    const config = forFramework("next");
    assert.match(config, /reactHooks\.configs\.flat/);
    assert.match(config, /next\.configs\["core-web-vitals"\]/);
  });

  it("ignores each framework's build output", () => {
    assert.match(forFramework("next"), /"\.next\/\*\*"/);
    assert.match(forFramework("nuxt"), /"\.output\/\*\*"/);
  });

  it("gives a frontend repo both global sets", () => {
    assert.match(forFramework("react"), /\{ \.\.\.globals\.browser, \.\.\.globals\.node \}/);
  });

  it("says so in the config when a framework's files go unlinted", () => {
    const config = forFramework("svelte");
    assert.match(config, /does not configure \.svelte files yet/);
  });

  it("puts prettier last so it can switch off the plugins' formatting rules", () => {
    const config = forFramework("vue");
    assert.ok(config.indexOf("flat/recommended") < config.indexOf("  prettier,"));
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

const FRESH: Freshness = { stale: false, reason: "current" };

describe("QUALITY.md", () => {
  const frozen = () => {
    const state = applyRuleCounts(emptyState(), { "no-any": 4, "max-depth": 1 }, "freeze");
    return { ...state, frozenAt: "2026-08-08T00:00:00.000Z" };
  };

  // Scoped to one section on purpose: the worklist lists the SMALLEST backlog first and the
  // ratchet table the largest, so an unscoped indexOf finds whichever section comes first and
  // proves nothing about either.
  const section = (rendered: string, from: string, to: string): string =>
    rendered.slice(rendered.indexOf(from), rendered.indexOf(to));

  it("lists the biggest backlog first in the ratchet table", () => {
    const table = section(renderQuality(frozen(), "", FRESH), "## Ratchet", "## Outstanding");
    assert.ok(table.indexOf("no-any") < table.indexOf("max-depth"));
  });

  it("puts the smallest backlog first in the worklist, which is the drain order", () => {
    const worklist = section(renderQuality(frozen(), "", FRESH), "## Worklist", "## Ratchet");
    assert.ok(worklist.indexOf("max-depth") < worklist.indexOf("no-any"));
  });

  it("shows a drop as a negative change", () => {
    const drained = applyRuleCounts(frozen(), { "no-any": 1, "max-depth": 1 }, "observe");
    assert.match(renderQuality(drained, "", FRESH), /\| 4 \| 1 \| -3 \|/);
  });

  it("round-trips the owner's notes", () => {
    const rendered = renderQuality(frozen(), "keep me", FRESH);
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
    assert.equal(renderQuality(frozen(), "n", FRESH), renderQuality(frozen(), "n", FRESH));
  });
});
