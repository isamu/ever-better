import { runRuleCounts } from "../eslintRunner.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { applyRuleCounts, findRegressions, readState, writeState } from "../state.ts";

export type CheckOptions = {
  cwd: string;
  /** CI wants the ledger updated in place; a local check can leave the working tree alone. */
  write: boolean;
};

export type CheckResult = {
  ok: boolean;
  message: string;
};

export const runCheck = async (options: CheckOptions): Promise<CheckResult> => {
  const counts = await runRuleCounts(options.cwd);
  const previous = await readState(options.cwd);
  if (!previous) {
    return { ok: false, message: "No baseline. Run `ever-better freeze` and commit the result." };
  }

  const state = applyRuleCounts(previous, counts.suppressed, "observe");
  if (options.write) {
    await writeState(options.cwd, state);
    await writeQualityFile(options.cwd, state);
  }

  const regressions = findRegressions(state);
  const activeTotal = Object.values(counts.active).reduce((sum, count) => sum + count, 0);

  if (activeTotal > 0) {
    const worst = Object.entries(counts.active)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([rule, count]) => `  ${count}  ${rule}`);
    return {
      ok: false,
      message: [`${activeTotal} unsuppressed violations:`, ...worst].join("\n"),
    };
  }

  if (regressions.length > 0) {
    const lines = regressions.map(
      (item) =>
        `  ${item.name}: ${item.baseline} -> ${item.current} (+${item.current - item.baseline})`,
    );
    return { ok: false, message: ["Backlog grew:", ...lines].join("\n") };
  }

  const remaining = Object.values(state.rules).reduce((sum, rule) => sum + rule.current, 0);
  return { ok: true, message: `Clean. ${remaining} grandfathered violations left to drain.` };
};
