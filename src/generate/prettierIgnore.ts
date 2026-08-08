/**
 * Everything ever-better writes is machine-generated, and Prettier disagrees with all of it:
 * `JSON.stringify(…, null, 2)` always expands arrays that Prettier would collapse. Without these
 * lines the very first `diagnose --write` turns `format:check` red in CI, on a file the developer
 * never touched.
 */
const GENERATED_PATHS = [".ever-better/", "QUALITY.md", "eslint-suppressions.json"];

const HEADER = "# Written by ever-better; machine-generated, so Prettier must not police it.";

export const renderPrettierIgnore = (): string =>
  ["dist/", "build/", "coverage/", "", HEADER, ...GENERATED_PATHS, ""].join("\n");

/**
 * `.prettierignore` is line-based, so appending is well-defined in a way that editing someone's
 * config file is not. Returns null when the paths are already covered.
 */
export const appendGeneratedPaths = (existing: string): string | null => {
  const missing = GENERATED_PATHS.filter((entry) => !existing.includes(entry));
  if (missing.length === 0) return null;
  const separator = existing.endsWith("\n") ? "" : "\n";
  return `${existing}${separator}\n${HEADER}\n${missing.join("\n")}\n`;
};
