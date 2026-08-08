import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { addCompilerOptions } from "../generate/tsconfigEdit.ts";
import { findMissingStrictness, isStrictOff } from "../probe/effectiveTsconfig.ts";
import { gatherProbes } from "../probe/gather.ts";
import {
  freeFlags,
  measureStrictnessCosts,
  pricedFlags,
  type FlagCost,
} from "../probe/tsconfigCost.ts";
import type { SourceFile } from "../types.ts";

export type StrictnessResult = {
  applied: string[];
  priced: FlagCost[];
  message: string;
};

const TSCONFIG = "tsconfig.json";

const COMMENT = "Enabled by ever-better after measuring each at zero new type errors.";

const describePriced = (priced: readonly FlagCost[]): string[] =>
  priced.map((cost) => `  ${cost.flag}: ${cost.errors ?? "?"} type errors — left off`);

/**
 * Turns on the strictness flags that cost nothing, and reports the price of the ones that do.
 *
 * The asymmetry with lint rules is the whole reason this is measured rather than just applied:
 * `--suppress-all` grandfathers lint violations, and there is no equivalent for type errors. A
 * flag that costs 500 errors would leave the owner with a `typecheck` script that fails and no way
 * to stage the work.
 */
export const applyStrictness = async (
  cwd: string,
  sourceFiles: readonly SourceFile[],
): Promise<StrictnessResult> => {
  const probes = await gatherProbes(cwd, sourceFiles);
  if (!probes.tsconfig) {
    return { applied: [], priced: [], message: "No TypeScript config to tighten." };
  }
  if (isStrictOff(probes.tsconfig)) {
    return {
      applied: [],
      priced: [],
      message: "`strict` itself is off — turn that on first; everything else is moot until then.",
    };
  }

  const off = findMissingStrictness(probes.tsconfig).map((entry) => entry.flag.name);
  if (off.length === 0) return { applied: [], priced: [], message: "Strictness already maximal." };

  const costs = await measureStrictnessCosts(cwd, off);
  const free = freeFlags(costs);
  const priced = pricedFlags(costs);

  if (free.length > 0) {
    const configPath = path.join(cwd, TSCONFIG);
    const updated = addCompilerOptions(await readFile(configPath, "utf8"), free, COMMENT);
    if (updated) await writeFile(configPath, updated, "utf8");
  }

  const lines = [
    free.length > 0 ? `Enabled at zero cost: ${free.join(", ")}` : "Nothing was free to enable.",
    ...(priced.length > 0 ? ["Priced and left off — each is a task, not a flag flip:"] : []),
    ...describePriced(priced),
  ];
  return { applied: free, priced, message: lines.join("\n") };
};
