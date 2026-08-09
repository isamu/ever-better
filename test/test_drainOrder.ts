import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDrainPlan, cheapestFirst, directoryTails, heaviestFiles, ruleSpread, totalsOf } from "../src/drainOrder.ts";
import { parseSuppressions, type Suppression } from "../src/suppressionsFile.ts";

const entry = (file: string, rule: string, count: number): Suppression => ({ file, rule, count });

const SAMPLE: Suppression[] = [
  entry("src/util/text.ts", "no-explicit-any", 2),
  entry("src/util/time.ts", "no-explicit-any", 40),
  entry("src/api/client.ts", "no-unsafe-argument", 1),
  entry("src/api/client.ts", "no-explicit-any", 7),
  entry("src/api/client.ts", "max-depth", 3),
  entry("index.ts", "max-depth", 1),
];

describe("parseSuppressions", () => {
  it("flattens the file/rule/count shape ESLint writes", () => {
    const parsed = parseSuppressions({ "src/a.ts": { "no-explicit-any": { count: 3 } } });
    assert.deepEqual(parsed, [entry("src/a.ts", "no-explicit-any", 3)]);
  });

  it("normalises the separator so a baseline frozen on Windows groups the same way", () => {
    const parsed = parseSuppressions({ "src\\util\\text.ts": { "max-depth": { count: 1 } } });
    assert.equal(parsed[0]?.file, "src/util/text.ts");
  });

  it("drops entries that are not counts rather than throwing", () => {
    assert.deepEqual(parseSuppressions({ "src/a.ts": { rule: "nonsense" } }), []);
    assert.deepEqual(parseSuppressions({ "src/a.ts": null }), []);
    assert.deepEqual(parseSuppressions("nonsense"), []);
  });
});

describe("totalsOf", () => {
  it("counts violations, distinct files and distinct rules", () => {
    assert.deepEqual(totalsOf(SAMPLE), { violations: 54, files: 4, rules: 3 });
  });

  it("is zero for an empty backlog", () => {
    assert.deepEqual(totalsOf([]), { violations: 0, files: 0, rules: 0 });
  });
});

describe("cheapestFirst", () => {
  it("keeps only what one or two edits would clear, smallest first", () => {
    assert.deepEqual(
      cheapestFirst(SAMPLE).map((item) => [item.file, item.count]),
      [
        ["index.ts", 1],
        ["src/api/client.ts", 1],
        ["src/util/text.ts", 2],
      ],
    );
  });

  it("breaks ties by file then rule, so two runs agree", () => {
    const tied = [entry("b.ts", "z-rule", 1), entry("a.ts", "b-rule", 1), entry("a.ts", "a-rule", 1)];
    assert.deepEqual(
      cheapestFirst(tied).map((item) => `${item.file} ${item.rule}`),
      ["a.ts a-rule", "a.ts b-rule", "b.ts z-rule"],
    );
  });

  it("takes the limit from the caller", () => {
    assert.equal(cheapestFirst(SAMPLE, 3).length, 4);
  });
});

describe("ruleSpread", () => {
  it("counts violations and files per rule", () => {
    assert.deepEqual(ruleSpread(SAMPLE), [
      { rule: "no-unsafe-argument", violations: 1, files: 1 },
      { rule: "max-depth", violations: 4, files: 2 },
      { rule: "no-explicit-any", violations: 49, files: 3 },
    ]);
  });

  /**
   * The whole point of the command, so the fixture has to disagree with the old ordering: 80
   * violations in two files is one afternoon, 3 across three files is three separate edits.
   */
  it("ranks by files to touch, which is not the order violation count gives", () => {
    const mixed = [
      entry("a.ts", "concentrated", 40),
      entry("b.ts", "concentrated", 40),
      entry("c.ts", "scattered", 1),
      entry("d.ts", "scattered", 1),
      entry("e.ts", "scattered", 1),
    ];
    assert.deepEqual(
      ruleSpread(mixed).map((rule) => rule.rule),
      ["concentrated", "scattered"],
    );
  });
});

describe("directoryTails", () => {
  it("reports the last files carrying a rule in a directory", () => {
    const tails = directoryTails(SAMPLE);
    assert.deepEqual(
      tails.map((tail) => `${tail.directory} ${tail.rule} ${tail.files.join(",")}`),
      [
        "(root) max-depth index.ts",
        "src/api no-unsafe-argument src/api/client.ts",
        "src/api max-depth src/api/client.ts",
        "src/api no-explicit-any src/api/client.ts",
        "src/util no-explicit-any src/util/text.ts,src/util/time.ts",
      ],
    );
  });

  it("drops a directory where the rule is still everywhere", () => {
    const spread = [entry("src/a.ts", "r", 1), entry("src/b.ts", "r", 1), entry("src/c.ts", "r", 1)];
    assert.deepEqual(directoryTails(spread), []);
  });
});

describe("heaviestFiles", () => {
  it("puts the redesigns last in the work and first in the warning", () => {
    assert.deepEqual(heaviestFiles(SAMPLE, 2), [
      { file: "src/util/time.ts", rules: 1, violations: 40 },
      { file: "src/api/client.ts", rules: 3, violations: 11 },
    ]);
  });

  /** Naming a file the section above just called cheap tells the reader both and neither. */
  it("never lists a file that one or two edits would clear", () => {
    const cheap = [entry("a.ts", "one", 1), entry("a.ts", "two", 1), entry("b.ts", "one", 3)];
    assert.deepEqual(
      heaviestFiles(cheap).map((file) => file.file),
      ["b.ts"],
    );
  });
});

describe("buildDrainPlan", () => {
  it("is empty and total-free for a repository with nothing suppressed", () => {
    assert.deepEqual(buildDrainPlan([]), {
      totals: { violations: 0, files: 0, rules: 0 },
      takeFirst: [],
      rules: [],
      directoryTails: [],
      heaviest: [],
    });
  });

  it("carries every cheap entry, so the renderer can say how many it hid", () => {
    assert.equal(buildDrainPlan(SAMPLE).takeFirst.length, 3);
  });
});
