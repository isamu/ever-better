import type { Suppression } from "./suppressionsFile.ts";

export type TierEntry = {
  file: string;
  rules: string[];
};

/** A pair that fails today and is not already excused. Writing it in would legalise a regression. */
export type TierPair = {
  file: string;
  rule: string;
};

const sorted = (values: Iterable<string>): string[] => [...values].sort((a, b) => a.localeCompare(b));

const byFile = (entries: readonly Suppression[]): Map<string, Set<string>> => {
  const grouped = new Map<string, Set<string>>();
  entries.forEach((entry) => {
    const rules = grouped.get(entry.file) ?? new Set<string>();
    rules.add(entry.rule);
    grouped.set(entry.file, rules);
  });
  return grouped;
};

/**
 * The failing set as a list of exceptions, ordered so that two runs over the same repository
 * produce the same file rather than a diff nobody caused.
 */
export const tierList = (failing: readonly Suppression[]): TierEntry[] => {
  const grouped = byFile(failing);
  return sorted(grouped.keys()).map((file) => ({ file, rules: sorted(grouped.get(file) ?? []) }));
};

const pairsOf = (entries: readonly TierEntry[]): TierPair[] => entries.flatMap((entry) => entry.rules.map((rule) => ({ file: entry.file, rule })));

const keys = (entries: readonly TierEntry[]): Set<string> => new Set(pairsOf(entries).map((pair) => `${pair.file} ${pair.rule}`));

/**
 * What the list would have to gain to describe today. It is allowed to shrink and nothing else: a
 * pair failing now that was not excused before is new code breaking a rule that was already an
 * error for it, which is the one thing this must not write down and forgive.
 */
export const regressions = (before: readonly TierEntry[], now: readonly TierEntry[]): TierPair[] => {
  const excused = keys(before);
  return pairsOf(now).filter((pair) => !excused.has(`${pair.file} ${pair.rule}`));
};

/** What stopped failing since the last run — the list shrinking is the whole point. */
export const drained = (before: readonly TierEntry[], now: readonly TierEntry[]): TierPair[] => {
  const failing = keys(now);
  return pairsOf(before).filter((pair) => !failing.has(`${pair.file} ${pair.rule}`));
};

export const ruleNames = (entries: readonly TierEntry[]): string[] => sorted(new Set(entries.flatMap((entry) => entry.rules)));
