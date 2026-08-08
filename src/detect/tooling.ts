import type {
  EslintSetup,
  PackageJson,
  ScriptCoverage,
  TestRunner,
  ToolingPresence,
} from "../types.ts";

const FLAT_CONFIG_NAMES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
];
const LEGACY_CONFIG_PREFIX = ".eslintrc";

const AGENT_INSTRUCTION_NAMES = ["CLAUDE.md", "AGENTS.md", "GEMINI.md", ".cursorrules"];

export const allDependencies = (packageJson: PackageJson | null): Record<string, string> => ({
  ...packageJson?.dependencies,
  ...packageJson?.devDependencies,
});

const hasDependency = (packageJson: PackageJson | null, name: string): boolean =>
  name in allDependencies(packageJson);

/**
 * Flat config is what every rule tier here assumes. A repo on `.eslintrc` is not "has eslint" —
 * it has to migrate first, and reporting it as present would skip that step silently.
 */
export const detectEslintSetup = (rootEntries: readonly string[]): EslintSetup => {
  if (FLAT_CONFIG_NAMES.some((name) => rootEntries.includes(name))) return "flat";
  if (rootEntries.some((entry) => entry.startsWith(LEGACY_CONFIG_PREFIX))) return "legacy";
  return "none";
};

export const detectTestRunner = (packageJson: PackageJson | null): TestRunner => {
  if (hasDependency(packageJson, "vitest")) return "vitest";
  if (hasDependency(packageJson, "jest")) return "jest";
  const testScript = packageJson?.scripts?.["test"] ?? "";
  if (testScript.includes("node --test") || testScript.includes("node:test")) return "node:test";
  return "none";
};

/**
 * A tool can be wired up without being a dependency — mulmoterminal downloads a pinned jscpd
 * binary inside its workflow. Reporting that repo as having no duplication scan was wrong, and a
 * false "you are missing this" is how a diagnosis stops being trusted.
 */
export const detectTooling = (
  rootEntries: readonly string[],
  packageJson: PackageJson | null,
  workflowText = "",
): ToolingPresence => {
  const wiredUp = (name: string, configFile: string): boolean =>
    hasDependency(packageJson, name) ||
    rootEntries.includes(configFile) ||
    workflowText.includes(name);
  return {
    eslint: detectEslintSetup(rootEntries),
    prettier:
      hasDependency(packageJson, "prettier") ||
      rootEntries.some((entry) => entry.startsWith(".prettierrc")),
    testRunner: detectTestRunner(packageJson),
    knip: wiredUp("knip", "knip.json"),
    jscpd: wiredUp("jscpd", ".jscpd.json"),
    agentInstructions: AGENT_INSTRUCTION_NAMES.filter((name) => rootEntries.includes(name)),
  };
};

export const detectScripts = (packageJson: PackageJson | null): ScriptCoverage => {
  const scripts = packageJson?.scripts ?? {};
  const has = (name: string): boolean => typeof scripts[name] === "string";
  return {
    lint: has("lint"),
    format: has("format"),
    build: has("build"),
    typecheck: has("typecheck"),
    test: has("test"),
  };
};
