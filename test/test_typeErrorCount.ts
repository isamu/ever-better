import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countTypeErrors } from "../src/typeErrorCount.ts";

const FRAGMENTS = [
  "",
  "a.ts(1,2): error TS2322: x",
  "error TS",
  "error ts1",
  "\u001b[91merror\u001b[0m TS2322",
  "warning TS1",
  "Found 3 errors.",
  "error TS\r",
  "errorTS1",
];
const SEPARATORS = ["\n", "\r\n"];

const markedLines = (text: string): number => text.split(/\n/).filter((line) => line.includes("error TS")).length;

const generatedOutputs = (): string[] =>
  FRAGMENTS.flatMap((first) => FRAGMENTS.flatMap((second) => SEPARATORS.map((separator) => `${first}${separator}${second}`)));

const generatedRuns = (): { stdout: string; stderr: string }[] => generatedOutputs().flatMap((stdout) => FRAGMENTS.map((stderr) => ({ stdout, stderr })));

describe("countTypeErrors", () => {
  it("counts one per line carrying the marker, across stdout and stderr", () => {
    assert.equal(countTypeErrors({ stdout: "a.ts(1,1): error TS1005: x\nb.ts(2,2): error TS2322: y\nFound 2 errors.", stderr: "" }), 2);
    assert.equal(countTypeErrors({ stdout: "", stderr: "error TS6053: File not found." }), 1);
  });

  it("returns zero for no output", () => {
    assert.equal(countTypeErrors({ stdout: "", stderr: "" }), 0);
  });

  it("never merges stdout's last line with stderr's first", () => {
    assert.equal(countTypeErrors({ stdout: "error", stderr: " TS1005" }), 0);
    assert.equal(countTypeErrors({ stdout: "error TS1", stderr: "error TS2" }), 2);
  });

  it("counts CRLF lines", () => {
    assert.equal(countTypeErrors({ stdout: "error TS1\r\nerror TS2\r\n", stderr: "" }), 2);
  });

  it("counts nothing in coloured output, which is why callers pass --pretty false", () => {
    assert.equal(countTypeErrors({ stdout: "\u001b[91merror\u001b[0m\u001b[90m TS2322: \u001b[0mx", stderr: "" }), 0);
  });

  it("equals the marked lines of stdout plus those of stderr, over every generated pairing", () => {
    generatedRuns().forEach((run) => assert.equal(countTypeErrors(run), markedLines(run.stdout) + markedLines(run.stderr), JSON.stringify(run)));
  });
});
