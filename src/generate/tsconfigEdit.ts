/**
 * A tsconfig is very often JSONC — comments, trailing commas — so parsing and re-serialising it
 * would silently delete the reasons somebody wrote down. This inserts lines after the
 * `"compilerOptions": {` anchor instead, leaving every other byte alone, and returns null rather
 * than guessing when the anchor is not there.
 */
import type { StrictnessFlag } from "../probe/effectiveTsconfig.ts";

const ANCHOR = /("compilerOptions"\s*:\s*\{)/;

export const addCompilerOptions = (source: string, flags: readonly StrictnessFlag[], comment: string): string | null => {
  // A flag the file already mentions is left exactly as it is, even when it is set the permissive
  // way. Overwriting a decision somebody wrote down is not this command's job; reporting it as
  // still missing is.
  const wanted = flags.filter((flag) => !source.includes(`"${flag.name}"`));
  if (wanted.length === 0) return null;
  if (!ANCHOR.test(source)) return null;

  const indent = innerIndent(source);
  const lines = [`${indent}// ${comment}`, ...wanted.map((flag) => `${indent}"${flag.name}": ${String(flag.value)},`)].join("\n");
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
