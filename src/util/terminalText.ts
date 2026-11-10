const FIRST_PRINTABLE = 0x20;
const DELETE = 0x7f;
const LAST_C1_CONTROL = 0x9f;
const HEX_RADIX = 16;
const HEX_WIDTH = 2;

const isControl = (code: number): boolean => code < FIRST_PRINTABLE || (code >= DELETE && code <= LAST_C1_CONTROL);

const escaped = (character: string): string => {
  const code = character.codePointAt(0) ?? 0;
  return isControl(code) ? `\\x${code.toString(HEX_RADIX).padStart(HEX_WIDTH, "0")}` : character;
};

/**
 * One line of text that came out of a linted file — a path, or a message that can quote the
 * source. Printed raw, an ESC sequence or a carriage return in it can rewrite what a terminal or a
 * CI log shows above it, so a file in a pull request could make a failing gate read as clean.
 * Whitespace runs collapse to a space; every other control character is shown as `\xNN`.
 */
export const printableLine = (text: string): string => Array.from(text.replace(/\s+/g, " ").trim(), escaped).join("");
