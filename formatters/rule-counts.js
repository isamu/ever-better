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

const relativePath = (filePath, cwd) => path.relative(cwd, filePath).split(path.sep).join("/");

/**
 * The top-level directory a file sits in — `src`, `test`, `server`. Aggregated here for the same
 * reason the counts are: an area breakdown built from `--format json` would carry every violation
 * across the process boundary, while this stays bounded by areas x rules however bad the repo is.
 *
 * `context.cwd` is where ESLint ran, and `filePath` is absolute; both verified against ESLint 10
 * rather than assumed.
 */
const areaOf = (filePath, cwd) => {
  const [first, ...rest] = relativePath(filePath, cwd).split("/");
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

/**
 * Where each unsuppressed error is, so a failing `check` can be acted on without a second lint run.
 * Errors only: after a freeze there are normally none, and a failing run has a handful. Suppressed
 * findings and warnings are the large sets, and listing them would undo the constant-size output.
 */
const LOCATION_LIMIT = 50;

const locationOf = (message, file) => ({
  file,
  line: message.line ?? 0,
  column: message.column ?? 0,
  ruleId: message.ruleId ?? null,
  message: message.message ?? "",
});

const tally = (target, ruleId) => {
  const key = ruleId ?? "(parse error)";
  target[key] = (target[key] ?? 0) + 1;
};

const tallyMessage = (report, message, result, area, cwd) => {
  const failing = message.severity === ERROR_SEVERITY;
  tally(failing ? report.errors : report.warnings, message.ruleId);
  tallyArea(failing ? report.areas.errors : report.areas.warnings, area, message.ruleId);
  if (!failing) return;
  const unnamed = message.ruleId === null || message.ruleId === undefined;
  if (unnamed && report.unattributed.length < UNATTRIBUTED_SAMPLE_LIMIT) {
    report.unattributed.push({ file: result.filePath, line: message.line ?? 0, message: message.message });
  }
  if (report.locations.length < LOCATION_LIMIT) {
    report.locations.push(locationOf(message, relativePath(result.filePath, cwd)));
  }
};

export default function ruleCounts(results, context) {
  const report = {
    errors: {},
    warnings: {},
    suppressed: {},
    unattributed: [],
    locations: [],
    areas: { errors: {}, warnings: {}, suppressed: {} },
    files: results.length,
  };
  const cwd = context?.cwd ?? process.cwd();

  for (const result of results) {
    const area = areaOf(result.filePath, cwd);
    for (const message of result.messages) {
      tallyMessage(report, message, result, area, cwd);
    }
    for (const message of result.suppressedMessages ?? []) {
      tally(report.suppressed, message.ruleId);
      tallyArea(report.areas.suppressed, area, message.ruleId);
    }
  }

  return JSON.stringify(report);
}
