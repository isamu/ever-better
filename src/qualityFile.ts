import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { extractNotes, QUALITY_FILE, renderQuality } from "./render/quality.ts";
import type { State } from "./types.ts";

const readIfPresent = async (filePath: string): Promise<string | null> => {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
};

/** Re-renders QUALITY.md from state, carrying the owner's notes block across untouched. */
export const writeQualityFile = async (cwd: string, state: State): Promise<string> => {
  const filePath = path.join(cwd, QUALITY_FILE);
  const notes = extractNotes(await readIfPresent(filePath));
  await writeFile(filePath, renderQuality(state, notes), "utf8");
  return filePath;
};
