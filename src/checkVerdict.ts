import { totalOf, type RuleCounts } from "./eslintRunner.ts";
import { applyRuleCounts, findRegressions, setCounter, totalViolations, WARNINGS_COUNTER } from "./state.ts";
import type { State } from "./types.ts";

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

export const observedState = (previous: State, counts: RuleCounts): State =>
  setCounter(applyRuleCounts(previous, counts.suppressed, "observe"), WARNINGS_COUNTER, totalOf(counts.warnings), "observe");

/** Unsuppressed errors are checked before ceilings: after a freeze every one of them is new. */
export const checkVerdict = (state: State, errors: Readonly<Record<string, number>>): CheckResult => {
  const errorTotal = totalOf(errors);
  if (errorTotal > 0) {
    return {
      ok: false,
      message: [`${errorTotal} unsuppressed error(s) — these are new since the baseline:`, ...worst(errors)].join("\n"),
    };
  }

  const regressions = findRegressions(state);
  if (regressions.length > 0) {
    const lines = regressions.map((item) => `  ${item.name}: ${item.baseline} -> ${item.current} (+${item.current - item.baseline})`);
    return { ok: false, message: ["Counts grew past their ceiling:", ...lines].join("\n") };
  }

  return {
    ok: true,
    message: `Clean. ${totalViolations(state)} grandfathered violations left to drain.`,
  };
};
