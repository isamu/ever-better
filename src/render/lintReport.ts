import type { LintReport, ReportSection } from "../lintReport.ts";

const ROWS_SHOWN = 12;
const AREAS_SHOWN = 6;
const BAR_WIDTH = 24;

const bar = (count: number, largest: number): string => "█".repeat(largest === 0 ? 0 : Math.max(1, Math.round((count / largest) * BAR_WIDTH)));

/** Columns beyond the cap are summed into one that says so, rather than dropped. */
const columnsOf = (section: ReportSection): { headings: string[]; countsOf: (counts: readonly number[]) => number[] } => {
  if (section.areas.length <= AREAS_SHOWN) return { headings: section.areas, countsOf: (counts) => [...counts] };
  const hidden = section.areas.length - AREAS_SHOWN;
  return {
    headings: [...section.areas.slice(0, AREAS_SHOWN), `${hidden} more`],
    countsOf: (counts) => [...counts.slice(0, AREAS_SHOWN), counts.slice(AREAS_SHOWN).reduce((sum, count) => sum + count, 0)],
  };
};

const renderSection = (section: ReportSection): string[] => {
  const { headings, countsOf } = columnsOf(section);
  const shown = section.rows.slice(0, ROWS_SHOWN);
  const largest = shown[0]?.total ?? 0;
  return [
    "",
    `### ${section.title} — ${section.total}`,
    "",
    `| rule | ${headings.join(" | ")} | total | |`,
    `|---|${headings.map(() => "--:").join("|")}|--:|---|`,
    ...shown.map((row) => `| \`${row.rule}\` | ${countsOf(row.counts).join(" | ")} | **${row.total}** | ${bar(row.total, largest)} |`),
    ...(section.rows.length > ROWS_SHOWN ? ["", `${section.rows.length - ROWS_SHOWN} more rules not shown.`] : []),
  ];
};

const headline = (report: LintReport): string => {
  const parts = [`${report.suppressedTotal} suppressed`, `${report.warningTotal} warnings`, `${report.errorTotal} errors`];
  return `## Lint findings — ${parts.join(", ")}`;
};

const errorLines = (report: LintReport): string[] => {
  if (report.errors.length === 0) return [];
  return ["", "### Errors — nothing recorded these, so they are new", "", ...report.errors.map((entry) => `- \`${entry.rule}\` — ${entry.count}`)];
};

const preface = (report: LintReport): string[] => {
  // "No warnings" and "nobody looked for warnings" render identically otherwise, and only one of
  // them is good news.
  if (report.lintFailure !== null) return ["", `**This is the ratchet file alone — warnings are not in it.** ESLint did not run: ${report.lintFailure}`];
  return report.files > 0 ? ["", `${report.files} files linted.`] : [];
};

export const renderLintReport = (report: LintReport): string => {
  if (report.sections.length === 0 && report.errors.length === 0) {
    return [headline(report), "", "Nothing to report — no suppressions, no warnings, no errors.", ""].join("\n");
  }
  return [headline(report), ...preface(report), ...errorLines(report), ...report.sections.flatMap(renderSection), ""].join("\n");
};
