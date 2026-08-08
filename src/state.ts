import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Counter, Diagnosis, LogEntry, LogKind, Phase, RuleBaseline, State } from "./types.ts";

const STATE_DIR = ".ever-better";
const STATE_FILE = "state.json";

/**
 * ESLint's bulk suppressions cover errors only. Warnings therefore stay visible forever and would
 * be free to accumulate, so their total gets the same ratchet through a plain counter.
 */
export const WARNINGS_COUNTER = "eslint:warnings";

/**
 * `observe` records today's number without touching the ceiling — what `diagnose` and `check` do.
 * `freeze` lowers the ceiling to today's number if it improved, and never raises it: running
 * `freeze` twice after a bad week must not legalise the damage. `rebaseline` is the explicit
 * `--force` escape for when a ceiling genuinely has to move up (a rule was reconfigured).
 */
export type BaselineMode = "observe" | "freeze" | "rebaseline";

const statePath = (cwd: string): string => path.join(cwd, STATE_DIR, STATE_FILE);

const isState = (value: unknown): value is State =>
  typeof value === "object" &&
  value !== null &&
  "version" in value &&
  value.version === 1 &&
  "rules" in value &&
  "counters" in value;

export const emptyState = (): State => ({
  version: 1,
  tool: "ever-better",
  phase: "diagnose",
  updatedAt: new Date().toISOString(),
  frozenAt: null,
  diagnosedAt: null,
  diagnosedCommit: null,
  diagnosis: null,
  rules: {},
  counters: {},
  log: [],
});

/** 0.1.0 wrote neither `log` nor the diagnosis provenance; fill them rather than rejecting. */
const migrate = (state: State): State => ({
  ...state,
  diagnosedAt: state.diagnosedAt ?? null,
  diagnosedCommit: state.diagnosedCommit ?? null,
  log: state.log ?? [],
});

export const readState = async (cwd: string): Promise<State | null> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(statePath(cwd), "utf8"));
    return isState(parsed) ? migrate(parsed) : null;
  } catch {
    return null;
  }
};

export const writeState = async (cwd: string, state: State): Promise<void> => {
  await mkdir(path.join(cwd, STATE_DIR), { recursive: true });
  const stamped: State = { ...state, updatedAt: new Date().toISOString() };
  await writeFile(statePath(cwd), `${JSON.stringify(stamped, null, 2)}\n`, "utf8");
};

export const withDiagnosis = (
  state: State,
  diagnosis: Diagnosis,
  commit: string | null,
): State => ({
  ...state,
  diagnosis,
  diagnosedAt: new Date().toISOString(),
  diagnosedCommit: commit,
});

/** Kept bounded: this file is read whole on every command, and a log is the thing that grows. */
const MAX_LOG_ENTRIES = 200;

export const appendLog = (state: State, entry: Omit<LogEntry, "at">): State => ({
  ...state,
  log: [...(state.log ?? []), { ...entry, at: new Date().toISOString() }].slice(-MAX_LOG_ENTRIES),
});

export const logOfKind = (state: State, kind: LogKind): LogEntry[] =>
  (state.log ?? []).filter((entry) => entry.kind === kind);

export const withPhase = (state: State, phase: Phase): State => ({ ...state, phase });

export const nextBaseline = (
  existing: number | undefined,
  current: number,
  mode: BaselineMode,
): number => {
  if (existing === undefined || mode === "rebaseline") return current;
  return mode === "freeze" ? Math.min(existing, current) : existing;
};

export const applyRuleCounts = (
  state: State,
  counts: Readonly<Record<string, number>>,
  mode: BaselineMode,
): State => {
  const names = new Set([...Object.keys(state.rules), ...Object.keys(counts)]);
  const rules: Record<string, RuleBaseline> = {};
  for (const name of names) {
    const current = counts[name] ?? 0;
    const existing = state.rules[name];
    rules[name] = {
      baseline: nextBaseline(existing?.baseline, current, mode),
      current,
      status: current === 0 ? "enforced" : (existing?.status ?? "draining"),
    };
  }
  return { ...state, rules };
};

export const setCounter = (
  state: State,
  name: string,
  current: number,
  mode: BaselineMode,
): State => {
  const counter: Counter = {
    baseline: nextBaseline(state.counters[name]?.baseline, current, mode),
    current,
  };
  return { ...state, counters: { ...state.counters, [name]: counter } };
};

export type Regression = {
  name: string;
  baseline: number;
  current: number;
};

/** The gate. Anything whose count rose above its ceiling, rule and plain counter alike. */
export const findRegressions = (state: State): Regression[] => {
  const entries = [
    ...Object.entries(state.rules).map(([name, rule]) => ({ name, ...rule })),
    ...Object.entries(state.counters).map(([name, counter]) => ({ name, ...counter })),
  ];
  return entries
    .filter((entry) => entry.current > entry.baseline)
    .map(({ name, baseline, current }) => ({ name, baseline, current }));
};

export const totalViolations = (state: State): number =>
  Object.values(state.rules).reduce((sum, rule) => sum + rule.current, 0);

export const improvements = (state: State): Regression[] =>
  Object.entries(state.rules)
    .map(([name, rule]) => ({ name, ...rule }))
    .filter((entry) => entry.current < entry.baseline)
    .map(({ name, baseline, current }) => ({ name, baseline, current }));
