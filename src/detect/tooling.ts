import type { EslintSetup, PackageJson, ScriptCoverage, TestRunner, ToolingPresence } from "../types.ts";

const FLAT_CONFIG_NAMES = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"];
const LEGACY_CONFIG_PREFIX = ".eslintrc";

const SECRET_SCANNERS = ["gitleaks", "trufflehog", "detect-secrets", "ggshield"];

/**
 * A scanner has to be RUN, not merely mentioned. Substring-matching the whole workflow text counted
 * a comment explaining why there is no scanner, and a `.gitleaks.toml` sitting beside nothing that
 * reads it — both of which suppress the gap and leave a repository unscanned while this reports it
 * covered. For a security check that is the dangerous direction: a false gap is noise, a false
 * "already covered" is silence.
 *
 * Line-based rather than YAML-aware on purpose — nothing in this tool parses YAML — so a step
 * disabled with `if: false` still reads as coverage. Said out loud rather than left to be found.
 */
const runsSecretScanner = (workflowText: string): boolean =>
  workflowText
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .some((line) => (line.includes("uses:") || line.includes("run:")) && SECRET_SCANNERS.some((scanner) => line.includes(scanner)));

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
  if (FLAT_CONFIG_NAMES.some((name) => rootEntries.includes(name))) return "flat";
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

export const detectTestRunner = (packageJson: PackageJson | null): TestRunner => {
  if (hasDependency(packageJson, "vitest")) return "vitest";
  if (hasDependency(packageJson, "jest")) return "jest";
  const named = DEPENDENCY_ONLY_RUNNERS.find((runner) => hasDependency(packageJson, runner));
  if (named) return named;
  const testScript = packageJson?.scripts?.["test"] ?? "";
  if (testScript.includes("node --test") || testScript.includes("node:test")) return "node:test";
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
