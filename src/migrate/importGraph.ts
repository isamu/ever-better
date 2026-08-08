import path from "node:path";

/**
 * Only relative specifiers matter: a package import is already typed or already is not.
 *
 * Anchored per line and with bounded runs rather than `[^'"]*` after an alternation — the latter
 * backtracks super-linearly, which the repo's own SonarJS tier rejects.
 */
const IMPORT = /^[ \t]*(?:import|export)\b[^'"\n]{0,200}['"](\.[^'"\n]{0,200})['"]/gm;
const REQUIRE = /require\(\s*['"](\.[^'"]*)['"]\s*\)/g;

const JS_EXTENSIONS = ["", ".js", ".jsx", ".mjs", ".cjs", "/index.js", "/index.mjs"];

const collect = (source: string, pattern: RegExp): string[] => [...source.matchAll(pattern)].map((match) => match[1] ?? "").filter((entry) => entry.length > 0);

/**
 * Which files in this repo a file depends on. Resolution is by trying the extensions a JavaScript
 * project actually uses rather than by asking Node: the point is to order a migration, and a
 * specifier that resolves to nothing here is a specifier pointing outside it.
 */
export const resolveLocalImports = (file: string, source: string, known: ReadonlySet<string>): string[] => {
  const directory = path.posix.dirname(file);
  const specifiers = [...collect(source, IMPORT), ...collect(source, REQUIRE)];
  return [
    ...new Set(
      specifiers.flatMap((specifier) => {
        const base = path.posix.normalize(path.posix.join(directory, specifier));
        const hit = JS_EXTENSIONS.map((extension) => `${base}${extension}`).find((candidate) => known.has(candidate));
        return hit === undefined ? [] : [hit];
      }),
    ),
  ];
};

export type ImportGraph = Map<string, string[]>;

export const buildGraph = (files: ReadonlyMap<string, string>): ImportGraph => {
  const known = new Set(files.keys());
  return new Map([...files.entries()].map(([file, source]) => [file, resolveLocalImports(file, source, known)]));
};
