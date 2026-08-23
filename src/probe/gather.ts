import path from "node:path";
import { printConfig } from "../eslintRunner.ts";
import { exec } from "../util/exec.ts";
import type { PrintedConfig } from "./effectiveRules.ts";
import { projectForSample, referencePaths, type ShownConfig } from "./effectiveTsconfig.ts";
import type { SourceFile } from "../types.ts";

export type Probes = {
  rules: PrintedConfig | null;
  tsconfig: ShownConfig | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

const parseObject = (text: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Which file to ask about. Rules are configured per glob, so the answer for a `.d.ts`, a spec or a
 * config file says nothing about the code — prefer TypeScript under a source path, because that is
 * where the type-aware rules apply at all.
 */
export const sampleSourceFile = (sourceFiles: readonly SourceFile[]): SourceFile | null => {
  const candidates = sourceFiles.filter((file) => !file.path.endsWith(".d.ts") && !file.path.includes("test"));
  const typed = candidates.filter((file) => file.ext === "ts" || file.ext === "tsx");
  return typed[0] ?? candidates[0] ?? sourceFiles[0] ?? null;
};

/** `--showConfig` resolves every `extends` first, so it reports what the compiler will really use. */
const showConfig = async (cwd: string, project: string | null): Promise<ShownConfig | null> => {
  const entry = path.join(cwd, "node_modules", "typescript", "bin", "tsc");
  try {
    const args = project === null ? ["--showConfig"] : ["--showConfig", "-p", project];
    const result = await exec(process.execPath, [entry, ...args], cwd);
    return result.code === 0 ? parseObject(result.stdout) : null;
  } catch {
    return null;
  }
};

/** How deep a chain of solution-style configs is worth following before calling it a loop. */
const MAX_REFERENCE_DEPTH = 8;

/** A project that compiles something. A solution-style config lists references and no files. */
const compilesSomething = (project: ShownConfig): boolean => (project.files ?? []).length > 0;

/**
 * References can point at further solution-style configs — one level of following lands on another
 * config with no options and reports every strictness flag absent all over again. `seen` guards a
 * cycle; the depth cap guards a chain nobody meant to write.
 */
const collectProjects = async (cwd: string, shown: ShownConfig, seen: Set<string>, depth: number): Promise<ShownConfig[]> => {
  const here = compilesSomething(shown) ? [shown] : [];
  if (depth >= MAX_REFERENCE_DEPTH) return here;
  const next = referencePaths(shown).filter((reference) => !seen.has(reference));
  next.forEach((reference) => seen.add(reference));
  const resolved = await Promise.all(next.map((reference) => showConfig(cwd, reference)));
  const nested = await Promise.all(
    resolved.filter((project): project is ShownConfig => project !== null).map((project) => collectProjects(cwd, project, seen, depth + 1)),
  );
  return [...here, ...nested.flat()];
};

/**
 * A solution-style root — `{ "files": [], "references": [...] }`, which is what the Vite scaffold
 * writes — resolves to an empty `compilerOptions`, so asking it about strictness reports every
 * flag off while the referenced projects have them on. Follow the references and answer from the
 * project that actually compiles the code.
 *
 * When nothing resolves — every reference missing, or a chain of solutions with no leaf — the
 * answer is null rather than the root. Answering from a config that holds no options is exactly
 * the false report this exists to remove, and `diagnose` treats null as "no finding", which is the
 * safe direction: a missing gap is noise, a wrong one is an instruction to change something that
 * is already correct.
 *
 * `--showConfig` does no type checking, so one spawn per reference is cheap and they run together.
 */
const probeTsconfig = async (cwd: string, samplePath: string | null): Promise<ShownConfig | null> => {
  const root = await showConfig(cwd, null);
  if (root === null || referencePaths(root).length === 0) return root;
  const projects = await collectProjects(cwd, root, new Set(), 0);
  return projects.length === 0 ? null : projectForSample(projects, samplePath);
};

/** Both probes shell out, both tolerate absence, and neither is fatal. */
export const gatherProbes = async (cwd: string, sourceFiles: readonly SourceFile[]): Promise<Probes> => {
  const sample = sampleSourceFile(sourceFiles);
  return {
    rules: sample ? await printConfig(cwd, sample.path) : null,
    tsconfig: await probeTsconfig(cwd, sample?.path ?? null),
  };
};
