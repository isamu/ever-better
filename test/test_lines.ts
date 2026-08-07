import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { countLines } from "../src/util/lines.ts";

const withFile = async (contents: string): Promise<number> => {
  const dir = await mkdtemp(path.join(tmpdir(), "ever-better-lines-"));
  const file = path.join(dir, "sample.txt");
  await writeFile(file, contents, "utf8");
  return countLines(file);
};

describe("countLines", () => {
  it("reports nothing for an empty file", async () => {
    assert.equal(await withFile(""), 0);
  });

  it("counts a single line with no trailing newline", async () => {
    assert.equal(await withFile("one"), 1);
  });

  it("does not invent an extra line for a trailing newline", async () => {
    assert.equal(await withFile("one\ntwo\n"), 2);
  });

  it("counts the last line when the newline is missing", async () => {
    assert.equal(await withFile("one\ntwo"), 2);
  });

  it("counts blank lines", async () => {
    assert.equal(await withFile("\n\n\n"), 3);
  });

  it("handles content larger than one read chunk", async () => {
    const lines = 200_000;
    assert.equal(await withFile("x\n".repeat(lines)), lines);
  });
});
