import { runRuleCounts, totalOf } from "../eslintRunner.ts";
import { writeQualityFile } from "../qualityFile.ts";
import {
  applyRuleCounts,
  findRegressions,
  readState,
  setCounter,
  totalViolations,
  WARNINGS_COUNTER,
  writeState,
} from "../state.ts";

export type CheckOptions = {
  cwd: string;
  /** CI wants the ledger updated in place; a local check can leave the working tree alone. */
  write: boolean;
};

export type CheckResult = {
  ok: boolean;
  message: string;
};

const WORST_SAMPLE = 5;

const worst = (counts: Readonly<Record<string, number>>): string[] =>
  Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, WORST_SAMPLE)
    .map(([rule, count]) => `  ${count}  ${rule}`);

export const runCheck = async (options: CheckOptions): Promise<CheckResult> => {
  const counts = await runRuleCounts(options.cwd);
  const previous = await readState(options.cwd);
  if (!previous) {
    return { ok: false, message: "No baseline. Run `ever-better freeze` and commit the result." };
  }

  const state = setCounter(
    applyRuleCounts(previous, counts.suppressed, "observe"),
    WARNINGS_COUNTER,
    totalOf(counts.warnings),
    "observe",
  );
  if (options.write) {
    await writeState(options.cwd, state);
    await writeQualityFile(options.cwd, state);
  }

  const errorTotal = totalOf(counts.errors);
  if (errorTotal > 0) {
    return {
      ok: false,
      message: [
        `${errorTotal} unsuppressed error(s) — these are new since the baseline:`,
        ...worst(counts.errors),
      ].join("\n"),
    };
  }

  const regressions = findRegressions(state);
  if (regressions.length > 0) {
    const lines = regressions.map(
      (item) =>
        `  ${item.name}: ${item.baseline} -> ${item.current} (+${item.current - item.baseline})`,
    );
    return { ok: false, message: ["Counts grew past their ceiling:", ...lines].join("\n") };
  }

  return {
    ok: true,
    message: `Clean. ${totalViolations(state)} grandfathered violations left to drain.`,
  };
};
