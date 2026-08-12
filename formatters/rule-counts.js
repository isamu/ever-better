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
import path from "node:path";

const ERROR_SEVERITY = 2;

/** A file at the repository root belongs to no directory, and "" reads as missing data. */
const ROOT_AREA = "(root)";

/**
 * The top-level directory a file sits in — `src`, `test`, `server`. Aggregated here for the same
 * reason the counts are: an area breakdown built from `--format json` would carry every violation
 * across the process boundary, while this stays bounded by areas x rules however bad the repo is.
 *
 * `context.cwd` is where ESLint ran, and `filePath` is absolute; both verified against ESLint 10
 * rather than assumed.
 */
const areaOf = (filePath, cwd) => {
  const relative = path.relative(cwd, filePath).split(path.sep).join("/");
  const [first, ...rest] = relative.split("/");
  return rest.length === 0 || first === undefined || first === "" ? ROOT_AREA : first;
};

const tallyArea = (target, area, ruleId) => {
  const key = ruleId ?? "(parse error)";
  const rules = (target[area] ??= {});
  rules[key] = (rules[key] ?? 0) + 1;
};

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

export default function ruleCounts(results, context) {
  const errors = {};
  const warnings = {};
  const suppressed = {};
  const unattributed = [];
  const areas = { errors: {}, warnings: {}, suppressed: {} };
  const cwd = context?.cwd ?? process.cwd();

  for (const result of results) {
    const area = areaOf(result.filePath, cwd);
    for (const message of result.messages) {
      const failing = message.severity === ERROR_SEVERITY;
      tally(failing ? errors : warnings, message.ruleId);
      tallyArea(failing ? areas.errors : areas.warnings, area, message.ruleId);
      const unnamed = message.ruleId === null || message.ruleId === undefined;
      if (unnamed && failing && unattributed.length < UNATTRIBUTED_SAMPLE_LIMIT) {
        unattributed.push({ file: result.filePath, line: message.line ?? 0, message: message.message });
      }
    }
    for (const message of result.suppressedMessages ?? []) {
      tally(suppressed, message.ruleId);
      tallyArea(areas.suppressed, area, message.ruleId);
    }
  }

  return JSON.stringify({ errors, warnings, suppressed, unattributed, areas, files: results.length });
}
