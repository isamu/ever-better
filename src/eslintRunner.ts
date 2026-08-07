import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "./util/exec.ts";

export type RuleCounts = {
  /** Violations ESLint is reporting right now. After a freeze this must stay at zero. */
  active: Record<string, number>;
  /** Violations held by `eslint-suppressions.json` — the backlog that has to fall. */
  suppressed: Record<string, number>;
  errors: number;
  warnings: number;
  files: number;
};

/** ESLint reserves 2 for "I could not run at all"; 1 merely means it found problems. */
const FATAL_EXIT_CODE = 2;

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const formatterPath = (): string => path.join(packageRoot, "formatters", "rule-counts.js");

const binaryCandidates = (cwd: string): string[] => [
  path.join(cwd, "node_modules", ".bin", "eslint"),
  path.join(cwd, "node_modules", ".bin", "eslint.cmd"),
];

const exists = async (candidate: string): Promise<boolean> => {
  try {
    await access(candidate);
    return true;
  } catch {
    return false;
  }
};

export const findEslint = async (cwd: string): Promise<string | null> => {
  for (const candidate of binaryCandidates(cwd)) {
    if (await exists(candidate)) return candidate;
  }
  return null;
};

const isRuleCounts = (value: unknown): value is RuleCounts =>
  typeof value === "object" && value !== null && "active" in value && "suppressed" in value;

const parseCounts = (stdout: string, stderr: string): RuleCounts => {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    throw new Error(`eslint produced no output. stderr:\n${stderr.slice(0, 2000)}`);
  }
  const parsed: unknown = JSON.parse(trimmed);
  if (!isRuleCounts(parsed)) throw new Error("eslint formatter returned an unexpected shape");
  return parsed;
};

const requireEslint = async (cwd: string): Promise<string> => {
  const binary = await findEslint(cwd);
  if (binary) return binary;
  throw new Error("eslint is not installed in this repository. Run `ever-better bootstrap` first.");
};

/**
 * Runs the target repo's own ESLint — not ours. A repo's rules, plugins and version are part of
 * what is being measured, so borrowing a different ESLint would produce a baseline that no
 * developer in that repo can reproduce.
 */
export const runRuleCounts = async (cwd: string): Promise<RuleCounts> => {
  const binary = await requireEslint(cwd);
  // Without this, ESLint exits fatally the moment a suppressed violation is FIXED, because the
  // suppression it left behind is now unused. That would turn every act of draining into a red
  // build — the exact opposite of the incentive this tool exists to create. `ever-better prune`
  // is how the stale entries are reclaimed, deliberately and on purpose.
  const args = [".", "--format", formatterPath(), "--pass-on-unpruned-suppressions"];
  const result = await exec(binary, args, cwd);
  if (result.code >= FATAL_EXIT_CODE) {
    throw new Error(`eslint failed to run:\n${result.stderr.slice(0, 4000)}`);
  }
  return parseCounts(result.stdout, result.stderr);
};

/**
 * `--suppress-all` is the whole ratchet, and it is ESLint's, not ours: it records today's
 * violations per file and per rule, stays silent about them, and reports anything new as an error.
 */
export const suppressAll = async (cwd: string): Promise<void> => {
  const binary = await requireEslint(cwd);
  const result = await exec(binary, [".", "--suppress-all"], cwd);
  if (result.code >= FATAL_EXIT_CODE) {
    throw new Error(`eslint --suppress-all failed:\n${result.stderr.slice(0, 4000)}`);
  }
};

/** Drops suppressions for violations that no longer exist, which is how the ceiling comes down. */
export const pruneSuppressions = async (cwd: string): Promise<void> => {
  const binary = await requireEslint(cwd);
  const result = await exec(binary, [".", "--prune-suppressions"], cwd);
  if (result.code >= FATAL_EXIT_CODE) {
    throw new Error(`eslint --prune-suppressions failed:\n${result.stderr.slice(0, 4000)}`);
  }
};
