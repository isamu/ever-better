import { totalOf, type ErrorLocation, type RuleCounts } from "./eslintRunner.ts";
import { printableLine } from "./util/terminalText.ts";
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

const locationLine = ({ file, line, column, ruleId, message }: ErrorLocation): string =>
  `  ${printableLine(file)}:${line}:${column}  ${ruleId ?? "(parse error)"}  ${printableLine(message)}`;

/** The formatter caps the list, so what it left out is the error total minus what it sent. */
const whereTheyAre = (locations: readonly ErrorLocation[], errorTotal: number): string[] => {
  if (locations.length === 0) return [];
  const omitted = errorTotal - locations.length;
  const more = omitted > 0 ? [`  … and ${omitted} more — run \`eslint .\` for the full list`] : [];
  return ["", "Where they are:", ...locations.map(locationLine), ...more];
};

export const observedState = (previous: State, counts: RuleCounts): State =>
  setCounter(applyRuleCounts(previous, counts.suppressed, "observe"), WARNINGS_COUNTER, totalOf(counts.warnings), "observe");

/** Unsuppressed errors are checked before ceilings: after a freeze every one of them is new. */
export const checkVerdict = (state: State, errors: Readonly<Record<string, number>>, locations: readonly ErrorLocation[] = []): CheckResult => {
  const errorTotal = totalOf(errors);
  if (errorTotal > 0) {
    return {
      ok: false,
      message: [`${errorTotal} unsuppressed error(s) — these are new since the baseline:`, ...worst(errors), ...whereTheyAre(locations, errorTotal)].join("\n"),
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
