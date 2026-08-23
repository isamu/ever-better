import type { CiCoverage, WorkflowFile } from "../types.ts";

// `latest` or a version (`22.04`, `13`, `2022`). Loosening the suffix to any word matched workflow
// FILENAMES like `windows-daily.yaml` and reported a runner the repo never used.
const RUNNER_PATTERN = /(?:ubuntu|macos|windows)-(?:latest|\d[\w.]*)/g;

/**
 * Every manager accepts both `<mgr> <script>` and `<mgr> run <script>`, and the Vite scaffold
 * writes the second — reading that as "no lint in CI" fires the review gaps at a repo already
 * running the whole tier.
 *
 * The boundary is `(?![\w-])` rather than `\b`: a colon namespaces one tier (`lint:fix` is still
 * lint), while a hyphen names a different script (`test-setup` is not the test run), and `\b`
 * cannot tell those apart because both characters end a word.
 */
const mentions = (content: string, script: string): boolean => new RegExp(`(?:yarn|npm|pnpm|bun)\\s+(?:run\\s+)?${script}(?![\\w-])`).test(content);

/**
 * Read as text rather than parsed YAML on purpose: `runs-on` may be a matrix expression, a string,
 * or a list, and all we need is "which runners does this repo actually exercise". Adding a YAML
 * parser to answer that would buy precision nobody uses and a dependency everybody pays for.
 */
export const detectCi = (workflows: readonly WorkflowFile[]): CiCoverage => {
  const combined = workflows.map((workflow) => workflow.content).join("\n");
  const runners = [...new Set(combined.match(RUNNER_PATTERN) ?? [])].sort((a, b) => a.localeCompare(b));
  return {
    present: workflows.length > 0,
    runners,
    runsLint: mentions(combined, "lint"),
    runsTest: mentions(combined, "test"),
    runsBuild: mentions(combined, "build"),
    runsTypecheck: mentions(combined, "typecheck"),
    // The baseline is only a ratchet if something rejects a regression. A repo can have thorough
    // CI and still enforce nothing, which looks identical from the outside.
    runsEverBetterCheck: /ever-better\s+check/.test(combined),
  };
};

export const missingRunners = (coverage: CiCoverage): string[] => {
  const families = new Set(coverage.runners.map((runner) => runner.split("-")[0]));
  return ["ubuntu", "macos", "windows"].filter((family) => !families.has(family));
};
