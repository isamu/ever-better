/**
 * ESLint formatter that prints one small JSON object of per-rule counts instead of the full result
 * set. Passed to `eslint --format <abs path>` by the `ever-better` CLI.
 *
 * Why not `--format json` and count afterwards: that output grows with the number of violations,
 * and a first run on an untouched repository is exactly when it is largest. Counting inside the
 * formatter keeps what crosses the process boundary constant no matter how bad the repo is.
 *
 * Three buckets, because they mean three different things:
 *   suppressed  — recorded by `--suppress-all`; the backlog, which has to fall
 *   errors      — nothing recorded them, so they are new; the build gate
 *   warnings    — NOT suppressible by ESLint at all, so they are permanently visible and are
 *                 ratcheted by ever-better's own counter instead
 *
 * Plain JavaScript on purpose — it must load identically whether the CLI runs from `dist/` or
 * straight from TypeScript source, so it is never part of a build.
 */
const ERROR_SEVERITY = 2;

const tally = (target, ruleId) => {
  const key = ruleId ?? "(parse error)";
  target[key] = (target[key] ?? 0) + 1;
};

export default function ruleCounts(results) {
  const errors = {};
  const warnings = {};
  const suppressed = {};

  for (const result of results) {
    for (const message of result.messages) {
      tally(message.severity === ERROR_SEVERITY ? errors : warnings, message.ruleId);
    }
    for (const message of result.suppressedMessages ?? []) {
      tally(suppressed, message.ruleId);
    }
  }

  return JSON.stringify({ errors, warnings, suppressed, files: results.length });
}
