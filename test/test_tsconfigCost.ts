import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { freeFlags, pricedFlags, type FlagCost } from "../src/probe/tsconfigCost.ts";

const costs: FlagCost[] = [
  { flag: "noImplicitReturns", errors: 0 },
  { flag: "noUncheckedIndexedAccess", errors: 6 },
  { flag: "exactOptionalPropertyTypes", errors: null },
  { flag: "noFallthroughCasesInSwitch", errors: 0 },
  { flag: "noImplicitOverride", errors: 1 },
];

describe("freeFlags", () => {
  it("keeps only flags measured at exactly zero errors, in input order", () => {
    assert.deepEqual(freeFlags(costs), ["noImplicitReturns", "noFallthroughCasesInSwitch"]);
  });

  it("never treats an unmeasured flag as free", () => {
    assert.deepEqual(freeFlags([{ flag: "strictNullChecks", errors: null }]), []);
  });

  it("returns nothing for no flags", () => {
    assert.deepEqual(freeFlags([]), []);
  });
});

describe("pricedFlags", () => {
  it("keeps flags with one or more errors, in input order", () => {
    assert.deepEqual(pricedFlags(costs), [
      { flag: "noUncheckedIndexedAccess", errors: 6 },
      { flag: "noImplicitOverride", errors: 1 },
    ]);
  });

  it("drops an unmeasured flag from both lists", () => {
    const unmeasured: FlagCost[] = [{ flag: "strictNullChecks", errors: null }];
    assert.deepEqual(pricedFlags(unmeasured), []);
    assert.deepEqual(freeFlags(unmeasured), []);
  });

  it("returns nothing when every flag is free", () => {
    assert.deepEqual(pricedFlags([{ flag: "noImplicitReturns", errors: 0 }]), []);
  });
});
