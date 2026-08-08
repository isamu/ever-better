export type EmittedFile = {
  path: string;
  hash: string;
};

export type EmitComparison = {
  identical: boolean;
  changed: string[];
  added: string[];
  removed: string[];
};

const byPath = (files: readonly EmittedFile[]): Map<string, string> => new Map(files.map((file) => [file.path, file.hash]));

/**
 * Pure comparison of two compiler outputs.
 *
 * A TypeScript refactor that only moves types around — narrowing a parameter, deleting an `as`,
 * splitting an interface — erases at compile time. If the emitted JavaScript is byte-identical then
 * the change provably cannot alter behaviour, and no amount of test coverage says that as strongly.
 * When it is not identical, the files listed are exactly where to look.
 */
export const compareEmit = (before: readonly EmittedFile[], after: readonly EmittedFile[]): EmitComparison => {
  const first = byPath(before);
  const second = byPath(after);
  const changed = [...first.entries()]
    .filter(([path, hash]) => second.has(path) && second.get(path) !== hash)
    .map(([path]) => path)
    .sort((left, right) => left.localeCompare(right));
  const added = [...second.keys()].filter((path) => !first.has(path)).sort((left, right) => left.localeCompare(right));
  const removed = [...first.keys()].filter((path) => !second.has(path)).sort((left, right) => left.localeCompare(right));
  return {
    identical: changed.length === 0 && added.length === 0 && removed.length === 0,
    changed,
    added,
    removed,
  };
};

export const describeComparison = (comparison: EmitComparison, ref: string): string => {
  if (comparison.identical) {
    return [
      `The emitted JavaScript is byte-identical to ${ref}.`,
      "This refactor provably cannot change behaviour — the difference erased at compile time.",
    ].join("\n");
  }
  const section = (label: string, paths: readonly string[]): string[] => (paths.length === 0 ? [] : [`${label}:`, ...paths.map((path) => `  ${path}`)]);
  return [
    `The emitted JavaScript differs from ${ref}. These are where behaviour could have changed:`,
    ...section("changed", comparison.changed),
    ...section("added", comparison.added),
    ...section("removed", comparison.removed),
  ].join("\n");
};
