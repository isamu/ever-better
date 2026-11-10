import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it } from "node:test";
import { formatterPath } from "../src/eslintRunner.ts";

type Message = { ruleId: string | null; severity: number; line?: number; column?: number; message?: string };
type Result = { filePath: string; messages: Message[]; suppressedMessages?: Message[] };
type Formatter = (results: readonly Result[], context?: { cwd: string }) => string;

const CWD = "/repo";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isFormatterModule = (value: unknown): value is { default: Formatter } => isRecord(value) && typeof value["default"] === "function";

/**
 * `pathToFileURL`, not the path. On Windows an absolute path starts with a drive letter, and the
 * ESM loader reads `D:` as a URL scheme it does not support — a failure that cannot happen on the
 * machine this was written on. ESLint itself takes the plain path via `--format`, so only the test
 * needs the URL.
 */
const load = async (): Promise<Formatter> => {
  const loaded: unknown = await import(pathToFileURL(formatterPath()).href);
  assert.ok(isFormatterModule(loaded), "the formatter has no default export");
  return loaded.default;
};

const file = (relative: string, messages: Message[], suppressed: Message[] = []): Result => ({
  filePath: path.join(CWD, relative),
  messages,
  suppressedMessages: suppressed,
});

const error = (ruleId: string | null): Message => ({ ruleId, severity: 2 });
const warning = (ruleId: string): Message => ({ ruleId, severity: 1 });

const report = async (results: readonly Result[]): Promise<Record<string, unknown>> => {
  const formatter = await load();
  const parsed: unknown = JSON.parse(formatter(results, { cwd: CWD }));
  assert.ok(isRecord(parsed), "the formatter did not emit an object");
  return parsed;
};

/**
 * The formatter every count in this tool comes from — `freeze`, `prune` and `check` all read it —
 * and it had no test of its own. It is a plain function of its arguments, so it is driven directly
 * rather than through a lint run.
 */
describe("rule-counts formatter", () => {
  it("separates the three buckets, which mean three different things", async () => {
    const parsed = await report([file("src/a.ts", [error("no-var"), warning("camelcase")], [error("max-lines")])]);
    assert.deepEqual(parsed["errors"], { "no-var": 1 });
    assert.deepEqual(parsed["warnings"], { camelcase: 1 });
    assert.deepEqual(parsed["suppressed"], { "max-lines": 1 });
    assert.equal(parsed["files"], 1);
  });

  it("names an unattributed error rather than counting it into nothing", async () => {
    const parsed = await report([file("src/a.ts", [{ ruleId: null, severity: 2, line: 3, message: "Parsing error" }])]);
    assert.deepEqual(parsed["errors"], { "(parse error)": 1 });
    assert.deepEqual(parsed["unattributed"], [{ file: path.join(CWD, "src/a.ts"), line: 3, message: "Parsing error" }]);
  });

  it("caps the unattributed sample so the output stays a constant size", async () => {
    const parse = (): Message => ({ ruleId: null, severity: 2, line: 1, message: "Parsing error" });
    const parsed = await report([file("src/a.ts", [parse(), parse(), parse(), parse(), parse()])]);
    const sample = parsed["unattributed"];
    assert.ok(Array.isArray(sample));
    assert.equal(sample.length, 3);
    assert.deepEqual(parsed["errors"], { "(parse error)": 5 });
  });
});

