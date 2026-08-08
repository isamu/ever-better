import { typecheckCommand } from "./detect/framework.ts";
import { DEFAULT_FILE_LINE_LIMIT } from "./detect/sizes.ts";
import {
  eslintConfigFileName,
  eslintPackagesFor,
  renderEslintConfig,
} from "./generate/eslintConfig.ts";
import { renderDependabot } from "./generate/dependabot.ts";
import { renderGitattributes } from "./generate/gitattributes.ts";
import { renderKnipConfig } from "./generate/knipConfig.ts";
import { renderDeadCodeWorkflow, renderDuplicationWorkflow } from "./generate/scanWorkflows.ts";
import { appendGeneratedPaths, renderPrettierIgnore } from "./generate/prettierIgnore.ts";
import { renderWorkflow } from "./generate/workflow.ts";
import type { Diagnosis, PackageJson, ScriptCoverage, SourceFile } from "./types.ts";

export type BootstrapAction =
  | { kind: "install"; packages: string[] }
  | { kind: "writeFile"; path: string; contents: string }
  | { kind: "addScripts"; scripts: Record<string, string> };

export const PRETTIER_IGNORE_FILE = ".prettierignore";

export type BootstrapPlanOptions = {
  diagnosis: Diagnosis;
  packageJson: PackageJson | null;
  rootEntries: readonly string[];
  /** Needed for paths under a directory; `rootEntries` is the repository root only. */
  allFiles: readonly string[];
  sourceFiles: readonly SourceFile[];
  nodeVersion: string;
  /** Contents of an existing `.prettierignore`, so its generated paths can be appended. */
  prettierIgnore: string | null;
};

const DEFAULT_TEST_GLOB = "test/**";

const installed = (packageJson: PackageJson | null): Set<string> =>
  new Set([
    ...Object.keys(packageJson?.dependencies ?? {}),
    ...Object.keys(packageJson?.devDependencies ?? {}),
  ]);

const missingPackages = (options: BootstrapPlanOptions): string[] => {
  const have = installed(options.packageJson);
  const { framework, language, tooling } = options.diagnosis;
  const wanted = [...eslintPackagesFor(framework), "prettier"];
  if (language !== "javascript") {
    wanted.push("typescript", "@types/node");
    // `tsc` cannot read an SFC at all, so a Vue repo typechecking with it silently skips every
    // component. vue-tsc is what the typecheck script will call.
    if (typecheckCommand(framework).startsWith("vue-tsc")) wanted.push("vue-tsc");
  }
  if (tooling.testRunner === "none") wanted.push("vitest");
  // knip is a dependency; jscpd is run through npx so it never enters the dependency graph — or
  // knip's own inventory, where it would show up as an unused devDependency.
  if (!tooling.knip) wanted.push("knip");
  return wanted.filter((name) => !have.has(name));
};

const scriptsToAdd = (options: BootstrapPlanOptions): Record<string, string> => {
  const { scripts, language, tooling } = options.diagnosis;
  const additions: Record<string, string> = {};
  if (!scripts.lint) additions["lint"] = "eslint .";
  if (!scripts.format) additions["format"] = "prettier --write .";
  if (!scripts.typecheck && language !== "javascript") {
    additions["typecheck"] = typecheckCommand(options.diagnosis.framework);
  }
  if (!scripts.test && tooling.testRunner === "none") additions["test"] = "vitest run";
  if (!tooling.knip) additions["knip"] = "knip";
  return additions;
};

/**
 * Only ever writes a file the repo does not have. Overwriting someone's ESLint config would erase
 * the exceptions they had reasons for, and those reasons are not in the file.
 */
