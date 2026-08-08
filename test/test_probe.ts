import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findWeakRules, isRuleOff, isRuleWarnOnly, HIGH_VALUE_RULES } from "../src/probe/effectiveRules.ts";
import { findMissingStrictness, isStrictOff } from "../src/probe/effectiveTsconfig.ts";
import { sampleSourceFile } from "../src/probe/gather.ts";
import type { SourceFile } from "../src/types.ts";

const file = (path: string): SourceFile => ({
  path,
  ext: path.split(".").pop() ?? "",
  lines: 10,
});

describe("rule severity", () => {
  it("reads both the bare level and the [level, options] form", () => {
    assert.equal(isRuleOff("off"), true);
    assert.equal(isRuleOff(0), true);
    assert.equal(isRuleOff(["off", { max: 5 }]), true);
    assert.equal(isRuleOff(["error", { max: 5 }]), false);
  });

  it("treats a rule ESLint never mentioned as off", () => {
    assert.equal(isRuleOff(undefined), true);
  });

  it("separates warn from error, because warn enforces nothing", () => {
    assert.equal(isRuleWarnOnly("warn"), true);
    assert.equal(isRuleWarnOnly(1), true);
    assert.equal(isRuleWarnOnly("error"), false);
    assert.equal(isRuleWarnOnly(["warn", { max: 5 }]), true);
  });
});

describe("findWeakRules", () => {
  const allOn = Object.fromEntries(HIGH_VALUE_RULES.map((rule) => [rule.name, "error"]));

  it("reports nothing when every rule is an error", () => {
    assert.deepEqual(findWeakRules({ rules: allOn }), []);
  });

  it("reports a rule ESLint did not mention at all", () => {
    const rules = { ...allOn };
    delete rules[HIGH_VALUE_RULES[0]?.name ?? ""];
    const weak = findWeakRules({ rules });
    assert.equal(weak.length, 1);
    assert.equal(weak[0]?.state, "off");
  });

  it("separates warn-only from off, because they need different answers", () => {
    const name = HIGH_VALUE_RULES[0]?.name ?? "";
    const weak = findWeakRules({ rules: { ...allOn, [name]: "warn" } });
    assert.deepEqual(
      weak.map((verdict) => verdict.state),
      ["warn"],
    );
  });

  it("reports nothing when ESLint could not be asked", () => {
    // A repo without ESLint is the normal input, not an error.
    assert.deepEqual(findWeakRules(null), []);
  });
});

describe("findMissingStrictness", () => {
  it("reports a flag that `strict` does not include", () => {
    // strict: true enables none of these, which is exactly the trap.
    const missing = findMissingStrictness({ compilerOptions: { strict: true } });
    const names = missing.map((entry) => entry.flag.name);
    assert.ok(names.includes("noUncheckedIndexedAccess"));
    assert.ok(names.includes("exactOptionalPropertyTypes"));
  });

  it("reports nothing once they are all on", () => {
    const compilerOptions = {
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
    };
    assert.deepEqual(findMissingStrictness({ compilerOptions }), []);
  });

  it("treats a flag set to false as off, not as configured", () => {
    const missing = findMissingStrictness({ compilerOptions: { noImplicitReturns: false } });
    assert.ok(missing.some((entry) => entry.flag.name === "noImplicitReturns"));
  });

  it("reports nothing when tsc could not be asked", () => {
    assert.deepEqual(findMissingStrictness(null), []);
  });
});

describe("isStrictOff", () => {
  it("is true when neither strict nor strictNullChecks is set", () => {
    assert.equal(isStrictOff({ compilerOptions: {} }), true);
  });

  it("accepts strictNullChecks alone, which is the load-bearing half", () => {
    assert.equal(isStrictOff({ compilerOptions: { strictNullChecks: true } }), false);
  });

  it("says nothing when there is no tsconfig to read", () => {
    assert.equal(isStrictOff(null), false);
  });
});

describe("sampleSourceFile", () => {
  it("prefers TypeScript, because that is where the type-aware rules apply", () => {
    const picked = sampleSourceFile([file("src/a.js"), file("src/b.ts")]);
    assert.equal(picked?.path, "src/b.ts");
  });

  it("skips declarations and specs, whose config says nothing about the code", () => {
    const picked = sampleSourceFile([file("src/a.d.ts"), file("test/b.ts"), file("src/c.ts")]);
    assert.equal(picked?.path, "src/c.ts");
  });

  it("falls back rather than giving up when everything is excluded", () => {
    assert.equal(sampleSourceFile([file("test/only.ts")])?.path, "test/only.ts");
  });

  it("returns null for an empty repo", () => {
    assert.equal(sampleSourceFile([]), null);
  });
});
