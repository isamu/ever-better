import type { PackageJson } from "../types.ts";

const MANIFEST_SUFFIX = "/package.json";

/** Yarn and npm take the array; the `{ packages }` shape is pnpm's, mirrored here by some repos. */
export const workspacePatterns = (packageJson: PackageJson | null): string[] => {
  const field = packageJson?.workspaces;
  const listed = Array.isArray(field) ? field : field?.packages;
  return (listed ?? []).filter((entry) => typeof entry === "string");
};

/** `*` spans one path segment and `**` any number, which is the whole vocabulary this field uses. */
const patternToRegExp = (pattern: string): RegExp => {
  const source = pattern
    .split("/")
    .map((segment) => (segment === "**" ? "(?:[^/]+/)*[^/]+" : segment.replace(/[.+^${}()|[\]\\?]/g, "\\$&").replace(/\*/g, "[^/]+")))
    .join("/");
  return new RegExp(`^${source}$`);
};

const matchesAny = (patterns: readonly RegExp[], dir: string): boolean => patterns.some((pattern) => pattern.test(dir));

/**
 * Discovered from the manifests that are actually present rather than from the filesystem: the file
 * list is already in hand, and a pattern matching no package selects nothing, which is what makes a
 * stale `workspaces` entry harmless.
 */
export const workspaceDirs = (packageJson: PackageJson | null, files: readonly string[]): string[] => {
  const patterns = workspacePatterns(packageJson);
  const included = patterns.filter((pattern) => !pattern.startsWith("!")).map(patternToRegExp);
  const excluded = patterns.filter((pattern) => pattern.startsWith("!")).map((pattern) => patternToRegExp(pattern.slice(1)));
  const dirs = files.filter((file) => file.endsWith(MANIFEST_SUFFIX)).map((file) => file.slice(0, -MANIFEST_SUFFIX.length));
  return dirs.filter((dir) => matchesAny(included, dir) && !matchesAny(excluded, dir));
};

/**
 * Bare names of the files directly inside a workspace. The root of a workspaces monorepo holds no
 * tsconfig and no ESLint config, so asking only the root reported the inverse of what the
 * repository is — presence is a question about the repository, not about one directory.
 */
export const workspaceEntries = (dirs: readonly string[], files: readonly string[]): string[] => {
  const isWorkspace = new Set(dirs);
  const names = files.flatMap((file) => {
    const cut = file.lastIndexOf("/");
    return cut > 0 && isWorkspace.has(file.slice(0, cut)) ? [file.slice(cut + 1)] : [];
  });
  return [...new Set(names)];
};
