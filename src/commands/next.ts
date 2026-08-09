import { buildDrainPlan } from "../drainOrder.ts";
import { listSourcePaths } from "../facts.ts";
import { countImporters, importersOf } from "../fanIn.ts";
import { buildGraph } from "../migrate/importGraph.ts";
import { renderNext } from "../render/next.ts";
import { readSuppressions, type Suppression } from "../suppressionsFile.ts";
import { readSources } from "../util/sources.ts";

export type NextOptions = {
  cwd: string;
  json: boolean;
  /** Read every source file to count importers. Off by default — it is the cost of `migrate`. */
  fanIn: boolean;
};

const gatherImporters = async (cwd: string, entries: readonly Suppression[]): Promise<Record<string, number>> => {
  const sources = await readSources(cwd, await listSourcePaths(cwd));
  return importersOf(
    countImporters(buildGraph(sources)),
    entries.map((entry) => entry.file),
  );
};

export const runNext = async (options: NextOptions): Promise<string> => {
  const entries = await readSuppressions(options.cwd);
  const importers = options.fanIn ? await gatherImporters(options.cwd, entries) : {};
  const plan = buildDrainPlan(entries, importers);
  return options.json ? JSON.stringify(plan, null, 2) : renderNext(plan);
};
