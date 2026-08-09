import { readFile } from "node:fs/promises";
import path from "node:path";

const SUPPRESSIONS_FILE = "eslint-suppressions.json";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isCountEntry = (value: unknown): value is { count: number } => isRecord(value) && typeof value["count"] === "number";

export type Suppression = {
  file: string;
  rule: string;
  count: number;
};

/**
 * ESLint records relative paths with the separator of whatever platform froze the baseline, so a
 * repository frozen on Windows groups by a different directory than the same repository frozen on
 * Linux unless the keys are normalised on the way in.
 */
const toPosix = (file: string): string => file.replaceAll("\\", "/");

const entriesForFile = (file: string, rules: unknown): Suppression[] => {
  if (!isRecord(rules)) return [];
  return Object.entries(rules).flatMap(([rule, entry]) => (isCountEntry(entry) ? [{ file: toPosix(file), rule, count: entry.count }] : []));
};

export const parseSuppressions = (value: unknown): Suppression[] => {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([file, rules]) => entriesForFile(file, rules));
};

/**
 * Written by ESLint as `{ file: { rule: { count } } }`, so its size is bounded by rules x files —
 * reading it whole is safe in a way reading a log never is.
 */
export const readSuppressions = async (cwd: string): Promise<Suppression[]> => {
  try {
    return parseSuppressions(JSON.parse(await readFile(path.join(cwd, SUPPRESSIONS_FILE), "utf8")));
  } catch {
    return [];
  }
};

/** Sum of every recorded suppression. */
export const readSuppressionTotal = async (cwd: string): Promise<number> => {
  const entries = await readSuppressions(cwd);
  return entries.reduce((sum, entry) => sum + entry.count, 0);
};
