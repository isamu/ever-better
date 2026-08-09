import type { ImportGraph } from "./migrate/importGraph.ts";

/**
 * How many files import each file. The graph points from a file to what it depends on, so this is
 * that reversed — and it is what says whether a type change here is one edit or a morning.
 *
 * Direct importers, not transitive reach: the count is one pass over the edges, and every place it
 * is shown says "imported by" rather than "reaches" so the narrower claim is the one being made.
 */
export const countImporters = (graph: ImportGraph): Map<string, number> => {
  const importers = new Map<string, number>([...graph.keys()].map((file) => [file, 0]));
  graph.forEach((dependencies) => {
    new Set(dependencies).forEach((dependency) => {
      importers.set(dependency, (importers.get(dependency) ?? 0) + 1);
    });
  });
  return importers;
};

/** Only the files in the backlog, so `--json` carries what the ranking is about and not the repo. */
export const importersOf = (importers: ReadonlyMap<string, number>, files: readonly string[]): Record<string, number> =>
  Object.fromEntries([...new Set(files)].sort((a, b) => a.localeCompare(b)).map((file) => [file, importers.get(file) ?? 0]));
