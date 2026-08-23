/** Every character of a comment becomes a space, so offsets and line numbers still line up. */
const blanked = (text: string): string => text.replace(/[^\n]/g, " ");

const blankLine = (line: string, inBlock: boolean): { text: string; inBlock: boolean } => {
  if (inBlock) {
    const close = line.indexOf("*/");
    if (close === -1) return { text: blanked(line), inBlock: true };
    const rest = blankLine(line.slice(close + 2), false);
    return { text: blanked(line.slice(0, close + 2)) + rest.text, inBlock: false };
  }
  const block = line.indexOf("/*");
  const comment = line.indexOf("//");
  if (block !== -1 && (comment === -1 || block < comment)) {
    const close = line.indexOf("*/", block + 2);
    if (close === -1) return { text: line.slice(0, block) + blanked(line.slice(block)), inBlock: true };
    const rest = blankLine(line.slice(close + 2), false);
    return { text: line.slice(0, block) + blanked(line.slice(block, close + 2)) + rest.text, inBlock: false };
  }
  if (comment !== -1) return { text: line.slice(0, comment) + blanked(line.slice(comment)), inBlock: false };
  return { text: line, inBlock: false };
};

/**
 * The source with every comment blanked out, the same length and the same line breaks.
 *
 * Reading a config as text is how this tool decides whether it is wired and where a block may be
 * appended, and a comment that looks like code has broken both: a spread inside one read as wiring,
 * and a comma appended after one landed outside the comment and put a hole in the config array.
 * Asking these questions of the blanked copy costs nothing and removes the whole class.
 *
 * A string literal containing `//` is blanked too. That can only LOSE a match, never invent one,
 * which is the safe direction for every caller here.
 */
export const withoutComments = (source: string): string =>
  source
    .split("\n")
    .reduce<{ lines: string[]; inBlock: boolean }>(
      (acc, line) => {
        const { text, inBlock } = blankLine(line, acc.inBlock);
        return { lines: [...acc.lines, text], inBlock };
      },
      { lines: [], inBlock: false },
    )
    .lines.join("\n");
