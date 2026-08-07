import type { SizeDistribution, SourceFile } from "../types.ts";

export const DEFAULT_FILE_LINE_LIMIT = 600;

const LARGEST_SAMPLE = 10;

const byLinesDescending = (a: SourceFile, b: SourceFile): number => b.lines - a.lines;

/**
 * The `max-lines` backlog, known before the rule is ever switched on. Reporting it during diagnose
 * is what makes the limit tier an informed choice rather than a number copied from a blog post.
 */
export const summarizeSizes = (
  sourceFiles: readonly SourceFile[],
  limit: number = DEFAULT_FILE_LINE_LIMIT,
): SizeDistribution => {
  const over = sourceFiles.filter((file) => file.lines > limit);
  return {
    total: sourceFiles.length,
    overFileLimit: over.length,
    largest: [...over].sort(byLinesDescending).slice(0, LARGEST_SAMPLE),
  };
};
