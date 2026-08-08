import type { PackageJson, SourceFile } from "../types.ts";

const SOURCE_DIRS = ["src", "server", "lib", "app", "common"];
const TEST_DIRS = ["test", "tests", "__tests__", "spec"];
const ENTRY_NAMES = ["index", "main", "cli"];

const PROJECT_EXTENSIONS = ["ts", "tsx", "js", "jsx", "vue", "svelte"];

const dirsPresent = (sourceFiles: readonly SourceFile[], candidates: readonly string[]): string[] =>
  candidates.filter((dir) => sourceFiles.some((file) => file.path.startsWith(`${dir}/`)));

const exists = (sourceFiles: readonly SourceFile[], path: string): boolean => sourceFiles.some((file) => file.path === path);

/**
 * Only patterns that match something. knip prints a configuration hint for every entry glob that
 * matches nothing, so a speculative config greets the owner with five complaints on the first run
 * — and a tool whose first output is noise about itself does not get read again.
 */
const entryPoints = (packageJson: PackageJson | null, sourceFiles: readonly SourceFile[]): string[] => {
  const declared = [...Object.values(packageJson?.bin ?? {}), ...(packageJson?.main === undefined ? [] : [packageJson.main])];
  const conventional = dirsPresent(sourceFiles, SOURCE_DIRS).flatMap((dir) =>
    ENTRY_NAMES.map((name) => `${dir}/${name}.ts`).filter((path) => exists(sourceFiles, path)),
  );
  const tests = dirsPresent(sourceFiles, TEST_DIRS).map((dir) => `${dir}/**/*.{ts,tsx,js,jsx}`);
  const scripts = sourceFiles.some((file) => file.path.startsWith("scripts/")) ? ["scripts/**/*.{ts,mjs,js}"] : [];
  return [...new Set([...declared, ...conventional, ...tests, ...scripts])];
};

/**
 * Registering `.vue` without a compiler is another hint knip prints, so only list extensions that
 * are actually there. A one-element brace expansion — `*.{ts}` — matches nothing in knip's glob
 * engine, so a single extension has to be written plainly.
 */
const projectPatterns = (sourceFiles: readonly SourceFile[]): string[] => {
  const present = PROJECT_EXTENSIONS.filter((ext) => sourceFiles.some((file) => file.ext === ext));
  const extensions = present.length > 0 ? present : ["ts"];
  const suffix = extensions.length === 1 ? extensions[0] : `{${extensions.join(",")}}`;
  const dirs = dirsPresent(sourceFiles, SOURCE_DIRS);
  return (dirs.length > 0 ? dirs : ["src"]).map((dir) => `${dir}/**/*.${suffix}`);
};

/**
 * Every rule is `warn`, which is what keeps the exit code at zero. knip reports the whole
 * inventory and has no base-branch diffing, so it can never say what THIS pull request orphaned —
 * and a check that fails on something the author did not write teaches a team to reach for ignore
 * comments.
 *
 * Missing an entry point is the other way knip becomes untrustworthy: a helper called only from a
 * spec gets reported as unused, the report fills with false positives, and people stop reading it.
 */
export const renderKnipConfig = (packageJson: PackageJson | null, sourceFiles: readonly SourceFile[]): string => {
  const entry = entryPoints(packageJson, sourceFiles);
  const config = {
    $schema: "https://unpkg.com/knip@6/schema.json",
    entry: entry.length > 0 ? entry : ["src/index.ts"],
    project: projectPatterns(sourceFiles),
    rules: {
      exports: "warn",
      types: "warn",
      files: "warn",
      dependencies: "warn",
      devDependencies: "warn",
      unlisted: "warn",
      binaries: "warn",
    },
  };
  return `${JSON.stringify(config, null, 2)}\n`;
};
