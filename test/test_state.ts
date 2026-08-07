import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRuleCounts,
  emptyState,
  findRegressions,
  improvements,
  nextBaseline,
  setCounter,
  totalViolations,
} from "../src/state.ts";

describe("nextBaseline", () => {
  it("adopts the current count for a rule seen for the first time", () => {
    assert.equal(nextBaseline(undefined, 7, "observe"), 7);
    assert.equal(nextBaseline(undefined, 7, "freeze"), 7);
  });

  it("leaves the ceiling alone while observing, however the count moved", () => {
    assert.equal(nextBaseline(5, 2, "observe"), 5);
    assert.equal(nextBaseline(5, 9, "observe"), 5);
  });

  it("lowers the ceiling on freeze but never raises it", () => {
    assert.equal(nextBaseline(5, 2, "freeze"), 2);
    assert.equal(nextBaseline(5, 9, "freeze"), 5);
  });

  it("lets --force move a ceiling up, which is the only way that can happen", () => {
    assert.equal(nextBaseline(5, 9, "rebaseline"), 9);
  });
});

describe("applyRuleCounts", () => {
  it("pins today's counts on the first freeze", () => {
    const state = applyRuleCounts(emptyState(), { "no-any": 3, "max-depth": 1 }, "freeze");
    assert.equal(state.rules["no-any"]?.baseline, 3);
    assert.equal(state.rules["no-any"]?.current, 3);
    assert.equal(totalViolations(state), 4);
  });

  it("records a rule that dropped to zero as enforced", () => {
    const frozen = applyRuleCounts(emptyState(), { "no-any": 2 }, "freeze");
    const drained = applyRuleCounts(frozen, {}, "observe");
    assert.equal(drained.rules["no-any"]?.current, 0);
    assert.equal(drained.rules["no-any"]?.status, "enforced");
    assert.deepEqual(
      improvements(drained).map((entry) => entry.name),
      ["no-any"],
    );
  });

  it("keeps a rule in the table after its violations are gone, so the win stays visible", () => {
    const frozen = applyRuleCounts(emptyState(), { "no-any": 2 }, "freeze");
    const drained = applyRuleCounts(frozen, {}, "observe");
    assert.ok("no-any" in drained.rules);
  });

  it("flags a rule that grew past its ceiling", () => {
    const frozen = applyRuleCounts(emptyState(), { "no-any": 2 }, "freeze");
    const worse = applyRuleCounts(frozen, { "no-any": 5 }, "observe");
    assert.deepEqual(findRegressions(worse), [{ name: "no-any", baseline: 2, current: 5 }]);
  });

  it("does not let a second freeze legalise violations added since the first", () => {
    const frozen = applyRuleCounts(emptyState(), { "no-any": 2 }, "freeze");
    const refrozen = applyRuleCounts(frozen, { "no-any": 5 }, "freeze");
    assert.equal(refrozen.rules["no-any"]?.baseline, 2);
    assert.equal(findRegressions(refrozen).length, 1);
  });
});

describe("setCounter", () => {
  it("applies the same ratchet to a plain counter", () => {
    const first = setCounter(emptyState(), "duplication", 12, "freeze");
    const grown = setCounter(first, "duplication", 20, "observe");
    assert.deepEqual(findRegressions(grown), [{ name: "duplication", baseline: 12, current: 20 }]);
  });
});

describe("findRegressions", () => {
  it("is empty for a fresh state", () => {
    assert.deepEqual(findRegressions(emptyState()), []);
  });
});
