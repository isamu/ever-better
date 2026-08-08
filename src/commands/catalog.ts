import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { catalogSources, extractExports, renderCatalog, type CatalogEntry } from "../catalog.ts";
import { gatherFacts } from "../facts.ts";

export type CatalogOptions = {
  cwd: string;
};

const CATALOG_PATH = path.join("docs", "shared-helpers.md");

/**
 * A list of the helpers that already exist, for whoever is about to write another one.
 *
 * This is the gap between the two scans: a linter sees inside one file, and duplication detection
 * only notices copies once they are textually similar — which independently written implementations
 * of the same idea rarely are. Nothing else reports the same function under a sixth name.
 */
export const runCatalog = async (options: CatalogOptions): Promise<string> => {
  const facts = await gatherFacts(options.cwd);
  const sources = catalogSources(facts.sourceFiles);

  const perFile = await Promise.all(
    sources.map(async (file): Promise<CatalogEntry[]> => {
      const source = await readFile(path.join(options.cwd, file.path), "utf8").catch(() => "");
      return extractExports(source, file.path);
    }),
  );
  const entries = perFile.flat();

  const target = path.join(options.cwd, CATALOG_PATH);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, renderCatalog(entries), "utf8");

  return [
    `Wrote ${CATALOG_PATH}: ${entries.length} exported functions across ${sources.length} files.`,
    entries.length === 0
      ? "Nothing was found, which is worth a second look before trusting it."
      : "Point CLAUDE.md at it, or it will not be read before the next helper is written.",
  ].join("\n");
};
