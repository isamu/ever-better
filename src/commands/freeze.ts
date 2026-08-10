import { relative } from "node:path";

import { runRuleCounts, suppressAll, totalOf } from "../eslintRunner.ts";
import type { RuleCounts } from "../eslintRunner.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { applyRuleCounts, emptyState, readState, setCounter, WARNINGS_COUNTER, withPhase, writeState } from "../state.ts";
import type { State } from "../types.ts";

export type FreezeOptions = {
  cwd: string;
  /** Allows a ceiling to move UP. Only correct when a rule was deliberately reconfigured. */
  force: boolean;
};

/**
 * `--suppress-all` covers rule violations, so anything left is something ESLint could not attribute
 * to a rule — almost always a parse error or a config-level complaint. "Fix the config" was the
 * whole message, which sends the reader to the config they just generated rather than to the file
 * that is actually failing. Naming the rules turns a mystery into a task.
 *
 * The commonest one on a repository older than ESLint 9 is an `eslint-env` block comment, which
 * flat config rejects outright. Those are already dead — flat config never honoured them — so
 * deleting them changes nothing and clears the error.
 */
const unsuppressedReport = (counts: RuleCounts, cwd: string): string[] => {
  const total = totalOf(counts.errors);
  if (total === 0) return [];
  const byCount = Object.entries(counts.errors).sort(([, a], [, b]) => b - a);
  const samples = (counts.unattributed ?? []).map(({ file, line, message }) => `  ${relative(cwd, file)}:${line}  ${message}`);
  return [
    `WARNING: ${total} error(s) could not be suppressed and will fail CI:`,
    ...byCount.map(([rule, count]) => `  ${count}  ${rule}`),
    ...(samples.length > 0 ? ["", "Where they are:", ...samples] : []),
    "These are not rule violations the baseline can grandfather. Fix them before committing.",
  ];
};

export const runFreeze = async (options: FreezeOptions): Promise<string> => {
  const previous = (await readState(options.cwd)) ?? emptyState();
  if (previous.frozenAt && !options.force) {
    return [
      `Already frozen at ${previous.frozenAt}.`,
      "Freezing again would grandfather everything added since, which is the one thing the",
      "baseline exists to prevent. To reclaim suppressions you have fixed, run `ever-better prune`.",
      "If a rule was genuinely reconfigured, re-run with --force.",
    ].join("\n");
  }

  await suppressAll(options.cwd);
  const counts = await runRuleCounts(options.cwd);
  const mode = options.force ? "rebaseline" : "freeze";

  const frozen: State = {
    ...setCounter(applyRuleCounts(previous, counts.suppressed, mode), WARNINGS_COUNTER, totalOf(counts.warnings), mode),
    frozenAt: new Date().toISOString(),
  };
  const state = withPhase(frozen, "drain");
  await writeState(options.cwd, state);
  await writeQualityFile(options.cwd, state);

  const backlog = totalOf(counts.suppressed);
  const warnings = totalOf(counts.warnings);
  return [
    `Baseline pinned: ${backlog} violations across ${Object.keys(counts.suppressed).length} rules are now grandfathered.`,
    warnings > 0
      ? `${warnings} warnings stay visible — ESLint cannot suppress those, so their total is ratcheted instead.`
      : "New code is held to the full rule set from here.",
    ...unsuppressedReport(counts, options.cwd),
    "",
    "Commit eslint-suppressions.json, .ever-better/state.json and QUALITY.md.",
    "Next: pick the rule with the smallest count in QUALITY.md and drain it.",
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");
};
