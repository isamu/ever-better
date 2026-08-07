import { diagnose } from "../diagnose.ts";
import { gatherFacts } from "../facts.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { renderReport } from "../render/report.ts";
import { emptyState, readState, withDiagnosis, writeState } from "../state.ts";

export type DiagnoseOptions = {
  cwd: string;
  json: boolean;
  write: boolean;
};

export const runDiagnose = async (options: DiagnoseOptions): Promise<string> => {
  const facts = await gatherFacts(options.cwd);
  const diagnosis = diagnose(facts);

  if (options.write) {
    const state = withDiagnosis((await readState(options.cwd)) ?? emptyState(), diagnosis);
    await writeState(options.cwd, state);
    await writeQualityFile(options.cwd, state);
  }

  return options.json ? JSON.stringify(diagnosis, null, 2) : renderReport(diagnosis);
};
