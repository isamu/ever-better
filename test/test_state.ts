import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { applyRuleCounts, emptyState, findRegressions, improvements, nextBaseline, readState, setCounter, totalViolations } from "../src/state.ts";

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
    const rule = state.rules["no-any"];
    assert.ok(rule);
    assert.equal(rule.baseline, 3);
    assert.equal(rule.current, 3);
    assert.equal(totalViolations(state), 4);
  });

  it("records a rule that dropped to zero as enforced", () => {
    const frozen = applyRuleCounts(emptyState(), { "no-any": 2 }, "freeze");
    const drained = applyRuleCounts(frozen, {}, "observe");
    const rule = drained.rules["no-any"];
    assert.ok(rule);
    assert.equal(rule.current, 0);
    assert.equal(rule.status, "enforced");
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

/**
 * A 0.1.0 file has no `log` and no diagnosis provenance. The guard only checks the three fields
 * that identify the format, so such a file loads and `migrate` is the only thing that makes it a
 * complete `State` — which is why the fills there are not the dead code their old type implied.
 */
describe("readState", () => {
  const writeStateFile = async (body: unknown): Promise<string> => {
    const dir = await mkdtemp(path.join(tmpdir(), "ever-better-state-"));
    await mkdir(path.join(dir, ".ever-better"), { recursive: true });
    await writeFile(path.join(dir, ".ever-better", "state.json"), JSON.stringify(body), "utf8");
    return dir;
  };

  it("fills the fields a 0.1.0 file never wrote", async () => {
    const dir = await writeStateFile({
      version: 1,
      tool: "ever-better",
      phase: "freeze",
      updatedAt: "2026-01-01T00:00:00.000Z",
      frozenAt: null,
      diagnosis: null,
      rules: {},
      counters: {},
    });
    const state = await readState(dir);
    assert.ok(state);
    assert.deepEqual(state.log, []);
    assert.equal(state.diagnosedAt, null);
    assert.equal(state.diagnosedCommit, null);
  });

  it("keeps what a current file already carries", async () => {
    const entry = { at: "2026-01-02T00:00:00.000Z", kind: "freeze", text: "frozen", commit: null, rule: null };
    const dir = await writeStateFile({ ...emptyState(), diagnosedAt: "2026-01-01T00:00:00.000Z", diagnosedCommit: "abc1234", log: [entry] });
    const state = await readState(dir);
    assert.ok(state);
    assert.deepEqual(state.log, [entry]);
    assert.equal(state.diagnosedCommit, "abc1234");
  });

  it("rejects a file that does not identify itself as this format", async () => {
    const dir = await writeStateFile({ version: 2, rules: {}, counters: {} });
    assert.equal(await readState(dir), null);
  });

  it("returns null rather than throwing when there is no file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ever-better-state-"));
    assert.equal(await readState(dir), null);
  });
});
