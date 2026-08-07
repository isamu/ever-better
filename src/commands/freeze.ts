import { runRuleCounts, suppressAll } from "../eslintRunner.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { applyRuleCounts, emptyState, readState, withPhase, writeState } from "../state.ts";
import type { State } from "../types.ts";

export type FreezeOptions = {
  cwd: string;
  /** Allows a ceiling to move UP. Only correct when a rule was deliberately reconfigured. */
  force: boolean;
};

const totalOf = (counts: Readonly<Record<string, number>>): number =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

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

  const frozen: State = {
    ...applyRuleCounts(previous, counts.suppressed, options.force ? "rebaseline" : "freeze"),
    frozenAt: new Date().toISOString(),
  };
  const state = withPhase(frozen, "drain");
  await writeState(options.cwd, state);
  await writeQualityFile(options.cwd, state);

  const backlog = totalOf(counts.suppressed);
  const ruleCount = Object.keys(counts.suppressed).length;
  return [
    `Baseline pinned: ${backlog} violations across ${ruleCount} rules are now grandfathered.`,
    counts.errors > 0
      ? `WARNING: ${counts.errors} violations could not be suppressed and will fail CI.`
      : "New code is held to the full rule set from here.",
    "",
    "Commit eslint-suppressions.json, .ever-better/state.json and QUALITY.md.",
    "Next: pick the rule with the smallest count in QUALITY.md and drain it.",
  ].join("\n");
};
