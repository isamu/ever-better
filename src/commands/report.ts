import { appendFile } from "node:fs/promises";
import process from "node:process";
import { runRuleCounts, type RuleCounts } from "../eslintRunner.ts";
import { buildLintReport } from "../lintReport.ts";
import { renderLintReport } from "../render/lintReport.ts";
import { readSuppressions } from "../suppressionsFile.ts";

export type ReportOptions = {
  cwd: string;
  json: boolean;
};

/**
 * Actions sets this to a file every job may append markdown to. Writing there is what makes this a
 * CI report without anyone editing a workflow, and outside Actions it is unset so a terminal run
 * only ever prints.
 */
const STEP_SUMMARY = "GITHUB_STEP_SUMMARY";

const appendToStepSummary = async (markdown: string): Promise<void> => {
  const target = process.env[STEP_SUMMARY];
  if (!target) return;
  // A report is not a gate. Failing the job because the summary could not be written would make it
  // one, and the markdown has already gone to stdout either way.
  await appendFile(target, `${markdown}\n`, "utf8").catch(() => undefined);
};

/**
 * A report is not a gate, so a repository that cannot lint still gets the half of the answer the
 * ratchet file holds. The reason travels with it — "no warnings" and "nobody looked" have to read
 * differently.
 */
const lint = async (cwd: string): Promise<{ counts: RuleCounts | null; failure: string | null }> => {
  try {
    return { counts: await runRuleCounts(cwd), failure: null };
  } catch (error) {
    return { counts: null, failure: error instanceof Error ? (error.message.split("\n")[0] ?? "unknown error") : String(error) };
  }
};

export const runReport = async (options: ReportOptions): Promise<string> => {
  const { counts, failure } = await lint(options.cwd);
  const report = buildLintReport(counts, await readSuppressions(options.cwd), failure);
  if (options.json) return JSON.stringify(report, null, 2);
  const markdown = renderLintReport(report);
  await appendToStepSummary(markdown);
  return markdown;
};
