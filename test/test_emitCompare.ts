import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareEmit, describeComparison } from "../src/emitCompare.ts";

const file = (path: string, hash: string) => ({ path, hash });

describe("compareEmit", () => {
  it("calls identical output identical", () => {
    const files = [file("a.js", "1"), file("b.js", "2")];
    assert.equal(compareEmit(files, files).identical, true);
  });

  it("names the file whose emitted JavaScript moved", () => {
    const result = compareEmit([file("a.js", "1")], [file("a.js", "2")]);
    assert.equal(result.identical, false);
    assert.deepEqual(result.changed, ["a.js"]);
  });

  it("separates added and removed from changed", () => {
    const result = compareEmit([file("gone.js", "1")], [file("new.js", "1")]);
    assert.deepEqual(result.removed, ["gone.js"]);
    assert.deepEqual(result.added, ["new.js"]);
    assert.deepEqual(result.changed, []);
  });

  it("treats two empty outputs as identical rather than as an error", () => {
    assert.equal(compareEmit([], []).identical, true);
  });

  it("orders each list, so two runs read the same", () => {
    const before = [file("b.js", "1"), file("a.js", "1")];
    const after = [file("b.js", "2"), file("a.js", "2")];
    assert.deepEqual(compareEmit(before, after).changed, ["a.js", "b.js"]);
  });
});

describe("describeComparison", () => {
  it("states the proof plainly when nothing moved", () => {
    // This is the whole value of the technique: no amount of test coverage says "cannot have
    // changed behaviour" as strongly as identical compiler output does.
    const message = describeComparison(compareEmit([], []), "HEAD");
    assert.match(message, /byte-identical to HEAD/);
    assert.match(message, /provably cannot change behaviour/);
  });

  it("points at the files to look at when something did move", () => {
    const message = describeComparison(
      compareEmit([file("a.js", "1")], [file("a.js", "2")]),
      "main",
    );
    assert.match(message, /differs from main/);
    assert.match(message, /a\.js/);
  });

  it("omits a section that has nothing in it", () => {
    const message = describeComparison(
      compareEmit([file("a.js", "1")], [file("a.js", "2")]),
      "HEAD",
    );
    assert.ok(!message.includes("added:"));
    assert.ok(!message.includes("removed:"));
  });
});
