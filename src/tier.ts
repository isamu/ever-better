import type { Suppression } from "./suppressionsFile.ts";

/**
 * One file's exceptions, and how many of each. The count is the half a `files`-scoped flat-config
 * block cannot express: it downgrades a whole file-and-rule pair to `warn`, so a second violation of
 * an already-excused rule in an already-excused file is a warning too, and nothing notices. The
 * ledger carries the number so this tool can.
 */
export type TierEntry = {
  file: string;
  rules: Record<string, number>;
};

/** A pair that fails more than the list excuses. Writing it in would legalise a regression. */
export type TierPair = {
  file: string;
  rule: string;
  /** What fails today. */
  count: number;
  /** What the list excused. Zero means the pair was not on it at all. */
  allowed: number;
};

const sorted = (values: Iterable<string>): string[] => [...values].sort((a, b) => a.localeCompare(b));

const byFile = (entries: readonly Suppression[]): Map<string, Map<string, number>> => {
  const grouped = new Map<string, Map<string, number>>();
  entries.forEach((entry) => {
    const rules = grouped.get(entry.file) ?? new Map<string, number>();
    rules.set(entry.rule, (rules.get(entry.rule) ?? 0) + entry.count);
    grouped.set(entry.file, rules);
  });
  return grouped;
};

/** Sorted on the way in, so two runs over the same repository produce the same file byte for byte. */
const asRecord = (rules: Map<string, number>): Record<string, number> => Object.fromEntries(sorted(rules.keys()).map((rule) => [rule, rules.get(rule) ?? 0]));

/**
 * The failing set as a list of exceptions, ordered so that two runs over the same repository
 * produce the same file rather than a diff nobody caused.
 */
export const tierList = (failing: readonly Suppression[]): TierEntry[] => {
  const grouped = byFile(failing);
  return sorted(grouped.keys()).map((file) => ({ file, rules: asRecord(grouped.get(file) ?? new Map<string, number>()) }));
};

const pairsOf = (entries: readonly TierEntry[]): { file: string; rule: string; count: number }[] =>
  entries.flatMap((entry) => Object.entries(entry.rules).map(([rule, count]) => ({ file: entry.file, rule, count })));

const allowanceOf = (entries: readonly TierEntry[]): Map<string, number> => new Map(pairsOf(entries).map((pair) => [`${pair.file} ${pair.rule}`, pair.count]));

/**
 * What the list would have to gain to describe today. It is allowed to shrink and nothing else: a
 * pair failing more than it was excused for is new code breaking a rule that was already an error
 * for it, which is the one thing this must not write down and forgive.
 */
export const regressions = (before: readonly TierEntry[], now: readonly TierEntry[]): TierPair[] => {
  const excused = allowanceOf(before);
  return pairsOf(now)
    .map((pair) => ({ ...pair, allowed: excused.get(`${pair.file} ${pair.rule}`) ?? 0 }))
    .filter((pair) => pair.count > pair.allowed);
};

/** What stopped failing since the last run — the list shrinking is the whole point. */
export const drained = (before: readonly TierEntry[], now: readonly TierEntry[]): TierPair[] => {
  const failing = allowanceOf(now);
  return pairsOf(before)
    .map((pair) => ({ ...pair, allowed: failing.get(`${pair.file} ${pair.rule}`) ?? 0 }))
    .filter((pair) => pair.allowed < pair.count)
    .map((pair) => ({ file: pair.file, rule: pair.rule, count: pair.allowed, allowed: pair.count }));
};

export const ruleNames = (entries: readonly TierEntry[]): string[] => sorted(new Set(entries.flatMap((entry) => Object.keys(entry.rules))));

/** Every violation the list excuses. What `tier` is asked to drive to zero. */
export const violations = (entries: readonly TierEntry[]): number => pairsOf(entries).reduce((total, pair) => total + pair.count, 0);

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

const isCounts = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every((count) => typeof count === "number" && Number.isInteger(count) && count > 0);

const isEntry = (value: unknown): value is TierEntry => isRecord(value) && typeof value["file"] === "string" && isCounts(value["rules"]);

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
