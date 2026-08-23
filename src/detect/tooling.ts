import type { EslintSetup, PackageJson, ScriptCoverage, TestRunner, ToolingPresence } from "../types.ts";
import { ESLINT_CONFIG_NAMES } from "../eslintConfigNames.ts";

const LEGACY_CONFIG_PREFIX = ".eslintrc";

/** The command a scanner is invoked as, matched against what a line actually runs. */
const SECRET_SCANNER_COMMANDS = new Set(["gitleaks", "trufflehog", "detect-secrets", "ggshield"]);

/** The actions that run one, `owner/repo` lowercased, matched against a `uses:` value. */
const SECRET_SCANNER_ACTIONS = new Set(["gitleaks/gitleaks-action", "trufflesecurity/trufflehog", "gitguardian/ggshield-action", "yelp/detect-secrets"]);

/** Tokens that can stand in front of the real command without changing what it is. */
const RUNNERS = new Set(["-", "npx", "sudo", "env", "yarn", "pnpm", "bunx", "bun", "run"]);

/** `FOO=bar gitleaks git .` — an assignment prefix is not the command either. */
const isAssignment = (token: string): boolean => /^[A-Za-z_]\w*=/.test(token);

const commandOf = (tokens: readonly string[]): string | null => {
  const [head, ...rest] = tokens;
  if (head === undefined) return null;
  return RUNNERS.has(head) || isAssignment(head) ? commandOf(rest) : head;
};

const basename = (command: string): string => command.split("/").at(-1) ?? command;

/**
 * `uses:` has to be the line's own key rather than text that merely contains it. `run: echo "uses:
 * gitleaks/gitleaks-action@v2"` runs nothing and read as covered — the one direction this must
 * never get wrong.
 */
const USES_KEY = /^[ \t]*(?:-[ \t]+)?uses:[ \t]*(\S+)/;

const usesAction = (line: string): boolean => {
  const value = USES_KEY.exec(line)?.[1];
  return value !== undefined && SECRET_SCANNER_ACTIONS.has((value.split("@")[0] ?? "").toLowerCase());
};

/**
 * `run:` as the line's own key, exactly like `uses:` — matching it anywhere let `name: run:
 * gitleaks git .` read as coverage. A line with no `run:` key is taken whole, which is what makes a
 * command inside a `run: |` block count.
 */
const RUN_KEY = /^[ \t]*(?:-[ \t]+)?run:(.*)$/;

const runsCommand = (line: string): boolean => {
  const body = RUN_KEY.exec(line)?.[1] ?? line;
  const command = commandOf(
    body
      .trim()
      .split(/\s+/)
      .filter((token) => token.length > 0),
  );
  return command !== null && SECRET_SCANNER_COMMANDS.has(basename(command));
};

const STEP_START = /^[ \t]*-[ \t]/;

/** A step switched off still scans nothing, however completely it is written. */
const DISABLED = /^[ \t]*(?:-[ \t]+)?if:[ \t]*(?:false|\$\{\{[ \t]*false[ \t]*\}\})[ \t]*$/;

const intoSteps = (lines: readonly string[]): string[][] =>
  lines.reduce<string[][]>((steps, line) => {
    const current = steps.at(-1);
    if (current === undefined || STEP_START.test(line)) return [...steps, [line]];
    current.push(line);
    return steps;
  }, []);

/**
 * Enumerates what counts as running a scanner rather than what does not, because the ban-list
 * version lost three rounds in a row: it counted a comment, then a commented-out step, then
 * `echo gitleaks`, then `uses: example/gitleaks-docs`. A language always has one more way to say a
 * thing than anyone will list, so this asks the opposite question — is the command this line runs a
 * scanner, or is this `uses:` one of the actions that runs one.
 *
 * It fails CLOSED: anything unrecognised reads as "not scanned", which costs a workflow somebody
 * did not need. The other direction leaves a repository unscanned while this reports it covered,
 * and for a security check that is silence rather than noise.
 *
 * Grouped into steps by their leading `-` so a step switched off with `if: false` counts for
 * nothing — that is still not YAML parsing, and a form it cannot see (a matrix that evaluates
 * false, an `if` on the job) reads as coverage. The known gaps are pinned in the tests.
 */
const runsSecretScanner = (workflowText: string): boolean =>
  intoSteps(workflowText.split("\n").map((line) => line.split("#")[0] ?? ""))
    .filter((step) => !step.some((line) => DISABLED.test(line)))
    .some((step) => step.some((line) => usesAction(line) || runsCommand(line)));

