export type PackageManager = "yarn" | "npm" | "pnpm" | "bun";

export type Framework = "next" | "nuxt" | "vue" | "react" | "svelte" | "astro" | "none";

/** Which globals the source files may use. Frontend code with a server half is `both`. */
export type Runtime = "browser" | "node" | "both";

export type EslintSetup = "flat" | "legacy" | "none";

export type TestRunner = "vitest" | "jest" | "node:test" | "none";

/** `mixed` means TypeScript is configured but a meaningful share of sources are still `.js`. */
export type LanguageMode = "typescript" | "mixed" | "javascript";

export type Phase = "diagnose" | "bootstrap" | "freeze" | "drain" | "tighten" | "split" | "review";

export type RuleStatus = "off" | "draining" | "enforced";

export type PackageJson = {
  name?: string;
  type?: string;
  main?: string;
  bin?: Record<string, string>;
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
  /** What ESLint and tsc report as EFFECTIVE, which is not what the config files say. */
  probes: import("./probe/gather.ts").Probes;
  /** Repo-relative paths of files in the repository root (not recursive). */
  rootEntries: string[];
  /** Every tracked, non-ignored file. `rootEntries` cannot answer questions about subdirectories. */
  allFiles: string[];
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
  framework: Framework;
  runtime: Runtime;
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

/**
 * `deferred` is the one that earns its keep: a refactor the agent decided not to make, recorded
 * with the commit it was seen at, so a later session can tell whether the observation still
 * describes the code.
 */
export type LogKind = "drained" | "deferred" | "issue" | "note";

export type LogEntry = {
  at: string;
  /** HEAD when this was written. Without it a note cannot be aged. */
  commit: string | null;
  kind: LogKind;
  rule?: string;
  text: string;
};

export type State = {
  version: 1;
  tool: string;
  phase: Phase;
  updatedAt: string;
  frozenAt: string | null;
  /** When and at which commit the diagnosis below was taken. */
  diagnosedAt: string | null;
  diagnosedCommit: string | null;
  diagnosis: Diagnosis | null;
  rules: Record<string, RuleBaseline>;
  counters: Record<string, Counter>;
  log: LogEntry[];
};
