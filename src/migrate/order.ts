import type { ImportGraph } from "./importGraph.ts";

export type MigrationPlan = {
  /** Dependencies before dependents: each file's imports are already typed when its turn comes. */
  order: string[];
  /** Files in an import cycle. Nothing in one can go first, so they migrate together. */
  cycles: string[][];
};

const visit = (file: string, graph: ImportGraph, done: Set<string>, stack: Set<string>, order: string[], cycles: string[][]): void => {
  if (done.has(file)) return;
  if (stack.has(file)) {
    cycles.push([...stack].slice([...stack].indexOf(file)));
    return;
  }
  stack.add(file);
  for (const dependency of graph.get(file) ?? []) {
    visit(dependency, graph, done, stack, order, cycles);
  }
  stack.delete(file);
  done.add(file);
  order.push(file);
};

/**
 * Leaf-first. Migrating a file whose imports are still JavaScript means typing it against `any`,
 * and every one of those has to be revisited once the dependency is typed — so the order is the
 * difference between doing the work once and doing it twice.
 */
export const planMigration = (graph: ImportGraph): MigrationPlan => {
  const done = new Set<string>();
  const order: string[] = [];
  const cycles: string[][] = [];
  for (const file of [...graph.keys()].sort((left, right) => left.localeCompare(right))) {
    visit(file, graph, done, new Set(), order, cycles);
  }
  return { order, cycles };
};

/** `.js` becomes `.ts`; JSX has to become `.tsx` or the compiler refuses the syntax. */
export const migratedName = (file: string): string =>
  file
    .replace(/\.jsx$/, ".tsx")
    .replace(/\.mjs$/, ".mts")
    .replace(/\.cjs$/, ".cts")
    .replace(/\.js$/, ".ts");
