import { readdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { gatherFacts } from "../facts.ts";
import { renderJsTsconfig } from "../generate/tsconfigJs.ts";
import { buildGraph } from "../migrate/importGraph.ts";
import { migratedName, planMigration } from "../migrate/order.ts";
import { exec } from "../util/exec.ts";
import type { SourceFile } from "../types.ts";

export type MigrateOptions = {
  cwd: string;
  /** One file to rename, or none to print the plan. */
  file: string | null;
};

const JS_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs"]);

const NEXT_SHOWN = 10;

const javascriptFiles = (files: readonly SourceFile[]): SourceFile[] =>
  files.filter((file) => JS_EXTENSIONS.has(file.ext));

const countTypeErrors = async (cwd: string): Promise<number | null> => {
  const tsc = path.join(cwd, "node_modules", "typescript", "bin", "tsc");
  try {
    // `--pretty false`: tsc colours its output, and escape codes between "error" and "TS1234" make
    // a grep silently count zero.
    const result = await exec(process.execPath, [tsc, "--noEmit", "--pretty", "false"], cwd);
    const output = `${result.stdout}\n${result.stderr}`;
    return output.split("\n").filter((line) => line.includes("error TS")).length;
  } catch {
    return null;
  }
};

const ensureTsconfig = async (cwd: string, rootEntries: readonly string[]): Promise<string[]> => {
  if (rootEntries.includes("tsconfig.json")) return [];
  await writeFile(path.join(cwd, "tsconfig.json"), renderJsTsconfig(), "utf8");
  return ["Wrote tsconfig.json with allowJs and checkJs off — nothing is type-checked yet."];
};

const hasTypescript = async (cwd: string): Promise<boolean> =>
  readdir(path.join(cwd, "node_modules", "typescript"))
    .then(() => true)
    .catch(() => false);

const describePlan = (order: readonly string[], cycles: readonly string[][]): string[] => [
  `${order.length} JavaScript files, in dependency order:`,
  ...order
    .slice(0, NEXT_SHOWN)
    .map((file, index) => `  ${index + 1}. ${file} -> ${migratedName(file)}`),
  ...(order.length > NEXT_SHOWN ? [`  … and ${order.length - NEXT_SHOWN} more`] : []),
  ...(cycles.length > 0
    ? [
        "",
        `${cycles.length} import cycle(s). Nothing in one can go first, so each migrates as a unit:`,
        ...cycles.map((cycle) => `  ${cycle.join(" -> ")}`),
      ]
    : []),
];

/**
 * Renames one JavaScript file and reports what it cost.
 *
 * One file at a time is not caution, it is the only thing that works: type errors have no
 * suppression mechanism, so a big-bang rename leaves a repository whose `typecheck` fails with
 * nothing able to grandfather it. Dependencies go first — typing a file whose imports are still
 * JavaScript means typing it against `any`, and all of it has to be redone later.
 */
export const runMigrate = async (options: MigrateOptions): Promise<string> => {
  const facts = await gatherFacts(options.cwd);
  const javascript = javascriptFiles(facts.sourceFiles);
  if (javascript.length === 0) return "No JavaScript left to migrate.";

  const created = await ensureTsconfig(options.cwd, facts.rootEntries);
  const sources = new Map(
    await Promise.all(
      javascript.map(async (file): Promise<[string, string]> => [
        file.path,
        await readFile(path.join(options.cwd, file.path), "utf8").catch(() => ""),
      ]),
    ),
  );
  const { order, cycles } = planMigration(buildGraph(sources));

  if (options.file === null) {
    return [
      ...created,
      ...describePlan(order, cycles),
      "",
      `Next: ever-better migrate --file ${order[0] ?? ""}`,
    ].join("\n");
  }

  if (!sources.has(options.file)) return `${options.file} is not a JavaScript file in this repo.`;
  if (!(await hasTypescript(options.cwd))) {
    return "TypeScript is not installed here. Run `ever-better bootstrap` first.";
  }

  const before = await countTypeErrors(options.cwd);
  const target = migratedName(options.file);
  await rename(path.join(options.cwd, options.file), path.join(options.cwd, target));
  const after = await countTypeErrors(options.cwd);

  const cost = before !== null && after !== null ? after - before : null;
  return [
    `${options.file} -> ${target}`,
    cost === null
      ? "Could not run tsc to price it — check the result by hand."
      : `${cost} new type errors. They have no suppression mechanism, so fix them in this commit.`,
    cost === 0 ? "Nothing to fix. Commit and take the next file." : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
};
