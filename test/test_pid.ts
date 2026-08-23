import assert from "node:assert/strict";
import process from "node:process";
import { describe, it } from "node:test";
import { isProcessAlive } from "../src/util/pid.ts";

describe("isProcessAlive", () => {
  it("says yes to the process asking", () => {
    assert.equal(isProcessAlive(process.pid), true);
  });

  /** A lock left by a crashed run must be reclaimable, or one crash wedges the repository forever. */
  it("says no to a pid nothing is using", () => {
    assert.equal(isProcessAlive(2 ** 30), false);
  });

  it("says no to a pid that cannot exist rather than throwing", () => {
    [0, -1, 1.5, Number.NaN].forEach((pid) => assert.equal(isProcessAlive(pid), false, `${pid}`));
  });
});
