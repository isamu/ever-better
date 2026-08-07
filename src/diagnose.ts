import { detectCi, missingRunners } from "./detect/ci.ts";
import { detectFramework, detectRuntime, hasUncoveredFileType } from "./detect/framework.ts";
import { detectLanguageMode, typescriptFileRatio } from "./detect/language.ts";
import { detectPackageManager } from "./detect/packageManager.ts";
import { summarizeSizes, DEFAULT_FILE_LINE_LIMIT } from "./detect/sizes.ts";
import { detectScripts, detectTooling } from "./detect/tooling.ts";
import type { Diagnosis, Gap, RepoFacts, ScriptCoverage } from "./types.ts";

const REQUIRED_SCRIPTS: readonly (keyof ScriptCoverage)[] = [
  "format",
  "lint",
  "build",
  "typecheck",
  "test",
];

const eslintGaps = (diagnosis: Omit<Diagnosis, "gaps">): Gap[] => {
  if (diagnosis.tooling.eslint === "flat") return [];
  const legacy = diagnosis.tooling.eslint === "legacy";
  return [
    {
      id: "eslint",
      title: legacy ? "ESLint is on the legacy .eslintrc format" : "ESLint is not configured",
      detail: legacy
        ? "Every rule tier assumes flat config. Migrate to eslint.config.js before enabling tiers."
        : "Nothing enforces anything yet. This is the first thing bootstrap installs.",
      phase: "bootstrap",
    },
  ];
};

const languageGaps = (diagnosis: Omit<Diagnosis, "gaps">): Gap[] => {
  const percent = Math.round(diagnosis.typescriptFileRatio * 100);
  if (diagnosis.language === "javascript") {
    return [
      {
        id: "typescript",
        title: "No TypeScript",
        detail:
          "Types are the cheapest rule set there is, and the type-aware lint tier cannot run " +
          "without them. Migrating is a phase of its own, driven by the ever-better-migrate skill.",
        phase: "bootstrap",
      },
    ];
  }
  if (diagnosis.language === "mixed") {
    return [
      {
        id: "typescript-partial",
        title: `Only ${percent}% of sources are TypeScript`,
        detail:
          "The type-aware rules cover the typed part only, so the remaining .js files are the " +
          "blind spot the counts will not show.",
        phase: "tighten",
      },
    ];
  }
  return [];
};

const toolingGaps = (diagnosis: Omit<Diagnosis, "gaps">): Gap[] => {
  const gaps: Gap[] = [];
  if (!diagnosis.tooling.prettier) {
    gaps.push({
      id: "prettier",
      title: "No formatter",
      detail:
        "Formatting must land before linting starts, or the first drain PR is a diff nobody can read.",
      phase: "bootstrap",
    });
  }
  if (diagnosis.tooling.testRunner === "none") {
    gaps.push({
      id: "test-runner",
      title: "No test runner",
      detail: "Draining warnings finds bugs. Without a runner there is nowhere to pin them.",
      phase: "bootstrap",
    });
  }
  if (!diagnosis.tooling.knip) {
    gaps.push({
      id: "knip",
      title: "No dead-code detection",
      detail: "knip reports unused exports and files. Report-only at first; a counter later.",
      phase: "tighten",
    });
  }
  if (!diagnosis.tooling.jscpd) {
    gaps.push({
      id: "jscpd",
      title: "No duplication detection",
      detail: "jscpd is what turns 'this feels repetitive' into a number that can only go down.",
      phase: "split",
    });
  }
  if (diagnosis.tooling.agentInstructions.length === 0) {
    gaps.push({
      id: "agent-instructions",
      title: "No CLAUDE.md / AGENTS.md",
      detail:
        "Draining is done by agents. Rules that live only in your head produce a different fix " +
        "every session.",
      phase: "drain",
    });
  }
  return gaps;
};

const scriptGaps = (diagnosis: Omit<Diagnosis, "gaps">): Gap[] => {
  const missing = REQUIRED_SCRIPTS.filter((name) => !diagnosis.scripts[name]);
  if (missing.length === 0) return [];
  return [
    {
      id: "scripts",
      title: `Missing package scripts: ${missing.join(", ")}`,
      detail: "CI runs scripts, not commands. A gate with no script behind it cannot be enforced.",
      phase: "bootstrap",
    },
  ];
};

const ciGaps = (diagnosis: Omit<Diagnosis, "gaps">): Gap[] => {
  if (!diagnosis.ci.present) {
    return [
      {
        id: "ci",
        title: "No CI workflows",
        detail:
          "The baseline is only a ratchet if something rejects a regression. Without CI it is a note.",
        phase: "review",
      },
    ];
  }
  const gaps: Gap[] = [];
  const runners = missingRunners(diagnosis.ci);
  if (runners.length > 0) {
    gaps.push({
      id: "ci-runners",
      title: `CI does not run on ${runners.join(", ")}`,
      detail: "Path handling and file watching break per platform, and only per platform.",
      phase: "review",
    });
  }
  if (!diagnosis.ci.runsLint) {
    gaps.push({
      id: "ci-lint",
      title: "CI does not run lint",
      detail: "Nothing enforces the baseline on a pull request.",
      phase: "review",
    });
  }
  return gaps;
};

const sizeGaps = (diagnosis: Omit<Diagnosis, "gaps">): Gap[] => {
  if (diagnosis.sizes.overFileLimit === 0) return [];
  return [
    {
      id: "file-size",
      title: `${diagnosis.sizes.overFileLimit} files over ${DEFAULT_FILE_LINE_LIMIT} lines`,
      detail:
        "These are the split-and-DRY backlog. Knowing the count now makes the limit a choice.",
      phase: "split",
    },
  ];
};

const frameworkGaps = (diagnosis: Omit<Diagnosis, "gaps">, facts: RepoFacts): Gap[] => {
  if (!hasUncoveredFileType(diagnosis.framework, facts.sourceFiles)) return [];
  return [
    {
      id: "framework-files",
      title: `.${diagnosis.framework} files are not linted`,
      detail:
        "The generated config covers .ts and .js only for this framework, so those files pass " +
        "by being skipped. Add the framework's ESLint plugin before freezing, or the baseline " +
        "records a number that ignores half the repo.",
      phase: "bootstrap",
    },
  ];
};

const GAP_DETECTORS = [eslintGaps, languageGaps, toolingGaps, scriptGaps, ciGaps, sizeGaps];

/**
 * Pure: every fact was already read from disk by `gatherFacts`. A repository missing absolutely
 * everything is the normal input here, not an error case.
 */
export const diagnose = (facts: RepoFacts): Diagnosis => {
  const hasTsconfig = facts.rootEntries.includes("tsconfig.json");
  const workflowText = facts.workflows.map((workflow) => workflow.content).join("\n");
  const framework = detectFramework(facts.packageJson);
  const partial: Omit<Diagnosis, "gaps"> = {
    packageManager: detectPackageManager(facts.rootEntries, facts.packageJson),
    language: detectLanguageMode(hasTsconfig, facts.sourceFiles),
    framework,
    runtime: detectRuntime(framework, facts.packageJson),
    typescriptFileRatio: typescriptFileRatio(facts.sourceFiles),
    tooling: detectTooling(facts.rootEntries, facts.packageJson, workflowText),
    scripts: detectScripts(facts.packageJson),
    ci: detectCi(facts.workflows),
    sizes: summarizeSizes(facts.sourceFiles),
  };
  const gaps = [
    ...GAP_DETECTORS.flatMap((detect) => detect(partial)),
    ...frameworkGaps(partial, facts),
  ];
  return { ...partial, gaps };
};
