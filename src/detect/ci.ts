import type { CiCoverage, WorkflowFile } from "../types.ts";

// `latest` or a version (`22.04`, `13`, `2022`). Loosening the suffix to any word matched workflow
// FILENAMES like `windows-daily.yaml` and reported a runner the repo never used.
const RUNNER_PATTERN = /(?:ubuntu|macos|windows)-(?:latest|\d[\w.]*)/g;

const PACKAGE_MANAGER = /^(?:yarn|npm|pnpm|bun)$/;

/** `run: yarn install && yarn lint` is two commands, and only the second one runs lint. */
const COMMAND_SEPARATOR = /&&|\|\||;/;

const RUN_KEY = /^[ \t]*(?:-[ \t]+)?run:(.*)$/;

const escaped = (script: string): string => script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * `lint:fix` is still the lint tier, `test-setup` is a different script. A colon namespaces, a
 * hyphen renames, and `\b` cannot tell them apart because both characters end a word.
 */
const isScript = (token: string | undefined, script: string): boolean => token !== undefined && new RegExp(`^${escaped(script)}(?::|$)`).test(token);

/**
 * Every manager accepts both `<mgr> <script>` and `<mgr> run <script>`, and the Vite scaffold
 * writes the second — reading that as "no lint in CI" fires the review gaps at a repo already
 * running the whole tier.
 */
const invokes = (command: string, script: string): boolean => {
  const [head, ...rest] = command
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);
  if (head === undefined || !PACKAGE_MANAGER.test(head)) return false;
  const args = rest[0] === "run" || rest[0] === "run-script" ? rest.slice(1) : rest;
  return isScript(args[0], script);
};

/**
 * Line by line, and only what a line actually RUNS — matching the raw text reported CI coverage for
 * `run: echo "yarn run lint"` and for a commented-out step, which is the expensive direction: a
 * false gap is noise, a false "already covered" means the gap is never reported at all.
 *
 * A line with no `run:` key is taken whole, which is what makes a command inside a `run: |` block
 * count. Still not YAML parsing — the same trade the secret-scanner detector documents.
 */
const mentions = (content: string, script: string): boolean =>
  content
    .split("\n")
    .map((line) => line.split("#")[0] ?? "")
    .some((line) => (RUN_KEY.exec(line)?.[1] ?? line).split(COMMAND_SEPARATOR).some((command) => invokes(command, script)));

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
