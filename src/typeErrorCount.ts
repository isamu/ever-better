import type { ExecResult } from "./util/exec.ts";

/** Counts the `error TS` lines of a tsc run. The run must use `--pretty false`, or colour codes split the marker and this returns zero. */
export const countTypeErrors = (result: Pick<ExecResult, "stdout" | "stderr">): number =>
  `${result.stdout}\n${result.stderr}`.split("\n").filter((line) => line.includes("error TS")).length;
