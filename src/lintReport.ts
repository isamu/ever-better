import type { RuleCounts } from "./eslintRunner.ts";
import type { Suppression } from "./suppressionsFile.ts";

/** A file at the repository root belongs to no directory, and "" reads as missing data. */
const ROOT_AREA = "(root)";

export type Matrix = Record<string, Record<string, number>>;

type ReportRow = {
  rule: string;
  total: number;
  /** Counts in the same order as the section's `areas`, so the renderer does no lookups. */
  counts: number[];
};

export type ReportSection = {
  title: string;
  total: number;
  areas: string[];
  rows: ReportRow[];
};

export type LintReport = {
  errorTotal: number;
  warningTotal: number;
  suppressedTotal: number;
  files: number;
  /** Rule totals only: after a freeze an unsuppressed error is new, and ESLint already named it. */
  errors: { rule: string; count: number }[];
  sections: ReportSection[];
  /**
   * Why no lint ran, when none did — the report then covers the ratchet file and nothing else, and
   * a reader has to be able to tell "no warnings" from "nobody looked for warnings".
   */
  lintFailure: string | null;
};

export const areaOf = (file: string): string => {
  const [first, ...rest] = file.split("/");
  return rest.length === 0 || first === undefined || first === "" ? ROOT_AREA : first;
};

const totalOf = (counts: Readonly<Record<string, number>>): number => Object.values(counts).reduce((sum, count) => sum + count, 0);

const matrixTotal = (matrix: Matrix): number => Object.values(matrix).reduce((sum, rules) => sum + totalOf(rules), 0);

/** The ratchet file is per file per rule, which is the same information one directory up. */
export const matrixFromSuppressions = (entries: readonly Suppression[]): Matrix => {
  const matrix: Matrix = {};
  entries.forEach((entry) => {
    const area = (matrix[areaOf(entry.file)] ??= {});
    area[entry.rule] = (area[entry.rule] ?? 0) + entry.count;
  });
  return matrix;
};

const rulesIn = (matrix: Matrix): string[] => [...new Set(Object.values(matrix).flatMap((rules) => Object.keys(rules)))];

const ruleTotal = (matrix: Matrix, rule: string): number => Object.values(matrix).reduce((sum, rules) => sum + (rules[rule] ?? 0), 0);

const areasByWeight = (matrix: Matrix): string[] =>
  Object.entries(matrix)
    .sort(([leftName, left], [rightName, right]) => totalOf(right) - totalOf(left) || leftName.localeCompare(rightName))
    .map(([area]) => area);

const sectionOf = (title: string, matrix: Matrix): ReportSection[] => {
  const total = matrixTotal(matrix);
  if (total === 0) return [];
  const areas = areasByWeight(matrix);
  const rows = rulesIn(matrix)
    .map((rule) => ({ rule, total: ruleTotal(matrix, rule), counts: areas.map((area) => matrix[area]?.[rule] ?? 0) }))
    .sort((left, right) => right.total - left.total || left.rule.localeCompare(right.rule));
  return [{ title, total, areas, rows }];
};

const errorList = (errors: Readonly<Record<string, number>>): { rule: string; count: number }[] =>
  Object.entries(errors)
    .map(([rule, count]) => ({ rule, count }))
    .sort((left, right) => right.count - left.count || left.rule.localeCompare(right.rule));

/**
 * `counts` is null when ESLint could not run, and the ratchet file alone still answers the question
 * the report exists for — where the debt is. Warnings are the half that only a lint run can see:
 * ESLint's suppressions cover errors, so a warning is never recorded anywhere per rule.
 */
type Resolved = {
  errors: Record<string, number>;
  warningTotal: number;
  warningMatrix: Matrix;
  suppressedMatrix: Matrix;
  files: number;
};

/** Every fallback in one place, so the report itself reads as what it reports rather than as defaults. */
const resolve = (counts: RuleCounts | null, suppressions: readonly Suppression[]): Resolved => ({
  errors: counts?.errors ?? {},
  warningTotal: totalOf(counts?.warnings ?? {}),
  warningMatrix: counts?.areas?.warnings ?? {},
  suppressedMatrix: counts?.areas?.suppressed ?? matrixFromSuppressions(suppressions),
  files: counts?.files ?? 0,
});

export const buildLintReport = (counts: RuleCounts | null, suppressions: readonly Suppression[], lintFailure: string | null = null): LintReport => {
  const resolved = resolve(counts, suppressions);
  return {
    errorTotal: totalOf(resolved.errors),
    warningTotal: resolved.warningTotal,
    suppressedTotal: matrixTotal(resolved.suppressedMatrix),
    files: resolved.files,
    errors: errorList(resolved.errors),
    sections: [
      ...sectionOf("Backlog — suppressed, drains rule by rule", resolved.suppressedMatrix),
      ...sectionOf("Warnings — never suppressed, so these never drain on their own", resolved.warningMatrix),
    ],
    lintFailure: counts === null ? (lintFailure ?? "ESLint did not run") : null,
  };
};
