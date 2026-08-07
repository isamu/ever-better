import { runRuleCounts, suppressAll, totalOf } from "../eslintRunner.ts";
import { writeQualityFile } from "../qualityFile.ts";
import {
  applyRuleCounts,
  emptyState,
  readState,
  setCounter,
  WARNINGS_COUNTER,
  withPhase,
  writeState,
} from "../state.ts";
import type { State } from "../types.ts";

export type FreezeOptions = {
  cwd: string;
  /** Allows a ceiling to move UP. Only correct when a rule was deliberately reconfigured. */
  force: boolean;
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
    ...setCounter(
      applyRuleCounts(previous, counts.suppressed, mode),
      WARNINGS_COUNTER,
      totalOf(counts.warnings),
      mode,
    ),
    frozenAt: new Date().toISOString(),
  };
  const state = withPhase(frozen, "drain");
  await writeState(options.cwd, state);
  await writeQualityFile(options.cwd, state);

  const backlog = totalOf(counts.suppressed);
  const warnings = totalOf(counts.warnings);
  const errors = totalOf(counts.errors);
  return [
    `Baseline pinned: ${backlog} violations across ${Object.keys(counts.suppressed).length} rules are now grandfathered.`,
    warnings > 0
      ? `${warnings} warnings stay visible — ESLint cannot suppress those, so their total is ratcheted instead.`
      : "New code is held to the full rule set from here.",
    errors > 0
      ? `WARNING: ${errors} errors could not be suppressed and will fail CI. Fix the config before committing.`
      : "",
    "",
    "Commit eslint-suppressions.json, .ever-better/state.json and QUALITY.md.",
    "Next: pick the rule with the smallest count in QUALITY.md and drain it.",
  ]
    .filter((line, index, all) => line !== "" || all[index - 1] !== "")
    .join("\n");
};
