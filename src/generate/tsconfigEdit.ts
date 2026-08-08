/**
 * A tsconfig is very often JSONC — comments, trailing commas — so parsing and re-serialising it
 * would silently delete the reasons somebody wrote down. This inserts lines after the
 * `"compilerOptions": {` anchor instead, leaving every other byte alone, and returns null rather
 * than guessing when the anchor is not there.
 */
const ANCHOR = /("compilerOptions"\s*:\s*\{)/;

export const addCompilerOptions = (source: string, flags: readonly string[], comment: string): string | null => {
  const wanted = flags.filter((flag) => !source.includes(`"${flag}"`));
  if (wanted.length === 0) return null;
  if (!ANCHOR.test(source)) return null;

  const indent = innerIndent(source);
  const lines = [`${indent}// ${comment}`, ...wanted.map((flag) => `${indent}"${flag}": true,`)].join("\n");
  return source.replace(ANCHOR, `$1\n${lines}`);
};

/**
 * The indentation INSIDE `compilerOptions`, which is one level deeper than the key itself. Taking
 * the first indented line in the file instead finds the outer level, and the inserted flags then
 * sit a level short of everything around them.
 *
 * Bounded to eight characters: `\s+` before a quote backtracks super-linearly on a pathological
 * file.
 */
const innerIndent = (source: string): string => {
  const match = /\n([ \t]{0,8})"compilerOptions"/.exec(source);
  const outer = match?.[1] ?? "  ";
  return outer + (outer.length > 0 ? outer : "  ");
};
