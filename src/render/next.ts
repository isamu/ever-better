import type { DrainPlan } from "../drainOrder.ts";

const FILES_SHOWN = 10;
const RULES_SHOWN = 8;
const TAILS_SHOWN = 6;

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

const widestOf = (values: readonly string[]): number => values.reduce((widest, value) => Math.max(widest, value.length), 0);

/** A section that silently showed its first ten rows would read as "that is all of them". */
const overflow = (total: number, shown: number): string[] => (total > shown ? [`      + ${total - shown} more`] : []);

const section = (title: string, rows: readonly string[], total: number, shown: number): string[] =>
  rows.length === 0 ? [] : ["", title, ...rows, ...overflow(total, shown)];

const takeFirstRows = (plan: DrainPlan): string[] => {
  const shown = plan.takeFirst.slice(0, FILES_SHOWN);
  const width = widestOf(shown.map((entry) => entry.file));
  return shown.map((entry) => `  ${String(entry.count).padStart(3)}  ${entry.file.padEnd(width)}  ${entry.rule}`);
};

const ruleRows = (plan: DrainPlan): string[] => {
  const shown = plan.rules.slice(0, RULES_SHOWN);
  const countWidth = widestOf(shown.map((rule) => String(rule.violations)));
  const fileWidth = widestOf(shown.map((rule) => plural(rule.files, "file")));
  return shown.map((rule) => `  ${String(rule.violations).padStart(countWidth)} in ${plural(rule.files, "file").padEnd(fileWidth)}   ${rule.rule}`);
};

const tailRows = (plan: DrainPlan): string[] => {
  const shown = plan.directoryTails.slice(0, TAILS_SHOWN);
  const width = widestOf(shown.map((tail) => tail.directory));
  return shown.map((tail) => `  ${tail.directory.padEnd(width)}  ${tail.rule}  —  ${tail.files.join(", ")}`);
};

const heavyRows = (plan: DrainPlan): string[] => {
  const width = widestOf(plan.heaviest.map((file) => plural(file.violations, "violation")));
  return plan.heaviest.map((file) => `  ${plural(file.violations, "violation").padStart(width)} across ${plural(file.rules, "rule")}   ${file.file}`);
};

const headline = (plan: DrainPlan): string =>
  `${plural(plan.totals.violations, "violation")} · ${plural(plan.totals.files, "file")} · ${plural(plan.totals.rules, "rule")} still grandfathered`;

const EMPTY = "Nothing is suppressed here — either the baseline is not frozen yet (`ever-better freeze`), or the backlog is empty.";

export const renderNext = (plan: DrainPlan): string => {
  if (plan.totals.violations === 0) return ["ever-better next", "", EMPTY, ""].join("\n");
  return [
    "ever-better next",
    "",
    headline(plan),
    ...section("take these first — one or two edits, and the rule is enforced in that file for good:", takeFirstRows(plan), plan.takeFirst.length, FILES_SHOWN),
    ...section("rules by the files you have to touch, not by the violations:", ruleRows(plan), plan.rules.length, RULES_SHOWN),
    ...section("the last files carrying a rule in their directory:", tailRows(plan), plan.directoryTails.length, TAILS_SHOWN),
    ...section("leave these until last — that count is a redesign, not a backlog:", heavyRows(plan), plan.heaviest.length, plan.heaviest.length),
    "",
  ].join("\n");
};
