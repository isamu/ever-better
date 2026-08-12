import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RuleCounts } from "../src/eslintRunner.ts";
import { areaOf, buildLintReport, matrixFromSuppressions } from "../src/lintReport.ts";
import { renderLintReport } from "../src/render/lintReport.ts";
import type { Suppression } from "../src/suppressionsFile.ts";

const counts = (overrides: Partial<RuleCounts> = {}): RuleCounts => ({
  errors: {},
  warnings: {},
  suppressed: {},
  files: 10,
  ...overrides,
});

const entry = (file: string, rule: string, count: number): Suppression => ({ file, rule, count });

describe("areaOf", () => {
  it("is the top-level directory", () => {
    assert.equal(areaOf("src/util/text.ts"), "src");
    assert.equal(areaOf("test/a.ts"), "test");
  });

  it("names the repository root rather than returning nothing", () => {
    assert.equal(areaOf("eslint.config.js"), "(root)");
    assert.equal(areaOf(""), "(root)");
  });
});

describe("matrixFromSuppressions", () => {
  it("folds file counts up into their area", () => {
    const matrix = matrixFromSuppressions([entry("src/a.ts", "no-var", 2), entry("src/b.ts", "no-var", 3), entry("test/c.ts", "no-var", 1)]);
    assert.deepEqual(matrix, { src: { "no-var": 5 }, test: { "no-var": 1 } });
  });
});

describe("buildLintReport", () => {
  /** The point of the whole command: the same rule in two places is two different jobs. */
  it("puts rules against areas, heaviest rule first", () => {
    const report = buildLintReport(
      counts({
        areas: { errors: {}, warnings: {}, suppressed: { src: { "max-lines": 7, complexity: 1 }, test: { complexity: 4 } } },
      }),
      [],
    );
    const section = report.sections[0];
    assert.equal(section?.title.startsWith("Backlog"), true);
    assert.deepEqual(section?.areas, ["src", "test"]);
    assert.deepEqual(
      section?.rows.map((row) => [row.rule, row.total, row.counts]),
      [
        ["max-lines", 7, [7, 0]],
        ["complexity", 5, [1, 4]],
      ],
    );
  });

  /**
   * Warnings are the population nothing else maps: ESLint's suppressions cover errors only, so the
   * ledger holds one grand total for them and no rule ever appears.
   */
  it("gives warnings their own section", () => {
    const report = buildLintReport(counts({ warnings: { camelcase: 3 }, areas: { errors: {}, warnings: { src: { camelcase: 3 } }, suppressed: {} } }), []);
    assert.equal(report.warningTotal, 3);
    assert.equal(report.sections.length, 1);
    assert.match(report.sections[0]?.title ?? "", /never suppressed/);
  });

  it("lists errors as totals rather than a matrix", () => {
    const report = buildLintReport(counts({ errors: { "no-var": 2, "no-debugger": 5 } }), []);
    assert.deepEqual(report.errors, [
      { rule: "no-debugger", count: 5 },
      { rule: "no-var", count: 2 },
    ]);
  });

  it("falls back to the ratchet file when ESLint could not run", () => {
    const report = buildLintReport(null, [entry("src/a.ts", "no-var", 2)], "eslint is not installed");
    assert.equal(report.suppressedTotal, 2);
    assert.equal(report.lintFailure, "eslint is not installed");
    assert.equal(report.warningTotal, 0);
  });

  it("does not claim a lint failure when the lint succeeded and found nothing", () => {
    assert.equal(buildLintReport(counts(), []).lintFailure, null);
  });

  /** A lint run's own area data wins: the ratchet file cannot see warnings at all. */
  it("prefers the lint run's suppressed matrix over the file", () => {
    const report = buildLintReport(counts({ areas: { errors: {}, warnings: {}, suppressed: { src: { "no-var": 9 } } } }), [entry("test/a.ts", "no-var", 1)]);
    assert.deepEqual(report.sections[0]?.areas, ["src"]);
    assert.equal(report.suppressedTotal, 9);
  });
});

describe("renderLintReport", () => {
  it("says so plainly when there is nothing to report", () => {
    assert.match(renderLintReport(buildLintReport(counts(), [])), /Nothing to report/);
  });

  it("marks a backlog-only report so it cannot read as a clean lint", () => {
    const markdown = renderLintReport(buildLintReport(null, [entry("src/a.ts", "no-var", 1)], "eslint is not installed"));
    assert.match(markdown, /ratchet file alone/);
    assert.match(markdown, /eslint is not installed/);
  });

  it("renders a table a human can read", () => {
    const markdown = renderLintReport(buildLintReport(counts({ areas: { errors: {}, warnings: {}, suppressed: { src: { "max-lines": 7 } } } }), []));
    assert.match(markdown, /\| rule \| src \| total \| \|/);
    assert.match(markdown, /\| `max-lines` \| 7 \| \*\*7\*\* \| █+ \|/);
  });

  /** A table that silently showed its first rows would read as the whole list. */
  it("says how many rows and areas it did not show", () => {
    const suppressed = Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`area${index}`, { [`rule${index}`]: index + 1 }]));
    const markdown = renderLintReport(buildLintReport(counts({ areas: { errors: {}, warnings: {}, suppressed } }), []));
    assert.match(markdown, /3 more/);
  });
});
