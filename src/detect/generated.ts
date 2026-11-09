import path from "node:path";

const OUT_DIR = /"outDir"\s*:\s*"([^"]+)"/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;

/**
 * Read out of the text rather than out of `JSON.parse`, because a tsconfig is very often JSONC —
 * and a commented-out `outDir` names no directory, which is the one direction that must not be read
 * wrong: excluding a directory that is really source hides the code this tool exists to measure.
 */
export const declaredOutDir = (tsconfigText: string): string | null =>
  OUT_DIR.exec(tsconfigText.replace(BLOCK_COMMENT, "").replace(LINE_COMMENT, ""))?.[1] ?? null;

export type TsconfigText = {
  /** Repo-relative directory holding the config, `""` for the root. */
  dir: string;
  text: string;
};

/**
 * Where the compiler writes. A repository that commits its output — graphai keeps `lib/` in git —
 * otherwise counts the generated copy of every file beside the file, so the census reports a
 * TypeScript repo as part JavaScript and puts emitted code in the split backlog.
 *
 * An `outDir` resolving to the repository root is dropped: a project compiling in place would
 * otherwise mark every file generated.
 */
/** `join` leaves `"./"` as `"./"`, which the root check below has to see as the root. */
const withoutTrailingSlash = (dir: string): string => (dir.endsWith("/") ? dir.slice(0, -1) : dir);

export const generatedDirs = (configs: readonly TsconfigText[]): string[] => {
  const dirs = configs.flatMap((config) => {
    const outDir = declaredOutDir(config.text);
    return outDir === null ? [] : [withoutTrailingSlash(path.posix.join(config.dir, outDir))];
  });
  return [...new Set(dirs.filter((dir) => dir !== "" && dir !== "." && !dir.startsWith("..")))];
};

export const isGenerated = (dirs: readonly string[], file: string): boolean => dirs.some((dir) => file.startsWith(`${dir}/`));
