import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { describe, it } from "node:test";
import { argsAfterTerminator, parseEslintPassThrough } from "../src/eslintPassThrough.ts";

const accepted = (args: string[]): string[] => {
  const result = parseEslintPassThrough(args);
  assert.ok(result.ok, result.ok ? "" : result.message);
  return result.args;
};

const refusal = (args: string[]): string => {
  const result = parseEslintPassThrough(args);
  if (result.ok) assert.fail(`accepted ${JSON.stringify(args)}`);
  return result.message;
};

describe("parseEslintPassThrough", () => {
  it("forwards nothing when nothing was given", () => {
    assert.deepEqual(accepted([]), []);
  });

  it("accepts --concurrency as one token or two, and forwards one form", () => {
    assert.deepEqual(accepted(["--concurrency=4"]), ["--concurrency=4"]);
    assert.deepEqual(accepted(["--concurrency", "4"]), ["--concurrency=4"]);
    assert.deepEqual(accepted(["--concurrency=auto"]), ["--concurrency=auto"]);
    assert.deepEqual(accepted(["--concurrency", "off"]), ["--concurrency=off"]);
  });

  it("accepts every number ESLint accepts, forwarded as ESLint reads it", () => {
    assert.deepEqual(accepted(["--concurrency=04"]), ["--concurrency=4"]);
    assert.deepEqual(accepted(["--concurrency", "4.0"]), ["--concurrency=4"]);
    assert.deepEqual(accepted(["--concurrency= 8 "]), ["--concurrency=8"]);
    assert.deepEqual(accepted(["--concurrency=1e21"]), ["--concurrency=1e+21"]);
  });

  it("refuses a value ESLint would not take, naming it", () => {
    ["0", "-1", "1.5", "AUTO", "", " ", "two", "NaN", "Infinity", "9".repeat(400), "--fix"].forEach((value) => {
      assert.match(refusal([`--concurrency=${value}`]), /--concurrency needs a positive integer, auto or off/);
    });
    assert.match(refusal(["--concurrency"]), /got `nothing`/);
  });

  it("refuses --concurrency given twice rather than guessing which wins", () => {
    assert.match(refusal(["--concurrency=2", "--concurrency=4"]), /more than once/);
    assert.match(refusal(["--concurrency", "2", "--concurrency", "4"]), /more than once/);
  });

  /** Each of these changes what is counted or how the run is read, so none may reach the runner. */
  it("refuses every argument that is not on the list, the ones that break the counts included", () => {
    [
      "--format=json",
      "--suppress-all",
      "--suppressions-location=x",
      "--fix",
      "--quiet",
      "--rule",
      "--config",
      "--max-warnings=0",
      "--cache",
      "src",
      "-c",
    ].forEach((arg) => {
      assert.match(refusal([arg]), new RegExp(`Refusing to pass \`${arg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\``));
    });
  });

  it("refuses anything that follows an accepted --concurrency", () => {
    assert.match(refusal(["--concurrency=2", "--fix"]), /Refusing to pass `--fix`/);
    assert.match(refusal(["--concurrency", "2", "src"]), /Refusing to pass `src`/);
  });

  it("says what is accepted whenever it refuses", () => {
    assert.match(refusal(["--fix"]), /Only --concurrency=<n\|auto\|off> may follow `--`/);
  });
});

const tokensOf = (args: string[]) =>
  parseArgs({ args, options: { write: { type: "boolean" }, cwd: { type: "string" } }, allowPositionals: true, tokens: true }).tokens;

describe("argsAfterTerminator", () => {
  it("takes the positionals after --, and leaves the command and its flags alone", () => {
    assert.deepEqual(argsAfterTerminator(tokensOf(["check", "--write", "--", "--concurrency=2"])), ["--concurrency=2"]);
    assert.deepEqual(argsAfterTerminator(tokensOf(["check", "--cwd", "x", "--", "--concurrency", "2"])), ["--concurrency", "2"]);
  });

  it("is empty without --, so a bare word is never forwarded", () => {
    assert.deepEqual(argsAfterTerminator(tokensOf(["log", "some", "text"])), []);
  });

  it("is empty after a trailing --", () => {
    assert.deepEqual(argsAfterTerminator(tokensOf(["check", "--"])), []);
  });

  it("forwards a second -- as an argument, which the rule then refuses", () => {
    const after = argsAfterTerminator(tokensOf(["check", "--", "--", "--concurrency=2"]));
    assert.deepEqual(after, ["--", "--concurrency=2"]);
    assert.equal(parseEslintPassThrough(after).ok, false);
  });
});
