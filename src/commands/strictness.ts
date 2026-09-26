import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { addCompilerOptions } from "../generate/tsconfigEdit.ts";
import { findMissingStrictness, isStrictOff } from "../probe/effectiveTsconfig.ts";
import { gatherProbes } from "../probe/gather.ts";
import { measureStrictnessCosts } from "../probe/tsconfigCost.ts";
import { strictnessReport, type StrictnessResult } from "../strictnessReport.ts";
import type { SourceFile } from "../types.ts";

const TSCONFIG = "tsconfig.json";

const COMMENT = "Enabled by ever-better after measuring each at zero new type errors.";

/**
 * Turns on the strictness flags that cost nothing, and reports the price of the ones that do.
 *
 * The asymmetry with lint rules is the whole reason this is measured rather than just applied:
 * `--suppress-all` grandfathers lint violations, and there is no equivalent for type errors. A
 * flag that costs 500 errors would leave the owner with a `typecheck` script that fails and no way
 * to stage the work.
 */
export const applyStrictness = async (cwd: string, sourceFiles: readonly SourceFile[]): Promise<StrictnessResult> => {
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

  const report = strictnessReport(await measureStrictnessCosts(cwd, off));

  if (report.applied.length > 0) {
    const configPath = path.join(cwd, TSCONFIG);
    const updated = addCompilerOptions(await readFile(configPath, "utf8"), report.applied, COMMENT);
    if (updated) await writeFile(configPath, updated, "utf8");
  }

  return report;
};
