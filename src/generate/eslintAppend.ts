import { withoutComments } from "./configText.ts";

/**
 * Appends rule blocks to a flat config the repo already wrote.
 *
 * Flat config is an array and later entries win, so appending is semantically well defined. The
 * textual insertion point is the risk: a config may end `];`, `);` or `]);` depending on whether
 * it was written by hand, by `tseslint.config()` or by `defineConfig()`. This finds the final
 * closer and returns null rather than guessing when it cannot — the caller keeps a backup and
 * verifies the result by loading it, so a bad edit is caught rather than shipped.
 */
// The whole trailing run of closers, because the INNERMOST one closes the config list. Taking the
// last instead puts the appended block outside the array — for `defineConfig([...])` that makes it
// a second argument, which is silently not a config at all.
const CLOSER_CHARS = new Set(["]", ")"]);

/** Index of the innermost closer in the trailing run, or -1 when the file does not end in one. */
const findClosersStart = (source: string): number => {
  let end = source.length;
  while (end > 0 && /\s/.test(source[end - 1] ?? "")) end -= 1;
  if (source[end - 1] === ";") end -= 1;
  while (end > 0 && /\s/.test(source[end - 1] ?? "")) end -= 1;

  let start = end;
  while (start > 0 && CLOSER_CHARS.has(source[start - 1] ?? "")) start -= 1;
  return start === end ? -1 : start;
};

/** A comma is only unnecessary after one of these; anything else is the end of an entry. */
const NO_COMMA_AFTER = new Set([",", "[", "("]);

/**
 * Where the last actual ENTRY ends, comments not counted. Appending the separating comma to the end
 * of the text instead put it after a trailing comment — inside a `//` one by luck, and outside a
 * `/* … *\/` one, where it becomes a hole in the config array and ESLint refuses to load the file.
 */
const entryEnd = (source: string, cutAt: number): number => withoutComments(source).slice(0, cutAt).trimEnd().length;

export const appendConfigBlocks = (source: string, blocks: readonly string[]): string | null => {
  if (blocks.length === 0) return null;
  const cutAt = findClosersStart(source);
  if (cutAt < 0) return null;
  const at = entryEnd(source, cutAt);
  const separator = at === 0 || NO_COMMA_AFTER.has(source[at - 1] ?? "") ? "" : ",";
  const trailing = source.slice(at, cutAt).trimEnd();
  return `${source.slice(0, at)}${separator}${trailing}\n${blocks.join("\n")}\n${source.slice(cutAt)}`;
};

export type RuleEntry = {
  name: string;
  setting: string;
};

export const renderRuleBlock = (entries: readonly RuleEntry[], comment: readonly string[]): string[] => [
  "  {",
  ...comment.map((line) => `    // ${line}`),
  "    rules: {",
  ...entries.map((entry) => `      "${entry.name}": ${entry.setting},`),
  "    },",
  "  },",
];
