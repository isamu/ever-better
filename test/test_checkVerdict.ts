import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkVerdict, observedState } from "../src/checkVerdict.ts";
import type { RuleCounts } from "../src/eslintRunner.ts";
import { emptyState, findRegressions, WARNINGS_COUNTER } from "../src/state.ts";
import type { State } from "../src/types.ts";

const stateWith = (rules: Record<string, [number, number]>, counters: Record<string, [number, number]> = {}): State => ({
  ...emptyState(),
  rules: Object.fromEntries(Object.entries(rules).map(([name, [baseline, current]]) => [name, { baseline, current, status: "draining" as const }])),
  counters: Object.fromEntries(Object.entries(counters).map(([name, [baseline, current]]) => [name, { baseline, current }])),
});

const counts = (partial: Partial<RuleCounts>): RuleCounts => ({ errors: {}, warnings: {}, suppressed: {}, files: 1, ...partial });

describe("checkVerdict", () => {
  it("passes a clean state and reports what is left to drain", () => {
    assert.deepEqual(checkVerdict(stateWith({ a: [3, 2], b: [1, 1] }), {}), { ok: true, message: "Clean. 3 grandfathered violations left to drain." });
  });

  it("treats a count exactly at its ceiling as clean", () => {
    assert.equal(checkVerdict(stateWith({ a: [2, 2] }, { [WARNINGS_COUNTER]: [4, 4] }), {}).ok, true);
  });

  it("fails on unsuppressed errors and lists the worst five, largest first", () => {
    const errors = { a: 1, b: 6, c: 3, d: 2, e: 5, f: 4 };
    assert.deepEqual(checkVerdict(stateWith({}), errors), {
      ok: false,
      message: "21 unsuppressed error(s) — these are new since the baseline:\n  6  b\n  5  e\n  4  f\n  3  c\n  2  d",
    });
  });

  it("ignores rules reported with zero errors", () => {
    assert.equal(checkVerdict(stateWith({}), { a: 0 }).ok, true);
  });

  it("reports errors ahead of ceilings when both are present", () => {
    const result = checkVerdict(stateWith({ a: [1, 3] }), { b: 1 });
    assert.match(result.message, /^1 unsuppressed error\(s\)/);
  });

  it("fails on a rule or counter above its ceiling, naming each with its growth", () => {
    const result = checkVerdict(stateWith({ a: [1, 3], b: [2, 2] }, { [WARNINGS_COUNTER]: [4, 5] }), {});
    assert.deepEqual(result, { ok: false, message: `Counts grew past their ceiling:\n  a: 1 -> 3 (+2)\n  ${WARNINGS_COUNTER}: 4 -> 5 (+1)` });
  });
});

describe("observedState", () => {
  it("records suppressed counts and the warning total without moving any ceiling", () => {
    const next = observedState(stateWith({ a: [2, 2] }, { [WARNINGS_COUNTER]: [3, 3] }), counts({ suppressed: { a: 5 }, warnings: { x: 2, y: 4 } }));
    assert.deepEqual(next.rules["a"], { baseline: 2, current: 5, status: "draining" });
    assert.deepEqual(next.counters[WARNINGS_COUNTER], { baseline: 3, current: 6 });
  });

  it("keeps a ceiling above today's count, so a local improvement is not banked", () => {
    const next = observedState(stateWith({ a: [5, 5] }, { [WARNINGS_COUNTER]: [3, 3] }), counts({ suppressed: { a: 2 }, warnings: { x: 1 } }));
    assert.equal(next.rules["a"]?.baseline, 5);
    assert.equal(next.counters[WARNINGS_COUNTER]?.baseline, 3);
  });
});

const lcg = (seed: number): (() => number) => {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
};

const NAMES = ["a", "b", "c", "d", "e", "f", "constructor", "toString", WARNINGS_COUNTER];
const VALUES = [0, 0, 1, 2, 3, 7];
const SEED = 20260927;
const CASES = 2000;

const generatedBag = (random: () => number): Record<string, number> =>
  Object.fromEntries(NAMES.filter(() => random() < 0.3).map((name) => [name, VALUES[Math.floor(random() * VALUES.length)] ?? 0]));

describe("checkVerdict over generated inputs", () => {
  it(`holds its ordering properties (seed ${SEED})`, () => {
    const random = lcg(SEED);
    Array.from({ length: CASES }).forEach(() => {
      const previous = stateWith(Object.fromEntries(Object.entries(generatedBag(random)).map(([name, baseline]) => [name, [baseline, baseline]])));
      const observed = counts({ errors: generatedBag(random), warnings: generatedBag(random), suppressed: generatedBag(random) });
      const state = observedState(previous, observed);
      const result = checkVerdict(state, observed.errors);
      const errorTotal = Object.values(observed.errors).reduce((sum, count) => sum + count, 0);
      const regressions = findRegressions(state);
      if (errorTotal > 0) {
        assert.equal(result.ok, false);
        assert.ok(result.message.startsWith(`${errorTotal} unsuppressed error(s)`), result.message);
      } else if (regressions.length > 0) {
        assert.equal(result.ok, false);
        regressions.forEach((item) => assert.ok(result.message.includes(`  ${item.name}: ${item.baseline} -> ${item.current}`), result.message));
      } else {
        assert.equal(result.ok, true);
      }
    });
  });
});
