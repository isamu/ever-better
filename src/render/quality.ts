import { findRegressions, improvements, logOfKind, totalViolations } from "../state.ts";
import type { Freshness } from "../freshness.ts";
import type { Gap, LogEntry, RuleBaseline, State } from "../types.ts";
import { buildWorklist, renderWorklist } from "./worklist.ts";

export const QUALITY_FILE = "QUALITY.md";

/** Text between these markers is the owner's, and every render puts it back untouched. */
export const NOTES_START = "<!-- ever-better:notes:start -->";
export const NOTES_END = "<!-- ever-better:notes:end -->";

const PHASE_ORDER = ["diagnose", "bootstrap", "freeze", "drain", "tighten", "split", "review"];

const STATUS_LABEL: Record<string, string> = {
  off: "off",
  draining: "draining",
  enforced: "clean",
};

const delta = (rule: RuleBaseline): string => {
  const change = rule.current - rule.baseline;
  if (change === 0) return "0";
  return change > 0 ? `+${change}` : `${change}`;
};

const rulesTable = (rules: Readonly<Record<string, RuleBaseline>>): string[] => {
  const rows = Object.entries(rules)
    .filter(([, rule]) => rule.baseline > 0 || rule.current > 0)
    .sort(([, a], [, b]) => b.current - a.current);
  if (rows.length === 0) return ["No rule violations recorded yet. Run `ever-better freeze`.", ""];
  return [
    "| Rule | Ceiling | Now | Change | Status |",
    "| --- | ---: | ---: | ---: | --- |",
    ...rows.map(([name, rule]) => `| \`${name}\` | ${rule.baseline} | ${rule.current} | ${delta(rule)} | ${STATUS_LABEL[rule.status] ?? rule.status} |`),
    "",
  ];
};

const countersTable = (counters: State["counters"]): string[] => {
  const rows = Object.entries(counters);
  if (rows.length === 0) return [];
  return [
    "## Other counters",
    "",
    "| Counter | Ceiling | Now |",
    "| --- | ---: | ---: |",
    ...rows.map(([name, counter]) => `| ${name} | ${counter.baseline} | ${counter.current} |`),
    "",
  ];
};

const gapsChecklist = (gaps: readonly Gap[]): string[] => {
  if (gaps.length === 0) return ["Nothing outstanding.", ""];
  const byPhase = PHASE_ORDER.filter((phase) => gaps.some((gap) => gap.phase === phase));
  return byPhase.flatMap((phase) => [
    `### ${phase}`,
    "",
    ...gaps.filter((gap) => gap.phase === phase).map((gap) => `- [ ] **${gap.title}** — ${gap.detail}`),
    "",
  ]);
};

const LOG_ENTRIES_SHOWN = 20;

const shortCommit = (commit: string | null): string => (commit ? commit.slice(0, 8) : "unknown");

/**
 * Deferred work is the section that decays. Each entry carries the commit it was written at, so a
 * reader can see at a glance whether the observation predates half the repository.
 */
const rulePrefix = (rule: string | undefined): string => (rule ? `\`${rule}\` — ` : "");

const provenance = (entry: LogEntry): string => `_(${entry.at.slice(0, 10)}, ${shortCommit(entry.commit)})_`;

const carriedOver = (state: State): string[] => {
  const deferred = logOfKind(state, "deferred");
  if (deferred.length === 0) return [];
  return [
    "## Carried over",
    "",
    "Refactors left undone, with the commit each was seen at. Re-check before acting on an old one.",
    "",
    ...deferred.map((entry) => `- [ ] ${rulePrefix(entry.rule)}${entry.text}  ${provenance(entry)}`),
    "",
  ];
};

const logRow = (entry: LogEntry): string => `| ${entry.at.slice(0, 10)} | ${shortCommit(entry.commit)} | ${entry.kind} | ${entry.rule ?? ""} | ${entry.text} |`;

const workLog = (state: State): string[] => {
  const entries = (state.log ?? []).slice(-LOG_ENTRIES_SHOWN).reverse();
  if (entries.length === 0) return [];
  return ["## Work log", "", "| Date | Commit | Kind | Rule | What |", "| --- | --- | --- | --- | --- |", ...entries.map(logRow), ""];
};

const freshnessBanner = (freshness: Freshness): string[] =>
  freshness.stale ? [`> **The diagnosis below is stale** — ${freshness.reason}.`, "> Numbers and file names may describe code that has since moved.", ""] : [];

const headline = (state: State): string[] => {
  const regressions = findRegressions(state);
  const gained = improvements(state);
  const total = totalViolations(state);
  const verdict =
    regressions.length > 0
      ? `${regressions.length} counter(s) above the ceiling — this is what \`ever-better check\` fails on.`
      : "Everything is at or below its ceiling.";
  return [
    `- Phase: **${state.phase}**`,
    `- Frozen: ${state.frozenAt ?? "not yet — run `ever-better freeze`"}`,
    `- Open violations: **${total}**`,
    `- Rules improved since the ceiling: **${gained.length}**`,
    `- ${verdict}`,
    "",
  ];
};

export const extractNotes = (existing: string | null): string => {
  if (!existing) return "";
  const start = existing.indexOf(NOTES_START);
  const end = existing.indexOf(NOTES_END);
  if (start === -1 || end === -1 || end < start) return "";
  return existing.slice(start + NOTES_START.length, end).trim();
};

/**
 * Pure: same state and same notes render the same file, so the diff on every run is exactly the
 * numbers that moved.
 */
export const renderQuality = (state: State, notes: string, freshness: Freshness): string =>
  [
    "# Quality",
    "",
    "Maintained by [ever-better](https://github.com/isamu/ever-better). Numbers are rendered from",
    "`.ever-better/state.json`; edits outside the notes block are overwritten on the next run.",
    "",
    ...freshnessBanner(freshness),
    ...headline(state),
    "## Worklist",
    "",
    "Top to bottom. An unattended run works this list and nothing else.",
    "",
    ...renderWorklist(buildWorklist(state)),
    "",
    ...carriedOver(state),
    "## Ratchet",
    "",
    "Ceiling is the count at the last freeze. It may fall and must never rise.",
    "",
    ...rulesTable(state.rules),
    ...countersTable(state.counters),
    "## Outstanding",
    "",
    ...gapsChecklist(state.diagnosis?.gaps ?? []),
    ...workLog(state),
    "## Notes",
    "",
    NOTES_START,
    notes.length > 0 ? notes : "_Anything written between these markers survives a re-render._",
    NOTES_END,
    "",
  ].join("\n");
