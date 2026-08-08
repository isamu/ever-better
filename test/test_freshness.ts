import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessFreshness } from "../src/freshness.ts";
import { buildWorklist } from "../src/render/worklist.ts";
import { applyRuleCounts, appendLog, emptyState, logOfKind } from "../src/state.ts";

const NOW = new Date("2026-08-08T00:00:00.000Z");

const daysAgo = (days: number): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const input = (overrides: Partial<Parameters<typeof assessFreshness>[0]> = {}) => ({
  diagnosedAt: daysAgo(1),
  diagnosedCommit: "abc1234",
  headCommit: "abc1234",
  commitsSince: 0,
  now: NOW,
  ...overrides,
});

describe("assessFreshness", () => {
  it("is fresh right after a diagnosis", () => {
    assert.equal(assessFreshness(input()).stale, false);
  });

  it("is stale when there has never been one", () => {
    const never = assessFreshness(input({ diagnosedAt: null, diagnosedCommit: null }));
    assert.equal(never.stale, true);
    assert.match(never.reason, /never diagnosed/);
  });

  it("goes stale with age, because the dependency tree moves under it", () => {
    assert.equal(assessFreshness(input({ diagnosedAt: daysAgo(29) })).stale, false);
    assert.equal(assessFreshness(input({ diagnosedAt: daysAgo(30) })).stale, true);
  });

  it("goes stale with churn, because file-level findings name files that moved", () => {
    assert.equal(assessFreshness(input({ commitsSince: 49 })).stale, false);
    const churned = assessFreshness(input({ commitsSince: 50 }));
    assert.equal(churned.stale, true);
    assert.match(churned.reason, /50 commits/);
  });

  it("is stale when HEAD moved and the distance cannot be computed", () => {
    // A rebase or force-push leaves the recorded commit outside this history entirely, which is a
    // reason to re-diagnose rather than a number to guess at.
    const rebased = assessFreshness(input({ headCommit: "def5678", commitsSince: null }));
    assert.equal(rebased.stale, true);
  });

  it("tolerates an unparseable timestamp rather than reporting stale on nonsense", () => {
    assert.equal(assessFreshness(input({ diagnosedAt: "not a date" })).stale, false);
  });
});

describe("buildWorklist", () => {
  it("marks nothing done on a fresh state", () => {
    assert.deepEqual(
      buildWorklist(emptyState()).map((item) => item.done),
      [false, false, false, false, false, false],
    );
  });

  it("marks diagnose done once a diagnosis has been recorded", () => {
    const state = { ...emptyState(), diagnosedAt: NOW.toISOString() };
    assert.equal(buildWorklist(state)[0]?.done, true);
  });

  it("does not mark drain done while the backlog is non-empty", () => {
    const frozen = {
      ...applyRuleCounts(emptyState(), { "no-any": 3 }, "freeze"),
      frozenAt: NOW.toISOString(),
    };
    const drain = buildWorklist(frozen).find((item) => item.label.startsWith("P3"));
    assert.equal(drain?.done, false);
    assert.match(drain?.detail ?? "", /3 violations/);
  });

  it("marks drain done when the backlog reaches zero", () => {
    const frozen = applyRuleCounts(emptyState(), { "no-any": 3 }, "freeze");
    const drained = { ...applyRuleCounts(frozen, {}, "observe"), frozenAt: NOW.toISOString() };
    assert.equal(buildWorklist(drained).find((item) => item.label.startsWith("P3"))?.done, true);
  });

  it("lists the smallest backlogs as the children to work first", () => {
    const frozen = {
      ...applyRuleCounts(emptyState(), { big: 9, small: 1 }, "freeze"),
      frozenAt: NOW.toISOString(),
    };
    const children = buildWorklist(frozen).find((item) => item.label.startsWith("P3"))?.children;
    assert.match(children?.[0] ?? "", /small/);
  });
});

describe("appendLog", () => {
  it("stamps each entry and keeps them in order", () => {
    const one = appendLog(emptyState(), {
      kind: "deferred",
      text: "split the big file",
      commit: "a",
    });
    const two = appendLog(one, { kind: "drained", text: "max-depth to zero", commit: "b" });
    assert.equal(two.log.length, 2);
    assert.equal(two.log[1]?.text, "max-depth to zero");
    assert.ok(two.log[0]?.at);
  });

  it("filters by kind, which is how the carried-over section is built", () => {
    const state = appendLog(appendLog(emptyState(), { kind: "deferred", text: "d", commit: "a" }), {
      kind: "note",
      text: "n",
      commit: "b",
    });
    assert.deepEqual(
      logOfKind(state, "deferred").map((entry) => entry.text),
      ["d"],
    );
  });

  it("stays bounded, because every command reads this file whole", () => {
    let state = emptyState();
    for (let index = 0; index < 250; index += 1) {
      state = appendLog(state, { kind: "note", text: `entry ${index}`, commit: null });
    }
    assert.equal(state.log.length, 200);
    assert.equal(state.log[199]?.text, "entry 249");
  });
});
