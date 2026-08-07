/**
 * ESLint formatter that prints one small JSON object of per-rule counts instead of the full result
 * set. Passed to `eslint --format <abs path>` by the `ever-better` CLI.
 *
 * Why not `--format json` and count afterwards: that output grows with the number of violations,
 * and a first run on an untouched repository is exactly when it is largest. Counting inside the
 * formatter keeps what crosses the process boundary constant no matter how bad the repo is.
 *
 * `suppressed` is the interesting half. After `eslint --suppress-all` the active count is zero by
 * construction and the suppressed count IS the backlog — the number that has to fall.
 *
 * Plain JavaScript on purpose — it must load identically whether the CLI runs from `dist/` or
 * straight from TypeScript source, so it is never part of a build.
 */
const tally = (target, ruleId) => {
  const key = ruleId ?? "(parse error)";
  target[key] = (target[key] ?? 0) + 1;
};

export default function ruleCounts(results) {
  const active = {};
  const suppressed = {};
  let errors = 0;
  let warnings = 0;

  for (const result of results) {
    for (const message of result.messages) {
      tally(active, message.ruleId);
      if (message.severity === 2) errors += 1;
      else warnings += 1;
    }
    for (const message of result.suppressedMessages ?? []) {
      tally(suppressed, message.ruleId);
    }
  }

  return JSON.stringify({ active, suppressed, errors, warnings, files: results.length });
}
