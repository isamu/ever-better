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

const trimTrailingSpace = (text: string): string => {
  let end = text.length;
  while (end > 0 && /\s/.test(text[end - 1] ?? "")) end -= 1;
  return text.slice(0, end);
};

export const appendConfigBlocks = (source: string, blocks: readonly string[]): string | null => {
  if (blocks.length === 0) return null;
  const cutAt = findClosersStart(source);
  if (cutAt < 0) return null;
  const head = trimTrailingSpace(source.slice(0, cutAt));
  const separator = head.endsWith(",") ? "" : ",";
  return `${head}${separator}\n${blocks.join("\n")}\n${source.slice(cutAt)}`;
};

export type RuleEntry = {
  name: string;
  setting: string;
};

export const renderRuleBlock = (
  entries: readonly RuleEntry[],
  comment: readonly string[],
): string[] => [
  "  {",
  ...comment.map((line) => `    // ${line}`),
  "    rules: {",
  ...entries.map((entry) => `      "${entry.name}": ${entry.setting},`),
  "    },",
  "  },",
];
