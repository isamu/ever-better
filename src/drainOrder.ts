import path from "node:path";
import type { Suppression } from "./suppressionsFile.ts";

/** A file within this many violations of clean for one rule is one edit, not a project. */
const CHEAP_VIOLATION_LIMIT = 2;

/** A rule surviving in this few files of a directory is that directory's last holdout. */
const DIRECTORY_TAIL_LIMIT = 2;

const HEAVY_FILES_SHOWN = 5;

export type Totals = {
  violations: number;
  files: number;
  rules: number;
};

export type RuleSpread = {
  rule: string;
  violations: number;
  files: number;
};

export type DirectoryTail = {
  directory: string;
  rule: string;
  files: string[];
  violations: number;
};

export type HeavyFile = {
  file: string;
  rules: number;
  violations: number;
};

export type DrainPlan = {
  totals: Totals;
  takeFirst: Suppression[];
  rules: RuleSpread[];
  directoryTails: DirectoryTail[];
  heaviest: HeavyFile[];
  /** Files in the backlog to how many files import them. Empty unless `--fan-in` asked for it. */
  importers: Record<string, number>;
};

const groupBy = <T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  items.forEach((item) => {
    const bucket = groups.get(key(item));
    if (bucket) bucket.push(item);
    else groups.set(key(item), [item]);
  });
  return groups;
};

const sumCounts = (entries: readonly Suppression[]): number => entries.reduce((sum, entry) => sum + entry.count, 0);

const distinct = (values: readonly string[]): number => new Set(values).size;

export const totalsOf = (entries: readonly Suppression[]): Totals => ({
  violations: sumCounts(entries),
  files: distinct(entries.map((entry) => entry.file)),
  rules: distinct(entries.map((entry) => entry.rule)),
});

/**
 * The ratchet is per file and per rule: a file with no entry for a rule fails on the next violation
 * of it. So the cheapest entries are not merely small — each one converts a file from grandfathered
 * to enforced, permanently, for the cost of one or two edits.
 */
export const cheapestFirst = (entries: readonly Suppression[], limit: number = CHEAP_VIOLATION_LIMIT): Suppression[] =>
  entries.filter((entry) => entry.count <= limit).sort((a, b) => a.count - b.count || a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule));

/**
 * Ranked by files to touch rather than by violations. Forty violations in three files and forty
 * across thirty are the same number in `status` and ten times apart in work.
 */
export const ruleSpread = (entries: readonly Suppression[]): RuleSpread[] =>
  [...groupBy(entries, (entry) => entry.rule)]
    .map(([rule, group]) => ({ rule, violations: sumCounts(group), files: group.length }))
    .sort((a, b) => a.files - b.files || a.violations - b.violations || a.rule.localeCompare(b.rule));

const directoryOf = (file: string): string => {
  const directory = path.posix.dirname(file);
  return directory === "." ? "(root)" : directory;
};

/**
 * Directories where a rule survives in a handful of files. This says what it measures — the last
 * files *carrying* the rule — and not that the rest of the directory is clean: a file ESLint never
 * looks at has no entry either, and no arithmetic over this file can tell the two apart.
 */
export const directoryTails = (entries: readonly Suppression[], limit: number = DIRECTORY_TAIL_LIMIT): DirectoryTail[] =>
  [...groupBy(entries, (entry) => JSON.stringify([directoryOf(entry.file), entry.rule]))]
    .map(([, group]) => ({
      directory: directoryOf(group[0]?.file ?? ""),
      rule: group[0]?.rule ?? "",
      files: group.map((entry) => entry.file).sort((a, b) => a.localeCompare(b)),
      violations: sumCounts(group),
    }))
    .filter((tail) => tail.files.length <= limit)
    .sort((a, b) => a.files.length - b.files.length || a.violations - b.violations || a.directory.localeCompare(b.directory));

/**
 * Heavy means **one rule** it cannot clear in a couple of edits, not a large total: a file holding
 * two rules at one violation each sums past any cheap threshold while every entry in it is a quick
 * win, and calling that a redesign contradicts the list above, which is offering both.
 *
 * A file with one cheap rule and one enormous one belongs in both, and that is the useful answer —
 * take the quick win, leave the rest.
 */
export const heaviestFiles = (entries: readonly Suppression[], limit: number = HEAVY_FILES_SHOWN): HeavyFile[] =>
  [...groupBy(entries, (entry) => entry.file)]
    .filter(([, group]) => group.some((entry) => entry.count > CHEAP_VIOLATION_LIMIT))
    .map(([file, group]) => ({ file, rules: group.length, violations: sumCounts(group) }))
    .sort((a, b) => b.violations - a.violations || b.rules - a.rules || a.file.localeCompare(b.file))
    .slice(0, limit);

export const buildDrainPlan = (entries: readonly Suppression[], importers: Record<string, number> = {}): DrainPlan => ({
  totals: totalsOf(entries),
  takeFirst: cheapestFirst(entries),
  rules: ruleSpread(entries),
  directoryTails: directoryTails(entries),
  heaviest: heaviestFiles(entries),
  importers,
});