const filesToWrite = (options: BootstrapPlanOptions): BootstrapAction[] => {
  const actions: BootstrapAction[] = [];
  const { diagnosis, rootEntries } = options;

  if (diagnosis.tooling.eslint === "none") {
    actions.push({
      kind: "writeFile",
      path: eslintConfigFileName(options.packageJson),
      contents: renderEslintConfig({
        typed: diagnosis.language !== "javascript",
        fileLineLimit: DEFAULT_FILE_LINE_LIMIT,
        testGlob: DEFAULT_TEST_GLOB,
        // A repo with no runner gets vitest installed below, so the config must describe the
        // runner it will have, not the absence it has now.
        testRunner:
          diagnosis.tooling.testRunner === "none" ? "vitest" : diagnosis.tooling.testRunner,
        framework: diagnosis.framework,
        runtime: diagnosis.runtime,
      }),
    });
  }

  if (!rootEntries.some((entry) => entry.startsWith(".prettierrc"))) {
    actions.push({
      kind: "writeFile",
      path: ".prettierrc.json",
      contents: `${JSON.stringify({ printWidth: 100, trailingComma: "all" }, null, 2)}\n`,
    });
  }

  actions.push(...prettierIgnoreAction(options));

  if (!rootEntries.includes(".gitattributes")) {
    actions.push({ kind: "writeFile", path: ".gitattributes", contents: renderGitattributes() });
  }

  actions.push(...scanActions(options));

  if (!options.allFiles.includes(".github/dependabot.yml")) {
    actions.push({
      kind: "writeFile",
      path: ".github/dependabot.yml",
      contents: renderDependabot(diagnosis.packageManager),
    });
  }

  if (!diagnosis.ci.present) {
    actions.push({
      kind: "writeFile",
      path: ".github/workflows/ci.yml",
      contents: renderWorkflow({
        packageManager: diagnosis.packageManager,
        scripts: scriptCoverageAfterBootstrap(options),
        nodeVersion: options.nodeVersion,
      }),
    });
  }

  return actions;
};

/**
 * The only file bootstrap will edit rather than create. `.prettierignore` is line-based, so
 * appending is well-defined; every other config carries decisions whose reasons are not in it.
 */
const prettierIgnoreAction = (options: BootstrapPlanOptions): BootstrapAction[] => {
  if (options.prettierIgnore === null) {
    return [{ kind: "writeFile", path: PRETTIER_IGNORE_FILE, contents: renderPrettierIgnore() }];
  }
  const appended = appendGeneratedPaths(options.prettierIgnore);
  return appended === null
    ? []
    : [{ kind: "writeFile", path: PRETTIER_IGNORE_FILE, contents: appended }];
};

/**
 * The two report-only scans. They are added even when CI already exists, because they are separate
 * workflow FILES — nothing has to be spliced into a workflow the repo already wrote.
 */
const scanActions = (options: BootstrapPlanOptions): BootstrapAction[] => {
  const { diagnosis, rootEntries } = options;
  const actions: BootstrapAction[] = [];
  if (!diagnosis.tooling.knip && !rootEntries.includes("knip.json")) {
    actions.push({
      kind: "writeFile",
      path: "knip.json",
      contents: renderKnipConfig(options.packageJson, options.sourceFiles),
    });
    actions.push({
      kind: "writeFile",
      path: ".github/workflows/dead-code-scan.yml",
      contents: renderDeadCodeWorkflow(diagnosis.packageManager, options.nodeVersion),
    });
  }
  if (!diagnosis.tooling.jscpd) {
    actions.push({
      kind: "writeFile",
      path: ".github/workflows/duplication-scan.yml",
      contents: renderDuplicationWorkflow(options.nodeVersion),
    });
  }
  return actions;
};

/** What the scripts WILL be once this plan is applied — the workflow must call those, not today's. */
const scriptCoverageAfterBootstrap = (options: BootstrapPlanOptions): ScriptCoverage => {
  const additions = scriptsToAdd(options);
  const current = options.diagnosis.scripts;
  return {
    lint: current.lint || "lint" in additions,
    format: current.format || "format" in additions,
    build: current.build,
    typecheck: current.typecheck || "typecheck" in additions,
    test: current.test || "test" in additions,
  };
};

/** Pure: the same repository state always produces the same list, in the same order. */
export const planBootstrap = (options: BootstrapPlanOptions): BootstrapAction[] => {
  const packages = missingPackages(options);
  const scripts = scriptsToAdd(options);
  return [
    ...(packages.length > 0 ? [{ kind: "install" as const, packages }] : []),
    ...(Object.keys(scripts).length > 0 ? [{ kind: "addScripts" as const, scripts }] : []),
    ...filesToWrite(options),
  ];
};

export const describeAction = (action: BootstrapAction): string => {
  if (action.kind === "install") return `install ${action.packages.join(" ")}`;
  if (action.kind === "addScripts") {
    return `add package.json scripts: ${Object.keys(action.scripts).join(", ")}`;
  }
  return `write ${action.path}`;
};
