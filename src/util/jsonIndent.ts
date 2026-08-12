/** What npm writes, and what there is nothing better to guess when the file has no indentation. */
const DEFAULT_INDENT = "  ";

/** The first line that is indented at all. Anchored to a quote so a wrapped string cannot match. */
const FIRST_INDENTED_LINE = /\n([ \t]+)"/;

/**
 * The indentation a JSON file already uses, so editing it does not reformat it. A `package.json`
 * written with tabs comes back with tabs, and the diff stays the lines that changed rather than the
 * whole file — which is what makes a generated pull request reviewable.
 */
export const detectJsonIndent = (text: string): string => FIRST_INDENTED_LINE.exec(text)?.[1] ?? DEFAULT_INDENT;
