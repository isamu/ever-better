/**
 * Appends rule blocks to a flat config the repo already wrote.
 *
 * Flat config is an array and later entries win, so appending is semantically well defined. The
 * textual insertion point is the risk: a config may end `];`, `);` or `]);` depending on whether
 * it was written by hand, by `tseslint.config()` or by `defineConfig()`. This finds the final
 * closer and returns null rather than guessing when it cannot — the caller keeps a backup and
 * verifies the result by loading it, so a bad edit is caught rather than shipped.
 */
const CLOSER = /([\])])\s*;?\s*$/;

export const appendConfigBlocks = (source: string, blocks: readonly string[]): string | null => {
  if (blocks.length === 0) return null;
  const match = CLOSER.exec(source);
  if (!match) return null;
  const cutAt = source.lastIndexOf(match[1] ?? "");
  if (cutAt < 0) return null;
  const head = source.slice(0, cutAt).replace(/\s*$/, "");
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
