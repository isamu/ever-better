/**
 * Arguments after `--` that may reach the repository's ESLint. A PERMITTED list, not a banned one:
 * most ESLint flags change what is counted — `--quiet` drops warnings, `--rule` and `--config`
 * change what is enforced, `--format` replaces the formatter the counts come from — and a banned
 * list is wrong the first time someone thinks of one more. An argument nobody listed is refused.
 *
 * `--cache` is deliberately absent: it skips files, and whether the per-file suppressed counts
 * survive that has not been measured.
 */
const CONCURRENCY = "--concurrency";

/** What ESLint documents: a thread count, `auto` to choose, `off` for none. */
const isConcurrencyValue = (value: string): boolean => /^[1-9]\d*$/.test(value) || value === "auto" || value === "off";

export type PassThrough = { ok: true; args: string[] } | { ok: false; message: string };

const refused = (message: string): PassThrough => ({
  ok: false,
  message: `${message}\nOnly ${CONCURRENCY}=<n|auto|off> may follow \`--\`: anything else could change what is counted.`,
});

type Split = { value: string | undefined; consumed: number };

/** `--concurrency=4` is one token, `--concurrency 4` is two. */
const splitConcurrency = (args: readonly string[], index: number): Split | null => {
  const arg = args[index] ?? "";
  if (arg.startsWith(`${CONCURRENCY}=`)) return { value: arg.slice(CONCURRENCY.length + 1), consumed: 1 };
  if (arg === CONCURRENCY) return { value: args[index + 1], consumed: 2 };
  return null;
};

export const parseEslintPassThrough = (args: readonly string[]): PassThrough => {
  if (args.length === 0) return { ok: true, args: [] };
  const split = splitConcurrency(args, 0);
  if (!split) return refused(`Refusing to pass \`${args[0] ?? ""}\` to ESLint.`);
  if (split.value === undefined || !isConcurrencyValue(split.value)) {
    return refused(`${CONCURRENCY} needs a positive integer, auto or off — got \`${split.value ?? "nothing"}\`.`);
  }
  const rest = args.slice(split.consumed);
  if (rest.some((arg) => arg === CONCURRENCY || arg.startsWith(`${CONCURRENCY}=`))) return refused(`${CONCURRENCY} was given more than once.`);
  if (rest.length > 0) return refused(`Refusing to pass \`${rest[0] ?? ""}\` to ESLint.`);
  return { ok: true, args: [`${CONCURRENCY}=${split.value}`] };
};

/** The part of a `parseArgs` token that says where `--` is and what came after it. */
type ArgToken = { kind: string; index: number; value?: string | boolean | undefined };

/** The positionals after `--`. Without `--` there are none: a bare word is the command's, not ESLint's. */
export const argsAfterTerminator = (tokens: readonly ArgToken[]): string[] => {
  const terminator = tokens.find((token) => token.kind === "option-terminator");
  if (!terminator) return [];
  return tokens.flatMap((token) => (token.kind === "positional" && token.index > terminator.index && typeof token.value === "string" ? [token.value] : []));
};
