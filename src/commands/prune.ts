import { pruneSuppressions, runRuleCounts } from "../eslintRunner.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { applyRuleCounts, emptyState, readState, totalViolations, writeState } from "../state.ts";
import { readSuppressionTotal } from "../suppressionsFile.ts";

export type PruneOptions = {
  cwd: string;
};

/**
 * The only sanctioned way for the ceiling to fall. `freeze` pins whatever exists today, so running
 * it a second time would grandfather violations added since — `prune` can only ever remove
 * suppressions whose violations are gone, which makes it safe to run at any point.
 */
export const runPrune = async (options: PruneOptions): Promise<string> => {
  // Measured against the suppressions FILE, not the ledger: a `check` run since the fix has
  // already lowered the ledger, so comparing that would report every prune as a no-op.
  const before = await readSuppressionTotal(options.cwd);
  await pruneSuppressions(options.cwd);
  const after = await readSuppressionTotal(options.cwd);

  const counts = await runRuleCounts(options.cwd);
  const state = applyRuleCounts(
    (await readState(options.cwd)) ?? emptyState(),
    counts.suppressed,
    "freeze",
  );
  await writeState(options.cwd, state);
  await writeQualityFile(options.cwd, state);

  const reclaimed = before - after;
  if (reclaimed <= 0) return `Nothing to reclaim. ${totalViolations(state)} still grandfathered.`;
  return [
    `Reclaimed ${reclaimed} suppressions. Ceiling: ${before} -> ${after}.`,
    "Commit eslint-suppressions.json together with the fix — the ceiling just came down.",
  ].join("\n");
};