const AGENT_INSTRUCTION_NAMES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".cursorrules"];

export const allDependencies = (packageJson: PackageJson | null): Record<string, string> => ({
  ...packageJson?.dependencies,
  ...packageJson?.devDependencies,
});

const hasDependency = (packageJson: PackageJson | null, name: string): boolean => name in allDependencies(packageJson);

/**
 * Flat config is what every rule tier here assumes. A repo on `.eslintrc` is not "has eslint" —
 * it has to migrate first, and reporting it as present would skip that step silently.
 */
export const detectEslintSetup = (rootEntries: readonly string[]): EslintSetup => {
  if (ESLINT_CONFIG_NAMES.some((name) => rootEntries.includes(name))) return "flat";
  if (rootEntries.some((entry) => entry.startsWith(LEGACY_CONFIG_PREFIX))) return "legacy";
  return "none";
};

/**
 * Runners that are a dependency and nothing else — no config to generate, but their presence is the
 * whole point: `bootstrap` installs vitest when it sees "none", so a repo that already tests with
 * mocha gets a second runner added to it. Measured on debug-js/debug, which carries mocha in
 * devDependencies and was reported as having no runner at all.
 *
 * A test script alone is still not evidence. `"test": "echo nope"` names no runner, and guessing
 * from it would put this back to claiming tools that are not there.
 */
const DEPENDENCY_ONLY_RUNNERS = ["mocha", "ava", "tap", "jasmine"] as const;

/**
 * node:test is the runner whatever launches node — `tsx --test`, `node --experimental-strip-types
 * --test`, `ts-node --test` all run it, and matching the string `node --test` saw none of them.
 * Reporting "none" is not a cosmetic mislabel: bootstrap installs vitest on "none", so a repo that
 * already tests gets a second runner.
 *
 * The lookahead is what keeps `--test-reporter=spec` and `--test-dir=e2e` out — and `node --test`
 * as a substring matched the first of those, so this reads a flag rather than a command line.
 */
const RUNS_NODE_TEST = /(?:^|\s)--test(?=\s|$)/;

export const detectTestRunner = (packageJson: PackageJson | null): TestRunner => {
  if (hasDependency(packageJson, "vitest")) return "vitest";
  if (hasDependency(packageJson, "jest")) return "jest";
  const named = DEPENDENCY_ONLY_RUNNERS.find((runner) => hasDependency(packageJson, runner));
  if (named) return named;
  const testScript = packageJson?.scripts?.["test"] ?? "";
  if (RUNS_NODE_TEST.test(testScript)) return "node:test";
  return "none";
};

/**
 * A tool can be wired up without being a dependency — mulmoterminal downloads a pinned jscpd
 * binary inside its workflow. Reporting that repo as having no duplication scan was wrong, and a
 * false "you are missing this" is how a diagnosis stops being trusted.
 */
export const detectTooling = (rootEntries: readonly string[], packageJson: PackageJson | null, workflowText = ""): ToolingPresence => {
  const wiredUp = (name: string, configFile: string): boolean =>
    hasDependency(packageJson, name) || rootEntries.includes(configFile) || workflowText.includes(name);
  return {
    eslint: detectEslintSetup(rootEntries),
    prettier: hasDependency(packageJson, "prettier") || rootEntries.some((entry) => entry.startsWith(".prettierrc")),
    testRunner: detectTestRunner(packageJson),
    knip: wiredUp("knip", "knip.json"),
    jscpd: wiredUp("jscpd", ".jscpd.json"),
    // Named scanners rather than the word "secret", which appears in every workflow that reads
    // `secrets.GITHUB_TOKEN`. GitHub's own push protection is a repository setting and cannot be
    // seen from the contents at all — the gap text says so rather than leaving it to confuse.
    secretScanning: runsSecretScanner(workflowText),
    agentInstructions: AGENT_INSTRUCTION_NAMES.filter((name) => rootEntries.includes(name)),
  };
};

/**
 * Presence, not truthiness. `"knip": ""` is a script someone wrote — an empty one is how a script
 * gets disabled without deleting it — and replacing it because it is falsy is the same overwrite as
 * replacing a non-empty one.
 */
export const hasScript = (packageJson: PackageJson | null, name: string): boolean => typeof packageJson?.scripts?.[name] === "string";

export const detectScripts = (packageJson: PackageJson | null): ScriptCoverage => {
  const has = (name: string): boolean => hasScript(packageJson, name);
  return {
    lint: has("lint"),
    format: has("format"),
    build: has("build"),
    typecheck: has("typecheck"),
    test: has("test"),
  };
};
