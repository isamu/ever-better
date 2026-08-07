import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { exec } from "./util/exec.ts";
import { countLines } from "./util/lines.ts";
import type { PackageJson, RepoFacts, SourceFile, WorkflowFile } from "./types.ts";

const SOURCE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "mts",
  "cts",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "vue",
  "svelte",
  "astro",
]);

const IGNORED_SEGMENTS = new Set(["node_modules", "dist", "build", "out", "coverage", ".git"]);

// Tooling config is not source. Counting it made a repo with one TypeScript file and one
// `eslint.config.js` report as 50% TypeScript, which reads as a half-finished migration.
const CONFIG_FILE_PATTERN = /(^|\/)([^/]*\.config\.[cm]?[jt]s|\.[^/]+rc\.[cm]?[jt]s)$/;

const WORKFLOW_DIR = ".github/workflows";

const isIgnored = (relativePath: string): boolean =>
  relativePath.split("/").some((segment) => IGNORED_SEGMENTS.has(segment));

const extensionOf = (relativePath: string): string =>
  path.extname(relativePath).slice(1).toLowerCase();

/**
 * `git ls-files -co --exclude-standard` is the whole gitignore engine for free: tracked files plus
 * untracked ones git would keep, minus everything ignored. Hand-rolling that produced a source
 * count that included every build artifact.
 */
const listGitFiles = async (cwd: string): Promise<string[] | null> => {
  try {
    const result = await exec("git", ["ls-files", "-z", "-co", "--exclude-standard"], cwd);
    if (result.code !== 0) return null;
    return result.stdout.split("\0").filter((entry) => entry.length > 0);
  } catch {
    return null;
  }
};

const walkFiles = async (cwd: string, relativeDir: string): Promise<string[]> => {
  const entries = await readdir(path.join(cwd, relativeDir), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (isIgnored(relativePath)) return [];
      if (entry.isDirectory()) return walkFiles(cwd, relativePath);
      return entry.isFile() ? [relativePath] : [];
    }),
  );
  return nested.flat();
};

const listFiles = async (cwd: string): Promise<string[]> => {
  const tracked = await listGitFiles(cwd);
  const all = tracked ?? (await walkFiles(cwd, ""));
  return all.filter((relativePath) => !isIgnored(relativePath));
};

const readPackageJson = async (cwd: string): Promise<PackageJson | null> => {
  try {
    const text = await readFile(path.join(cwd, "package.json"), "utf8");
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

const toSourceFile = async (cwd: string, relativePath: string): Promise<SourceFile> => ({
  path: relativePath,
  ext: extensionOf(relativePath),
  lines: await countLines(path.join(cwd, relativePath)),
});

const readWorkflows = async (cwd: string, files: readonly string[]): Promise<WorkflowFile[]> => {
  const workflowPaths = files.filter(
    (file) => file.startsWith(`${WORKFLOW_DIR}/`) && /\.ya?ml$/.test(file),
  );
  return Promise.all(
    workflowPaths.map(async (relativePath) => ({
      path: relativePath,
      content: await readFile(path.join(cwd, relativePath), "utf8"),
    })),
  );
};

const rootEntriesOf = (files: readonly string[]): string[] =>
  files.filter((file) => !file.includes("/"));

/** The only function in the codebase that touches the filesystem for detection purposes. */
export const gatherFacts = async (cwd: string): Promise<RepoFacts> => {
  const files = await listFiles(cwd);
  const sourcePaths = files.filter(
    (file) => SOURCE_EXTENSIONS.has(extensionOf(file)) && !CONFIG_FILE_PATTERN.test(file),
  );
  return {
    cwd,
    rootEntries: rootEntriesOf(files),
    packageJson: await readPackageJson(cwd),
    sourceFiles: await Promise.all(sourcePaths.map((file) => toSourceFile(cwd, file))),
    workflows: await readWorkflows(cwd, files),
  };
};

export const isRepository = async (cwd: string): Promise<boolean> => {
  try {
    return (await stat(cwd)).isDirectory();
  } catch {
    return false;
  }
};
