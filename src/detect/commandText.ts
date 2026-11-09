/** `yarn install && yarn lint` is two commands, and only the second one runs lint. */
export const COMMAND_SEPARATOR = /&&|\|\||;/;

export const tokensOf = (command: string): string[] =>
  command
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0);

/**
 * Tokens that can stand in front of the real command without changing what it is. `workspaces` is
 * here because `yarn workspaces run eslint` runs eslint — a monorepo root delegates, and reading
 * the delegation as the command reported the root as running nothing.
 */
const RUNNERS = new Set(["-", "npx", "sudo", "env", "yarn", "pnpm", "bunx", "bun", "run", "workspaces"]);

/** `FOO=bar gitleaks git .` — an assignment prefix is not the command either. */
const isAssignment = (token: string): boolean => /^[A-Za-z_]\w*=/.test(token);

export const commandOf = (tokens: readonly string[]): string | null => {
  const [head, ...rest] = tokens;
  if (head === undefined) return null;
  return RUNNERS.has(head) || isAssignment(head) ? commandOf(rest) : head;
};

export const basename = (command: string): string => command.split("/").at(-1) ?? command;

/** Whether one command in a shell line runs a given tool, whatever wrappers stand in front of it. */
export const runsTool = (command: string, tool: string): boolean => {
  const resolved = commandOf(tokensOf(command));
  return resolved !== null && basename(resolved) === tool;
};
