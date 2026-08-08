import { readFile } from "node:fs/promises";
import path from "node:path";

const SUPPRESSIONS_FILE = "eslint-suppressions.json";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCountEntry = (value: unknown): value is { count: number } =>
  isRecord(value) && typeof value["count"] === "number";

/**
 * Sum of every recorded suppression. Written by ESLint as `{ file: { rule: { count } } }`, so its
 * size is bounded by rules x files — reading it whole is safe in a way reading a log never is.
 */
export const readSuppressionTotal = async (cwd: string): Promise<number> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path.join(cwd, SUPPRESSIONS_FILE), "utf8"));
  } catch {
    return 0;
  }
  if (!isRecord(parsed)) return 0;
  const perFile: unknown[] = Object.values(parsed);
  return perFile
    .filter(isRecord)
    .flatMap((rules) => Object.values(rules))
    .filter(isCountEntry)
    .reduce((sum, entry) => sum + entry.count, 0);
};
