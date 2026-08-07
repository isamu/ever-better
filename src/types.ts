export type PackageManager = "yarn" | "npm" | "pnpm" | "bun";

export type EslintSetup = "flat" | "legacy" | "none";

export type TestRunner = "vitest" | "jest" | "node:test" | "none";

/** `mixed` means TypeScript is configured but a meaningful share of sources are still `.js`. */
export type LanguageMode = "typescript" | "mixed" | "javascript";

export type Phase = "diagnose" | "bootstrap" | "freeze" | "drain" | "tighten" | "split" | "review";

export type RuleStatus = "off" | "draining" | "enforced";

export type PackageJson = {
  name?: string;
  packageManager?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

export type SourceFile = {
  path: string;
  lines: number;
  /** Extension without the dot, lowercased: `ts`, `tsx`, `js`, `mjs`, … */
  ext: string;
};

export type WorkflowFile = {
  path: string;
  content: string;
};

/**
 * Everything read from disk, in one value. Every decision function below takes this and returns a
 * verdict, so the decisions are pure and the disk access lives in exactly one place.
 */
export type RepoFacts = {
  cwd: string;
  /** Repo-relative paths of files in the repository root (not recursive). */
  rootEntries: string[];
  packageJson: PackageJson | null;
  sourceFiles: SourceFile[];
  workflows: WorkflowFile[];
};

export type ToolingPresence = {
  eslint: EslintSetup;
  prettier: boolean;
  testRunner: TestRunner;
  knip: boolean;
  jscpd: boolean;
  agentInstructions: string[];
};

export type ScriptCoverage = {
  lint: boolean;
  format: boolean;
  build: boolean;
  typecheck: boolean;
  test: boolean;
};

export type CiCoverage = {
  present: boolean;
  /** Runner labels seen across all workflows, e.g. `["ubuntu-latest", "macos-latest"]`. */
  runners: string[];
  runsLint: boolean;
  runsTest: boolean;
  runsBuild: boolean;
  runsTypecheck: boolean;
};

export type SizeDistribution = {
  total: number;
  overFileLimit: number;
  largest: SourceFile[];
};

export type Gap = {
  id: string;
  title: string;
  detail: string;
  phase: Phase;
};

export type Diagnosis = {
  packageManager: PackageManager;
  language: LanguageMode;
  typescriptFileRatio: number;
  tooling: ToolingPresence;
  scripts: ScriptCoverage;
  ci: CiCoverage;
  sizes: SizeDistribution;
  gaps: Gap[];
};

export type RuleBaseline = {
  baseline: number;
  current: number;
  status: RuleStatus;
};

export type Counter = {
  baseline: number;
  current: number;
};

export type State = {
  version: 1;
  tool: string;
  phase: Phase;
  updatedAt: string;
  frozenAt: string | null;
  diagnosis: Diagnosis | null;
  rules: Record<string, RuleBaseline>;
  counters: Record<string, Counter>;
};
