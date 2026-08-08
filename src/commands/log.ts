import { headCommit } from "../git.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { appendLog, emptyState, readState, writeState } from "../state.ts";
import type { LogKind } from "../types.ts";

export type LogOptions = {
  cwd: string;
  kind: LogKind;
  text: string;
  rule?: string;
};

const KINDS: readonly LogKind[] = ["drained", "deferred", "issue", "note"];

export const isLogKind = (value: string): value is LogKind => KINDS.some((kind) => kind === value);

export const LOG_KIND_LIST = KINDS.join(" | ");

/**
 * The record a later session reads instead of guessing. `deferred` is the one that matters: a
 * refactor consciously not made, stamped with the commit it was seen at, so the next run can tell
 * whether the observation still describes the code.
 */
export const runLog = async (options: LogOptions): Promise<string> => {
  const previous = (await readState(options.cwd)) ?? emptyState();
  const entry = {
    kind: options.kind,
    text: options.text,
    ...(options.rule === undefined ? {} : { rule: options.rule }),
    commit: await headCommit(options.cwd),
  };
  const state = appendLog(previous, entry);
  await writeState(options.cwd, state);
  await writeQualityFile(options.cwd, state);
  return `Recorded ${options.kind}: ${options.text}`;
};
