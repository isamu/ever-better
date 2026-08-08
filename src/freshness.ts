/**
 * A diagnosis is a photograph, and the repository keeps moving. An agent picking the ledger up
 * weeks later has no way to tell whether "23 files over the limit" is today's number or one taken
 * before a rewrite — so the ledger records WHEN and AT WHICH COMMIT it was taken, and this decides
 * whether it can still be trusted.
 */
export type FreshnessInput = {
  diagnosedAt: string | null;
  diagnosedCommit: string | null;
  headCommit: string | null;
  /** Commits on HEAD that the diagnosis never saw. Null when it could not be computed. */
  commitsSince: number | null;
  now: Date;
};

export type Freshness = {
  stale: boolean;
  reason: string;
};

/** Enough churn that any file-level observation is likely to name something that has moved. */
const STALE_COMMIT_COUNT = 50;

/** Long enough that the dependency tree, and therefore the rule set, has probably changed. */
const STALE_DAY_COUNT = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysBetween = (from: string, to: Date): number | null => {
  const start = Date.parse(from);
  return Number.isNaN(start) ? null : Math.floor((to.getTime() - start) / MS_PER_DAY);
};

export const assessFreshness = (input: FreshnessInput): Freshness => {
  if (!input.diagnosedAt || !input.diagnosedCommit) {
    return { stale: true, reason: "never diagnosed — run `ever-better diagnose --write` first" };
  }
  const age = daysBetween(input.diagnosedAt, input.now);
  if (age !== null && age >= STALE_DAY_COUNT) {
    return {
      stale: true,
      reason: `diagnosis is ${age} days old; re-run diagnose before trusting it`,
    };
  }
  if (input.commitsSince !== null && input.commitsSince >= STALE_COMMIT_COUNT) {
    return {
      stale: true,
      reason: `${input.commitsSince} commits since the diagnosis; re-run diagnose before trusting it`,
    };
  }
  if (input.headCommit && input.headCommit !== input.diagnosedCommit && input.commitsSince === null) {
    return { stale: true, reason: "HEAD moved since the diagnosis and the distance is unknown" };
  }
  return { stale: false, reason: "current" };
};
