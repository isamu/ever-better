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

/**
 * Missing and empty are different answers, and conflating them is how the shrink-only promise
 * breaks at the exact moment a repository succeeds: once the list drains to `[]` and is committed,
 * an empty ledger read as "first run" lets the next new violation be written in and forgiven. A
 * ledger that is PRESENT enforces the rule however few entries it holds.
 *
 * `null` is a ledger that exists and cannot be read. That is not a fresh start either — rebaselining
 * off a truncated or hand-edited file would legalise everything that has failed since it was valid.
 */
export type Ledger = { present: false } | { present: true; entries: TierEntry[] };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isEntry = (value: unknown): value is TierEntry =>
  isRecord(value) && typeof value["file"] === "string" && Array.isArray(value["rules"]) && value["rules"].every((rule) => typeof rule === "string");

export const parseLedger = (text: string | null): Ledger | null => {
  if (text === null) return { present: false };
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed) || !parsed.every(isEntry)) return null;
    return { present: true, entries: parsed };
  } catch {
    return null;
  }
};

/**
 * What this run must refuse to write in. A ledger that is PRESENT enforces shrink-only however few
 * entries it holds — including none, which is a drained repository and the strictest state there is,
 * not a repository asking for a new baseline.
 */
export const refused = (ledger: Ledger, now: readonly TierEntry[]): TierPair[] => (ledger.present ? regressions(ledger.entries, now) : []);
