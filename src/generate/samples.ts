import { renderCodexReviewWorkflow } from "./codexReview.ts";
import { renderDependabot } from "./dependabot.ts";
import { renderEslintConfig } from "./eslintConfig.ts";
import { renderGateWorkflow } from "./gateWorkflow.ts";
import { renderGitattributes } from "./gitattributes.ts";
import { renderKnipConfig } from "./knipConfig.ts";
import { renderDeadCodeWorkflow, renderDuplicationWorkflow } from "./scanWorkflows.ts";
import { renderSecretScanWorkflow } from "./secretScan.ts";
import { renderWorkflow } from "./workflow.ts";
import type { SourceFile } from "../types.ts";

export type Sample = {
  title: string;
  language: string;
  note: string;
  contents: string;
};

const NODE = "24";

const SCRIPTS = { lint: true, format: true, build: true, typecheck: true, test: true };

const TS_SOURCES: SourceFile[] = [
  { path: "src/index.ts", ext: "ts", lines: 40 },
  { path: "test/index.test.ts", ext: "ts", lines: 30 },
];

const base = { fileLineLimit: 600, testGlob: "test/**", testRunner: "vitest" as const };

/**
 * The samples are RENDERED, never transcribed. A hand-copied example of generated output is wrong
 * the first time a generator changes, and wrong examples are worse than none — a reader who follows
 * one and gets something else stops believing the rest of the page.
 */
export const CONFIG_SAMPLES: readonly Sample[] = [
  {
    title: "eslint.config.js — plain TypeScript, Node",
    language: "js",
    note: "Every rule is an error. Whatever exists when you freeze is grandfathered.",
    contents: renderEslintConfig({ ...base, typed: true, framework: "none", runtime: "node" }),
  },
  {
    title: "eslint.config.js — Vue",
    language: "js",
    note: "`.vue` is wired into the type program, and the unsafe-any family is off for SFCs because ESLint's type program cannot generate component types.",
    contents: renderEslintConfig({ ...base, typed: true, framework: "vue", runtime: "both" }),
  },
  {
    title: "eslint.config.mjs — Next.js",
    language: "js",
    note: "`.mjs` because a Next package is CommonJS by default. No `eslint-plugin-react`: its peer range cannot coexist with ESLint 10.",
    contents: renderEslintConfig({ ...base, typed: true, framework: "next", runtime: "both" }),
  },
  {
    title: "eslint.config.js — JavaScript, before migrating",
    language: "js",
    note: "The type-aware tier is absent because it cannot run. Migrating unlocks the half that finds real bugs.",
    contents: renderEslintConfig({ ...base, typed: false, framework: "none", runtime: "node" }),
  },
  {
    title: "knip.json",
    language: "json",
    note: "Entry points only where the file exists — knip prints a hint for every pattern matching nothing, and a first run full of complaints about itself does not get read again.",
    contents: renderKnipConfig({ main: "src/index.ts" }, TS_SOURCES),
  },
  {
    title: ".gitattributes",
    language: "text",
    note: "Without it, Windows checks out CRLF and every formatter reports the whole repository as wrong — on one runner only.",
    contents: renderGitattributes(),
  },
];

export const WORKFLOW_SAMPLES: readonly Sample[] = [
  {
    title: ".github/workflows/ci.yml",
    language: "yaml",
    note: "Three platforms. Path handling and file watching break per platform, and only per platform.",
    contents: renderWorkflow({ packageManager: "yarn", scripts: SCRIPTS, nodeVersion: NODE }),
  },
  {
    title: ".github/workflows/ever-better.yml",
    language: "yaml",
    note: "The gate, in its own file so nothing has to edit a pipeline this tool did not write.",
    contents: renderGateWorkflow("yarn", NODE),
  },
  {
    title: ".github/workflows/codex-review.yml",
    language: "yaml",
    note: "Skips itself green without an API key — a check that is red until somebody adds a secret is one everybody learns to ignore.",
    contents: renderCodexReviewWorkflow(NODE),
  },
  {
    title: ".github/workflows/duplication-scan.yml",
    language: "yaml",
    note: "Report-only. A global duplication percentage cannot catch new duplication; SARIF into Code Scanning gives the per-PR view.",
    contents: renderDuplicationWorkflow(NODE),
  },
  {
    title: ".github/workflows/dead-code-scan.yml",
    language: "yaml",
    note: "Report-only. knip has no base-branch diffing, so it cannot say what this PR orphaned.",
    contents: renderDeadCodeWorkflow("yarn", NODE),
  },
  {
    title: ".github/workflows/secret-scan.yml",
    language: "yaml",
    note: "The one gate with no baseline. A committed key is already public, so there is nothing to grandfather and rotation is the only fix.",
    contents: renderSecretScanWorkflow(),
  },
  {
    title: ".github/dependabot.yml",
    language: "yaml",
    note: "The lint stack is grouped: typescript-eslint's peer range pins which ESLint it accepts, so those bumps cannot merge separately.",
    contents: renderDependabot("yarn"),
  },
];
