import { freshnessOf } from "../qualityFile.ts";
import { findRegressions, improvements, readState, totalViolations } from "../state.ts";

export type StatusOptions = {
  cwd: string;
  json: boolean;
};

const NEXT_RULE_SAMPLE = 5;

export const runStatus = async (options: StatusOptions): Promise<string> => {
  const state = await readState(options.cwd);
  if (!state) return "No .ever-better/state.json here. Start with `ever-better diagnose`.";
  if (options.json) return JSON.stringify(state, null, 2);

  const freshness = await freshnessOf(options.cwd, state);

  const draining = Object.entries(state.rules)
    .filter(([, rule]) => rule.current > 0)
    .sort(([, a], [, b]) => a.current - b.current)
    .slice(0, NEXT_RULE_SAMPLE);

  return [
    ...(freshness.stale ? [`STALE      ${freshness.reason}`, ""] : []),
    `phase      ${state.phase}`,
    `frozen     ${state.frozenAt ?? "never"}`,
    `backlog    ${totalViolations(state)}`,
    `improved   ${improvements(state).length} rules`,
    `regressed  ${findRegressions(state).length} rules`,
    "",
    draining.length > 0 ? "smallest remaining backlogs:" : "backlog is empty.",
    ...draining.map(([name, rule]) => `  ${rule.current}  ${name}`),
    ...(draining.length > 0 ? ["", "`ever-better next` ranks these by what they cost and what each one enforces."] : []),
    "",
  ].join("\n");
};
