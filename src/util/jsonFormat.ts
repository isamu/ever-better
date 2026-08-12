/** What npm writes, and what there is nothing better to guess when the file has no indentation. */
const DEFAULT_INDENT = "  ";

/**
 * The first line that is indented at all. Anything may follow the indentation: anchoring it to a
 * quote missed an array of objects or numbers, where the first indented line opens with `{` or a
 * digit. JSON has no comments and escapes every newline inside a string, so an indented line is
 * always structural.
 */
const FIRST_INDENTED_LINE = /\n([ \t]+)\S/;

const CRLF = "\r\n";

const detectIndent = (text: string): string => FIRST_INDENTED_LINE.exec(text)?.[1] ?? DEFAULT_INDENT;

/**
 * A file checked out on Windows without `.gitattributes` is CRLF throughout, and `JSON.stringify`
 * only ever emits `\n` — so preserving the indentation and not the line endings still rewrites
 * every line.
 */
const detectLineEnding = (text: string): string => (text.includes(CRLF) ? CRLF : "\n");

/**
 * Indent by depth rather than by handing the string to `JSON.stringify`, which clips a string
 * `space` to ten characters — so a file indented more widely than that would be silently reformatted
 * by the very function meant to preserve it. Stringifying with one space makes the leading run its
 * own depth counter, and a newline inside a string value is escaped, so only structural indentation
 * can match.
 */
const indentByDepth = (json: string, indent: string): string => json.replace(/^ +/gm, (depth) => indent.repeat(depth.length));

/**
 * `value` as JSON text shaped like `original` — same indentation, same line endings, one trailing
 * newline. Editing a file someone else owns should produce a diff of what changed and nothing else.
 *
 * The trailing newline is added whether or not the original had one: preserving its absence would
 * leave a file the repository's own formatter then reports.
 */
export const stringifyLike = (original: string, value: unknown): string => {
  const ending = detectLineEnding(original);
  const body = indentByDepth(JSON.stringify(value, null, " "), detectIndent(original));
  return `${body.split("\n").join(ending)}${ending}`;
};
