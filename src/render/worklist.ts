import { totalViolations } from "../state.ts";
import type { State } from "../types.ts";

export type WorklistItem = {
  done: boolean;
  label: string;
  detail?: string;
  children?: string[];
};

const NEXT_RULES_SHOWN = 5;

const openBootstrapGaps = (state: State): number => (state.diagnosis?.gaps ?? []).filter((gap) => gap.phase === "bootstrap").length;

const smallestBacklogs = (state: State): string[] =>
  Object.entries(state.rules)
    .filter(([, rule]) => rule.current > 0)
    .sort(([, a], [, b]) => a.current - b.current)
    .slice(0, NEXT_RULES_SHOWN)
    .map(([name, rule]) => `\`${name}\` — ${rule.current} left`);

/**
 * The list an unattended run works down, top to bottom. Derived from state rather than stored, so
 * it cannot drift from the numbers beside it — and so a session that picks this file up cold knows
 * where it is without reading the log.
 */
export const buildWorklist = (state: State): WorklistItem[] => {
  const bootstrapGaps = openBootstrapGaps(state);
  const backlog = totalViolations(state);
  const ruleCount = Object.values(state.rules).filter((rule) => rule.current > 0).length;

  return [
    {
      done: state.diagnosedAt !== null,
      label: "P0 diagnose",
      detail: state.diagnosedAt ? `taken ${state.diagnosedAt}` : "not yet run",
    },
    {
      done: state.diagnosedAt !== null && bootstrapGaps === 0,
      label: "P1 bootstrap",
      detail: bootstrapGaps === 0 ? "nothing missing" : `${bootstrapGaps} gap(s) still open`,
    },
    {
      done: state.frozenAt !== null,
      label: "P2 freeze",
      detail: state.frozenAt ? `frozen ${state.frozenAt}` : "baseline not pinned yet",
    },
    {
      done: state.frozenAt !== null && backlog === 0,
      label: "P3 drain",
      detail: backlog === 0 ? "backlog empty" : `${backlog} violations across ${ruleCount} rules`,
      children: smallestBacklogs(state),
    },
    {
      done: false,
      label: "P4 tighten",
      detail: "add the next rule tier, then freeze and drain again",
    },
    {
      done: false,
      label: "P5 duplication and dead code",
      detail: "report-only scans; extraction is judgment, not a threshold",
    },
  ];
};

const checkbox = (done: boolean): string => (done ? "[x]" : "[ ]");

const suffix = (detail: string | undefined): string => (detail ? ` — ${detail}` : "");

export const renderWorklist = (items: readonly WorklistItem[]): string[] =>
  items.flatMap((item) => [`- ${checkbox(item.done)} **${item.label}**${suffix(item.detail)}`, ...(item.children ?? []).map((child) => `  - [ ] ${child}`)]);
