import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The `Map<path, text>` the import graph is built from. A file that cannot be read becomes an empty
 * string rather than an exception: one unreadable file should cost its own edges, not the graph.
 */
export const readSources = async (cwd: string, files: readonly string[]): Promise<Map<string, string>> =>
  new Map(await Promise.all(files.map(async (file): Promise<[string, string]> => [file, await readFile(path.join(cwd, file), "utf8").catch(() => "")])));
