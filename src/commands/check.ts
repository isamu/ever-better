import { checkVerdict, observedState, type CheckResult } from "../checkVerdict.ts";
import { runRuleCounts } from "../eslintRunner.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { readState, writeState } from "../state.ts";

export type CheckOptions = {
  cwd: string;
  /** CI wants the ledger updated in place; a local check can leave the working tree alone. */
  write: boolean;
};

export const runCheck = async (options: CheckOptions): Promise<CheckResult> => {
  const counts = await runRuleCounts(options.cwd);
  const previous = await readState(options.cwd);
  if (!previous) {
    return { ok: false, message: "No baseline. Run `ever-better freeze` and commit the result." };
  }

  const state = observedState(previous, counts);
  if (options.write) {
    await writeState(options.cwd, state);
    await writeQualityFile(options.cwd, state);
  }

  return checkVerdict(state, counts.errors);
};
