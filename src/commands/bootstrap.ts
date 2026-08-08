import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  describeAction,
  planBootstrap,
  PRETTIER_IGNORE_FILE,
  type BootstrapAction,
} from "../bootstrapPlan.ts";
import { installCommand } from "../detect/packageManager.ts";
import { diagnose } from "../diagnose.ts";
import { gatherFacts } from "../facts.ts";
import { headCommit } from "../git.ts";
import { writeQualityFile } from "../qualityFile.ts";
import { emptyState, readState, withDiagnosis, withPhase, writeState } from "../state.ts";
import { applyStrictness } from "./strictness.ts";
import { exec } from "../util/exec.ts";
import type { PackageManager } from "../types.ts";

export type BootstrapOptions = {
  cwd: string;
  dryRun: boolean;
  nodeVersion: string;
};

const readIfPresent = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

const writeGeneratedFile = async (cwd: string, relativePath: string, contents: string) => {
  const target = path.join(cwd, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
};

const addScripts = async (
  cwd: string,
  scripts: Readonly<Record<string, string>>,
): Promise<void> => {
  const target = path.join(cwd, "package.json");
  const text = await readFile(target, "utf8");
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null)
    throw new Error("package.json is not an object");
  const existing = "scripts" in parsed && typeof parsed.scripts === "object" ? parsed.scripts : {};
  const updated = { ...parsed, scripts: { ...existing, ...scripts } };
  await writeFile(target, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
};

const runInstall = async (
  cwd: string,
  manager: PackageManager,
  packages: readonly string[],
): Promise<void> => {
  const command = installCommand(manager, packages).split(" ");
  const [binary, ...args] = command;
  if (!binary) throw new Error("empty install command");
  // Every package manager is a `.cmd` shim on Windows, which Node refuses to spawn directly.
  // Package names and flags contain nothing a shell would reinterpret, so this is safe here.
  const result = await exec(binary, args, cwd, { shell: process.platform === "win32" });
  if (result.code !== 0) {
    throw new Error(`install failed (${result.code}):\n${result.stderr.slice(0, 4000)}`);
  }
};

const applyAction = async (
  cwd: string,
  manager: PackageManager,
  action: BootstrapAction,
): Promise<void> => {
  if (action.kind === "install") return runInstall(cwd, manager, action.packages);
  if (action.kind === "addScripts") return addScripts(cwd, action.scripts);
  return writeGeneratedFile(cwd, action.path, action.contents);
};

export const runBootstrap = async (options: BootstrapOptions): Promise<string> => {
  const facts = await gatherFacts(options.cwd);
  const diagnosis = diagnose(facts);
  const actions = planBootstrap({
    diagnosis,
    packageJson: facts.packageJson,
    rootEntries: facts.rootEntries,
    allFiles: facts.allFiles,
    sourceFiles: facts.sourceFiles,
    nodeVersion: options.nodeVersion,
    prettierIgnore: await readIfPresent(path.join(options.cwd, PRETTIER_IGNORE_FILE)),
  });

  const lines = actions.map((action) => `  ${describeAction(action)}`);
  if (options.dryRun) {
    const preview =
      actions.length === 0 ? ["Nothing to install or generate."] : ["Would apply:", ...lines];
    return [
      ...preview,
      "",
      "Strictness is measured on a real run.",
      "Re-run without --dry-run.",
    ].join("\n");
  }

  for (const action of actions) {
    await applyAction(options.cwd, diagnosis.packageManager, action);
  }

  // After the plan, not before: TypeScript may only have just been installed, and there is
  // nothing to measure against until it is.
  const strictness = await applyStrictness(options.cwd, facts.sourceFiles);

  const after = diagnose(await gatherFacts(options.cwd));
  const previous = (await readState(options.cwd)) ?? emptyState();
  const state = withPhase(withDiagnosis(previous, after, await headCommit(options.cwd)), "freeze");
  await writeState(options.cwd, state);
  await writeQualityFile(options.cwd, state);

  // Reported even when the plan was empty. A repo that already has every tool is the common case
  // for an existing codebase, and returning early there skipped the tightening entirely.
  return [
    actions.length === 0 ? "Nothing to install or generate." : "Applied:",
    ...lines,
    "",
    strictness.message,
    "",
    "Next: `ever-better freeze` to pin the baseline.",
  ].join("\n");
};
