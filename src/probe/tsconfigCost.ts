import { rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { exec } from "../util/exec.ts";
import { STRICTNESS_FLAGS } from "./effectiveTsconfig.ts";

export type FlagCost = {
  flag: string;
  /** Type errors the flag introduces. Null when tsc could not be run at all. */
  errors: number | null;
};

const PROBE_CONFIG = "tsconfig.ever-better-probe.json";

const countErrors = (output: string): number =>
  output.split("\n").filter((line) => line.includes("error TS")).length;

/**
 * `--pretty false` is not optional. tsc colours its output by default, which puts escape codes
 * between "error" and "TS1234" — so counting them without it silently returns zero, and a flag
 * with six errors is reported as free. That happened here before it was caught.
 */
export const measureFlagCost = async (cwd: string, flag: string): Promise<number | null> => {
  const configPath = path.join(cwd, PROBE_CONFIG);
  const tsc = path.join(cwd, "node_modules", "typescript", "bin", "tsc");
  try {
    // Extending the real config is what makes this a measurement rather than a guess: a flag
    // passed on the command line resolves differently from the same flag in the project.
    await writeFile(
      configPath,
      `${JSON.stringify({ extends: "./tsconfig.json", compilerOptions: { [flag]: true } }, null, 2)}\n`,
      "utf8",
    );
    const result = await exec(
      process.execPath,
      [tsc, "--noEmit", "--pretty", "false", "-p", PROBE_CONFIG],
      cwd,
    );
    return countErrors(`${result.stdout}\n${result.stderr}`);
  } catch {
    return null;
  } finally {
    await rm(configPath, { force: true });
  }
};

/** Prices every strictness flag that is currently off. Sequential — tsc is not cheap. */
export const measureStrictnessCosts = async (
  cwd: string,
  offFlags: readonly string[],
): Promise<FlagCost[]> => {
  const costs: FlagCost[] = [];
  for (const flag of offFlags) {
    costs.push({ flag, errors: await measureFlagCost(cwd, flag) });
  }
  return costs;
};

export const allStrictnessFlags = (): string[] => STRICTNESS_FLAGS.map((flag) => flag.name);

/**
 * Only the free ones are applied. A strictness flag that costs anything breaks `typecheck` the
 * moment it is written, and type errors have NO suppression mechanism — `--suppress-all` cannot
 * touch them, so there is nothing to grandfather the damage with.
 */
export const freeFlags = (costs: readonly FlagCost[]): string[] =>
  costs.filter((cost) => cost.errors === 0).map((cost) => cost.flag);

export const pricedFlags = (costs: readonly FlagCost[]): FlagCost[] =>
  costs.filter((cost) => cost.errors !== null && cost.errors > 0);
