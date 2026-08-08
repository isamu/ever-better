import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "./util/exec.ts";

export type RuleCounts = {
  /** Unsuppressed errors. After a freeze these are new by definition, so any is a failure. */
  errors: Record<string, number>;
  /**
   * ESLint's suppressions cover errors only, so warnings stay visible forever and would otherwise
   * be free to accumulate. ever-better ratchets their total instead.
   */
  warnings: Record<string, number>;
  /** Violations held by `eslint-suppressions.json` — the backlog that has to fall. */
  suppressed: Record<string, number>;
  files: number;
};

export const totalOf = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

/** ESLint reserves 2 for "I could not run at all"; 1 merely means it found problems. */
const FATAL_EXIT_CODE = 2;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const formatterPath = (): string => path.join(packageRoot, "formatters", "rule-counts.js");

type EslintInvocation = {
  command: string;
  /** Arguments that come before ours — the entry script when going through Node. */
  prefixArgs: string[];
  shell: boolean;
};

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

/**
 * Runs ESLint's entry script through the Node we are already running, rather than the
 * `node_modules/.bin` shim. On Windows that directory holds BOTH an extensionless shell script and
 * an `eslint.cmd`; spawning the former fails with ENOENT, and spawning the latter needs a shell,
 * which then has to quote paths that may contain spaces. Going straight to the `.js` sidesteps
 * both and behaves identically on every platform.
 */
const findEslint = async (cwd: string): Promise<EslintInvocation | null> => {
  const entry = path.join(cwd, "node_modules", "eslint", "bin", "eslint.js");
  if (await exists(entry)) {
    return { command: process.execPath, prefixArgs: [entry], shell: false };
  }
  const shimName = process.platform === "win32" ? "eslint.cmd" : "eslint";
  const shim = path.join(cwd, "node_modules", ".bin", shimName);
  if (await exists(shim)) {
    return { command: shim, prefixArgs: [], shell: process.platform === "win32" };
  }
  return null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isRuleCounts = (value: unknown): value is RuleCounts =>
  typeof value === "object" && value !== null && "errors" in value && "suppressed" in value;

const parseCounts = (stdout: string, stderr: string): RuleCounts => {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    throw new Error(`eslint produced no output. stderr:\n${stderr.slice(0, 2000)}`);
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (!isRuleCounts(parsed)) throw new Error("eslint formatter returned an unexpected shape");
  return parsed;
};

/**
 * Runs the target repo's own ESLint — not ours. A repo's rules, plugins and version are part of
 * what is being measured, so borrowing a different ESLint would produce a baseline that no
 * developer in that repo can reproduce.
 */
const runEslint = async (cwd: string, args: readonly string[], label: string) => {
  const eslint = await findEslint(cwd);
  if (!eslint) {
    throw new Error(
      "eslint is not installed in this repository. Run `ever-better bootstrap` first.",
    );
  }
  const result = await exec(eslint.command, [...eslint.prefixArgs, ...args], cwd, {
    shell: eslint.shell,
  });
  if (result.code >= FATAL_EXIT_CODE) {
    throw new Error(`${label} failed:\n${result.stderr.slice(0, 4000)}`);
  }
  return result;
};

export const runRuleCounts = async (cwd: string): Promise<RuleCounts> => {
  // Without `--pass-on-unpruned-suppressions`, ESLint exits fatally the moment a suppressed
  // violation is FIXED, because the suppression it left behind is now unused. That would turn
  // every act of draining into a red build — the exact opposite of the incentive this tool exists
  // to create. `ever-better prune` is how stale entries are reclaimed, deliberately.
  const args = [".", "--format", formatterPath(), "--pass-on-unpruned-suppressions"];
  const result = await runEslint(cwd, args, "eslint");
  return parseCounts(result.stdout, result.stderr);
};

/**
 * `--suppress-all` is the whole ratchet, and it is ESLint's, not ours: it records today's
 * violations per file and per rule, stays silent about them, and reports anything new as an error.
 */
export const suppressAll = async (cwd: string): Promise<void> => {
  await runEslint(cwd, [".", "--suppress-all"], "eslint --suppress-all");
};

/**
 * What ESLint will ACTUALLY apply to one file. Reading the config source cannot answer this:
 * presets, a framework's own config and later blocks all override each other silently, and a rule
 * that ends up off reports nothing to notice.
 *
 * Returns null rather than throwing — a repo without ESLint is the normal case here.
 */
export const printConfig = async (
  cwd: string,
  filePath: string,
): Promise<Record<string, unknown> | null> => {
  const eslint = await findEslint(cwd);
  if (!eslint) return null;
  try {
    const result = await exec(
      eslint.command,
      [...eslint.prefixArgs, "--print-config", filePath],
      cwd,
      { shell: eslint.shell },
    );
    if (result.code !== 0) return null;
    const parsed: unknown = JSON.parse(result.stdout);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Does ESLint still work? `--print-config` answers a different question — it resolves the config
 * without ever loading a rule, so a rule that needs a type program prints happily and then makes
 * every real run fatal. Only linting something proves the config is usable.
 */
export const canLint = async (cwd: string, filePath: string): Promise<boolean> => {
  const eslint = await findEslint(cwd);
  if (!eslint) return false;
  try {
    const result = await exec(eslint.command, [...eslint.prefixArgs, filePath], cwd, {
      shell: eslint.shell,
    });
    // 0 = clean, 1 = violations found. Both mean the config loaded and the rules ran.
    return result.code < FATAL_EXIT_CODE;
  } catch {
    return false;
  }
};

/** Drops suppressions for violations that no longer exist, which is how the ceiling comes down. */
export const pruneSuppressions = async (cwd: string): Promise<void> => {
  await runEslint(cwd, [".", "--prune-suppressions"], "eslint --prune-suppressions");
};
