import { createReadStream } from "node:fs";

const NEWLINE = 0x0a;

/**
 * Counts lines without ever holding the file as a string. A repository can contain a generated
 * source file of any size, and `readFile(…, "utf8")` throws outright past V8's maximum string
 * length — which would report the largest file in the repo as unreadable rather than as large.
 */
export const countLines = async (filePath: string): Promise<number> =>
  new Promise((resolve, reject) => {
    let newlines = 0;
    let lastByte: number | null = null;
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => {
      if (typeof chunk === "string" || chunk.length === 0) return;
      for (const byte of chunk) if (byte === NEWLINE) newlines += 1;
      lastByte = chunk[chunk.length - 1] ?? null;
    });
    stream.on("error", reject);
    stream.on("close", () => {
      if (lastByte === null) return resolve(0);
      // A final line with no trailing newline still counts; a file ending in one does not gain an
      // empty line after it.
      resolve(lastByte === NEWLINE ? newlines : newlines + 1);
    });
  });
