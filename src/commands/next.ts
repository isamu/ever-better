import { buildDrainPlan } from "../drainOrder.ts";
import { renderNext } from "../render/next.ts";
import { readSuppressions } from "../suppressionsFile.ts";

export type NextOptions = {
  cwd: string;
  json: boolean;
};

export const runNext = async (options: NextOptions): Promise<string> => {
  const plan = buildDrainPlan(await readSuppressions(options.cwd));
  return options.json ? JSON.stringify(plan, null, 2) : renderNext(plan);
};
