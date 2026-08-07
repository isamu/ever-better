import type { LanguageMode, SourceFile } from "../types.ts";

const TS_EXTENSIONS = new Set(["ts", "tsx", "mts", "cts"]);
const JS_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs"]);

/** Below this share of TypeScript, a repo with a tsconfig is still a JavaScript repo in practice. */
const MIXED_THRESHOLD = 0.9;

export const isTypeScriptFile = (file: SourceFile): boolean => TS_EXTENSIONS.has(file.ext);

export const isJavaScriptFile = (file: SourceFile): boolean => JS_EXTENSIONS.has(file.ext);

/**
 * Share of source files that are TypeScript. Returns 0 for an empty repo rather than NaN, so
 * callers can compare it without guarding.
 */
export const typescriptFileRatio = (sourceFiles: readonly SourceFile[]): number => {
  const counted = sourceFiles.filter((file) => isTypeScriptFile(file) || isJavaScriptFile(file));
  if (counted.length === 0) return 0;
  return counted.filter(isTypeScriptFile).length / counted.length;
};

/**
 * `mixed` is the interesting case: a tsconfig exists, so the toolchain is ready, but enough `.js`
 * remains that the type-aware rules cover only part of the codebase. That gap is what the JS→TS
 * migration phase closes, and it is invisible if you only check whether a tsconfig exists.
 */
export const detectLanguageMode = (
  hasTsconfig: boolean,
  sourceFiles: readonly SourceFile[],
): LanguageMode => {
  if (!hasTsconfig) return "javascript";
  return typescriptFileRatio(sourceFiles) >= MIXED_THRESHOLD ? "typescript" : "mixed";
};
