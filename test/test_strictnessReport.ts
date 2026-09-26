import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { FlagCost } from "../src/probe/tsconfigCost.ts";
import { strictnessReport } from "../src/strictnessReport.ts";

const GENERATED_CASES = 2000;
const MAX_FLAGS = 6;
const FLAGS = ["noImplicitReturns", "noUncheckedIndexedAccess", "exactOptionalPropertyTypes", "constructor"];
const ERROR_COUNTS: (number | null)[] = [0, null, 1, 6, 500];

const seededRandom = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

const generateCosts = (random: () => number): FlagCost[] =>
  Array.from({ length: Math.floor(random() * MAX_FLAGS) }, () => ({
    flag: FLAGS[Math.floor(random() * FLAGS.length)] ?? "",
    errors: ERROR_COUNTS[Math.floor(random() * ERROR_COUNTS.length)] ?? null,
  }));

describe("strictnessReport", () => {
  it("reports nothing free and nothing priced for no measurements", () => {
    assert.deepEqual(strictnessReport([]), { applied: [], priced: [], message: "Nothing was free to enable." });
  });

  it("lists the free flags on one line and each priced flag on its own", () => {
    const report = strictnessReport([
      { flag: "noImplicitReturns", errors: 0 },
      { flag: "noUncheckedIndexedAccess", errors: 6 },
      { flag: "noFallthroughCasesInSwitch", errors: 0 },
      { flag: "noImplicitOverride", errors: 1 },
    ]);
    assert.deepEqual(report.applied, ["noImplicitReturns", "noFallthroughCasesInSwitch"]);
    assert.equal(
      report.message,
      [
        "Enabled at zero cost: noImplicitReturns, noFallthroughCasesInSwitch",
        "Priced and left off — each is a task, not a flag flip:",
        "  noUncheckedIndexedAccess: 6 type errors — left off",
        "  noImplicitOverride: 1 type errors — left off",
      ].join("\n"),
    );
  });

  it("enables a single free flag", () => {
    assert.equal(strictnessReport([{ flag: "noImplicitReturns", errors: 0 }]).message, "Enabled at zero cost: noImplicitReturns");
  });

  it("says nothing was free when every flag costs something", () => {
    assert.equal(
      strictnessReport([{ flag: "noUncheckedIndexedAccess", errors: 6 }]).message,
      "Nothing was free to enable.\nPriced and left off — each is a task, not a flag flip:\n  noUncheckedIndexedAccess: 6 type errors — left off",
    );
  });

  it("leaves an unmeasured flag out of the report entirely", () => {
    assert.deepEqual(strictnessReport([{ flag: "strictNullChecks", errors: null }]), { applied: [], priced: [], message: "Nothing was free to enable." });
  });

  it("applies exactly the zero-cost flags and prices exactly the costly ones, over generated measurements", () => {
    const random = seededRandom(1);
    Array.from({ length: GENERATED_CASES }, () => generateCosts(random)).forEach((costs) => {
      const report = strictnessReport(costs);
      assert.deepEqual(
        report.applied,
        costs.filter((cost) => cost.errors === 0).map((cost) => cost.flag),
      );
      assert.deepEqual(
        report.priced,
        costs.filter((cost) => cost.errors !== null && cost.errors > 0),
      );
      const pricedLines = report.message.split("\n").filter((line) => line.endsWith("type errors — left off"));
      assert.equal(pricedLines.length, report.priced.length);
      assert.equal(report.message.includes("?"), false);
    });
  });
});
