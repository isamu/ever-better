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

/**
 * A message with no `ruleId` is a parse or config error, which `--suppress-all` cannot record — so
 * it fails the build, and the count alone says nothing about where. A few examples are enough to
 * act on, and the cap keeps this output constant-size the way the counts already are.
 */
const UNATTRIBUTED_SAMPLE_LIMIT = 3;

const tally = (target, ruleId) => {
  const key = ruleId ?? "(parse error)";
  target[key] = (target[key] ?? 0) + 1;
};

export default function ruleCounts(results) {
  const errors = {};
  const warnings = {};
  const suppressed = {};
  const unattributed = [];

  for (const result of results) {
    for (const message of result.messages) {
      tally(message.severity === ERROR_SEVERITY ? errors : warnings, message.ruleId);
      const unnamed = message.ruleId === null || message.ruleId === undefined;
      if (unnamed && message.severity === ERROR_SEVERITY && unattributed.length < UNATTRIBUTED_SAMPLE_LIMIT) {
        unattributed.push({ file: result.filePath, line: message.line ?? 0, message: message.message });
      }
    }
    for (const message of result.suppressedMessages ?? []) {
      tally(suppressed, message.ruleId);
    }
  }

  return JSON.stringify({ errors, warnings, suppressed, unattributed, files: results.length });
}
