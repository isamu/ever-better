import { stringifyLike } from "./util/jsonFormat.ts";

/**
 * A `package.json`'s text with `scripts` merged in, shaped exactly like the text it came from.
 *
 * Pure, and takes the file's text rather than its path, because this is the one place the tool
 * edits a file somebody else owns — every guarantee about it (nothing lost, nothing reindented,
 * nothing re-ended) is a property of this function and is tested here rather than behind an
 * install.
 */
export const withScripts = (text: string, scripts: Readonly<Record<string, string>>): string => {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("package.json is not an object");
  const existing = "scripts" in parsed && typeof parsed.scripts === "object" && parsed.scripts !== null ? parsed.scripts : {};
  return stringifyLike(text, { ...parsed, scripts: { ...existing, ...scripts } });
};
