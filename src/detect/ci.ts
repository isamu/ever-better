import type { CiCoverage, WorkflowFile } from "../types.ts";

// `latest` or a version (`22.04`, `13`, `2022`). Loosening the suffix to any word matched workflow
// FILENAMES like `windows-daily.yaml` and reported a runner the repo never used.
const RUNNER_PATTERN = /(?:ubuntu|macos|windows)-(?:latest|\d[\w.]*)/g;

const mentions = (content: string, script: string): boolean =>
  new RegExp(`(yarn|npm run|pnpm|bun run)\\s+${script}\\b`).test(content);

/**
 * Read as text rather than parsed YAML on purpose: `runs-on` may be a matrix expression, a string,
 * or a list, and all we need is "which runners does this repo actually exercise". Adding a YAML
 * parser to answer that would buy precision nobody uses and a dependency everybody pays for.
 */
export const detectCi = (workflows: readonly WorkflowFile[]): CiCoverage => {
  const combined = workflows.map((workflow) => workflow.content).join("\n");
  const runners = [...new Set(combined.match(RUNNER_PATTERN) ?? [])].sort((a, b) =>
    a.localeCompare(b),
  );
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