describe("rule-counts formatter, error locations", () => {
  const at = (ruleId: string | null, severity: number, line: number): Message => ({ ruleId, severity, line, column: 2, message: `bad at ${line}` });

  it("lists each unsuppressed error relative to the cwd, with its rule and message", async () => {
    const parsed = await report([file("src/nested/a.ts", [at("no-var", 2, 4)]), file("b.ts", [at(null, 2, 1)])]);
    assert.deepEqual(parsed["locations"], [
      { file: "src/nested/a.ts", line: 4, column: 2, ruleId: "no-var", message: "bad at 4" },
      { file: "b.ts", line: 1, column: 2, ruleId: null, message: "bad at 1" },
    ]);
  });

  it("never lists a warning or a suppressed finding, which are the large sets", async () => {
    const parsed = await report([file("src/a.ts", [at("camelcase", 1, 1)], [at("max-lines", 2, 1)])]);
    assert.deepEqual(parsed["locations"], []);
  });

  it("caps the list so a bad run cannot grow the output without bound", async () => {
    const many = Array.from({ length: 500 }, (_, index) => at("no-var", 2, index + 1));
    const parsed = await report([file("src/a.ts", many)]);
    const locations = parsed["locations"];
    assert.ok(Array.isArray(locations));
    assert.equal(locations.length, 50);
    assert.deepEqual(parsed["errors"], { "no-var": 500 });
  });
});

const lcg = (seed: number): (() => number) => {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
};

const SEED = 20261110;
const CASES = 1000;
const LOCATION_LIMIT = 50;
const GENERATED_RULES = ["no-var", "camelcase", null, "@typescript-eslint/no-explicit-any"];
const GENERATED_FILES = ["a.ts", "src/a.ts", "src/deep/b.ts", "test/c.ts"];

const generatedResults = (random: () => number): Result[] => {
  const pick = <T>(items: readonly T[], fallback: T): T => items[Math.floor(random() * items.length)] ?? fallback;
  const message = (): Message => ({ ruleId: pick(GENERATED_RULES, null), severity: pick([1, 2], 2), line: 1, column: 1, message: "m" });
  const messages = (most: number): Message[] => Array.from({ length: Math.floor(random() * most) }, message);
  return Array.from({ length: Math.floor(random() * 6) }, () => file(pick(GENERATED_FILES, "a.ts"), messages(30), messages(5)));
};

describe("rule-counts formatter over generated inputs", () => {
  it(`lists every unsuppressed error up to the cap, and nothing else (seed ${SEED})`, async () => {
    const random = lcg(SEED);
    for (let index = 0; index < CASES; index += 1) {
      const results = generatedResults(random);
      const parsed = await report(results);
      const errorTotal = results.flatMap((result) => result.messages).filter((message) => message.severity === 2).length;
      const locations = parsed["locations"];
      assert.ok(Array.isArray(locations));
      assert.equal(locations.length, Math.min(errorTotal, LOCATION_LIMIT));
      assert.ok(isRecord(parsed["errors"]));
      assert.equal(
        Object.values(parsed["errors"]).reduce((sum: number, count) => sum + Number(count), 0),
        errorTotal,
      );
    }
  });
});

describe("rule-counts formatter, by area", () => {
  it("groups by the top-level directory", async () => {
    const parsed = await report([
      file("src/a.ts", [warning("camelcase")]),
      file("src/nested/deep/b.ts", [warning("camelcase")]),
      file("test/c.ts", [warning("camelcase")]),
    ]);
    assert.deepEqual(parsed["areas"], {
      errors: {},
      warnings: { src: { camelcase: 2 }, test: { camelcase: 1 } },
      suppressed: {},
    });
  });

  it("calls a file at the repository root what it is", async () => {
    const parsed = await report([file("eslint.config.js", [warning("camelcase")])]);
    assert.deepEqual(parsed["areas"], { errors: {}, warnings: { "(root)": { camelcase: 1 } }, suppressed: {} });
  });

  it("breaks suppressed violations down as well, since they are the backlog", async () => {
    const parsed = await report([file("server/a.ts", [], [error("max-lines"), error("max-lines"), error("complexity")])]);
    assert.deepEqual(parsed["areas"], {
      errors: {},
      warnings: {},
      suppressed: { server: { "max-lines": 2, complexity: 1 } },
    });
  });

  /** Bounded by areas x rules is the whole reason this is computed here rather than from JSON. */
  it("stays the same size however many violations there are", async () => {
    const many = Array.from({ length: 500 }, () => warning("camelcase"));
    const parsed = await report([file("src/a.ts", many)]);
    assert.deepEqual(parsed["areas"], { errors: {}, warnings: { src: { camelcase: 500 } }, suppressed: {} });
  });
});
