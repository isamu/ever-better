import { COMMAND_SEPARATOR, runsTool } from "./commandText.ts";
import type { PackageJson } from "../types.ts";

export type ScriptJob = "lint" | "typecheck";

/** `tsc` that emits is the build step; only `--noEmit` makes it the typecheck gate. */
const EMITS_NOTHING = /--noEmit\b/i;

const PERFORMS: Record<ScriptJob, (command: string) => boolean> = {
  lint: (command) => runsTool(command, "eslint"),
  typecheck: (command) => runsTool(command, "tsc") && EMITS_NOTHING.test(command),
};

const performs = (command: string, job: ScriptJob): boolean => command.split(COMMAND_SEPARATOR).some((part) => PERFORMS[job](part));

/**
 * The script that performs a job, which is not always the script named after it: a repo whose lint
 * script is called `eslint` has the gate, and asking only for the name reported it as having none.
 * That is the expensive direction — a reader then adds a second lint step to a workflow that
 * already has one, or a `lint` script beside the one it duplicates.
 *
 * The conventional name still wins when something carries it, because that is the name CI and
 * every other tool will look for.
 */
export const scriptNameFor = (packageJson: PackageJson | null, job: ScriptJob): string | null => {
  const entries = Object.entries(packageJson?.scripts ?? {});
  const named = entries.find(([name]) => name === job || name.startsWith(`${job}:`));
  return named?.[0] ?? entries.find(([, command]) => performs(command, job))?.[0] ?? null;
};
