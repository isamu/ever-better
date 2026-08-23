import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findWeakRules, isRuleOff, isRuleWarnOnly, HIGH_VALUE_RULES } from "../src/probe/effectiveRules.ts";
import { findMissingStrictness, isStrictOff, projectForSample, referencePaths } from "../src/probe/effectiveTsconfig.ts";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gatherProbes, sampleSourceFile } from "../src/probe/gather.ts";
import type { SourceFile } from "../src/types.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const file = (path: string): SourceFile => ({
  path,
  ext: path.split(".").pop() ?? "",
  lines: 10,
});

describe("rule severity", () => {
  it("reads both the bare level and the [level, options] form", () => {
    assert.equal(isRuleOff("off"), true);
    assert.equal(isRuleOff(0), true);
    assert.equal(isRuleOff(["off", { max: 5 }]), true);
    assert.equal(isRuleOff(["error", { max: 5 }]), false);
  });

  it("treats a rule ESLint never mentioned as off", () => {
    assert.equal(isRuleOff(undefined), true);
  });

  it("separates warn from error, because warn enforces nothing", () => {
    assert.equal(isRuleWarnOnly("warn"), true);
    assert.equal(isRuleWarnOnly(1), true);
    assert.equal(isRuleWarnOnly("error"), false);
    assert.equal(isRuleWarnOnly(["warn", { max: 5 }]), true);
  });
});

describe("findWeakRules", () => {
  const allOn = Object.fromEntries(HIGH_VALUE_RULES.map((rule) => [rule.name, "error"]));

  it("reports nothing when every rule is an error", () => {
    assert.deepEqual(findWeakRules({ rules: allOn }), []);
  });

  it("reports a rule ESLint did not mention at all", () => {
    const rules = { ...allOn };
    delete rules[HIGH_VALUE_RULES[0]?.name ?? ""];
    const weak = findWeakRules({ rules });
    assert.equal(weak.length, 1);
    assert.equal(weak[0]?.state, "off");
  });

  it("separates warn-only from off, because they need different answers", () => {
    const name = HIGH_VALUE_RULES[0]?.name ?? "";
    const weak = findWeakRules({ rules: { ...allOn, [name]: "warn" } });
    assert.deepEqual(
      weak.map((verdict) => verdict.state),
      ["warn"],
    );
  });

  it("reports nothing when ESLint could not be asked", () => {
    // A repo without ESLint is the normal input, not an error.
    assert.deepEqual(findWeakRules(null), []);
  });
});

describe("findMissingStrictness", () => {
  it("reports a flag that `strict` does not include", () => {
    // strict: true enables none of these, which is exactly the trap.
    const missing = findMissingStrictness({ compilerOptions: { strict: true } });
    const names = missing.map((entry) => entry.flag.name);
    assert.ok(names.includes("noUncheckedIndexedAccess"));
    assert.ok(names.includes("exactOptionalPropertyTypes"));
  });

  it("reports nothing once they are all on", () => {
    const compilerOptions = {
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      noImplicitReturns: true,
      noFallthroughCasesInSwitch: true,
      noImplicitOverride: true,
      noPropertyAccessFromIndexSignature: true,
    };
    assert.deepEqual(findMissingStrictness({ compilerOptions }), []);
  });

  it("treats a flag set to false as off, not as configured", () => {
    const missing = findMissingStrictness({ compilerOptions: { noImplicitReturns: false } });
    assert.ok(missing.some((entry) => entry.flag.name === "noImplicitReturns"));
  });

  it("reports nothing when tsc could not be asked", () => {
    assert.deepEqual(findMissingStrictness(null), []);
  });
});

describe("isStrictOff", () => {
  it("is true when neither strict nor strictNullChecks is set", () => {
    assert.equal(isStrictOff({ compilerOptions: {} }), true);
  });

  it("accepts strictNullChecks alone, which is the load-bearing half", () => {
    assert.equal(isStrictOff({ compilerOptions: { strictNullChecks: true } }), false);
  });

  it("says nothing when there is no tsconfig to read", () => {
    assert.equal(isStrictOff(null), false);
  });
});

describe("sampleSourceFile", () => {
  it("prefers TypeScript, because that is where the type-aware rules apply", () => {
    const picked = sampleSourceFile([file("src/a.js"), file("src/b.ts")]);
    assert.equal(picked?.path, "src/b.ts");
  });

  it("skips declarations and specs, whose config says nothing about the code", () => {
    const picked = sampleSourceFile([file("src/a.d.ts"), file("test/b.ts"), file("src/c.ts")]);
    assert.equal(picked?.path, "src/c.ts");
  });

  it("falls back rather than giving up when everything is excluded", () => {
    assert.equal(sampleSourceFile([file("test/only.ts")])?.path, "test/only.ts");
  });

  it("returns null for an empty repo", () => {
    assert.equal(sampleSourceFile([]), null);
  });
});

describe("referencePaths", () => {
  it("lists a solution-style root's projects", () => {
    const root = { compilerOptions: {}, references: [{ path: "./tsconfig.app.json" }, { path: "./tsconfig.node.json" }] };
    assert.deepEqual(referencePaths(root), ["./tsconfig.app.json", "./tsconfig.node.json"]);
  });

  it("is empty for an ordinary config, and for none at all", () => {
    assert.deepEqual(referencePaths({ compilerOptions: { strict: true } }), []);
    assert.deepEqual(referencePaths(null), []);
  });
});

describe("projectForSample", () => {
  const app = { compilerOptions: { strict: true }, files: ["./src/a.ts", "./src/b.ts"] };
  const node = { compilerOptions: {}, files: ["./vite.config.ts"] };

  it("picks the project that compiles the sample", () => {
    assert.equal(projectForSample([node, app], "src/b.ts"), app);
    assert.equal(projectForSample([node, app], "vite.config.ts"), node);
  });

  it("matches whether or not the paths carry a ./ prefix", () => {
    assert.equal(projectForSample([app], "./src/a.ts"), app);
    assert.equal(projectForSample([{ compilerOptions: {}, files: ["src/a.ts"] }], "./src/a.ts")?.files?.length, 1);
  });

  it("falls back to the widest project when the sample is in none of them", () => {
    // A build script under `scripts/` belongs to no project; answering about the biggest one
    // beats answering nothing, because nothing reads as "strict is off".
    assert.equal(projectForSample([node, app], "scripts/build.ts"), app);
    assert.equal(projectForSample([node, app], null), app);
  });

  it("has nothing to pick from without projects", () => {
    assert.equal(projectForSample([], "src/a.ts"), null);
  });
});

describe("probeTsconfig through a solution-style root", () => {
  const write = async (files: Record<string, string>): Promise<string> => {
    const dir = await mkdtemp(path.join(tmpdir(), "ever-better-tsconfig-"));
    await mkdir(path.join(dir, "src"), { recursive: true });
    await Promise.all(Object.entries(files).map(([name, body]) => writeFile(path.join(dir, name), body, "utf8")));
    await symlink(path.join(repoRoot, "node_modules"), path.join(dir, "node_modules"));
    return dir;
  };

  const APP = JSON.stringify({ compilerOptions: { strict: true, target: "ES2022", module: "ESNext", moduleResolution: "bundler" }, include: ["src"] });
  const SOURCE = "export const value: number = 1;\n";
  const strictOf = async (dir: string): Promise<unknown> => {
    const probes = await gatherProbes(dir, [{ path: "src/main.ts", ext: "ts", lines: 1 }]);
    return probes.tsconfig?.["compilerOptions"];
  };

  /**
   * The Vite scaffold's default shape. The root holds no options of its own, so reading strictness
   * off it reported every flag absent while the referenced project has them on.
   */
  it("answers from the project that compiles the code", async () => {
    const dir = await write({
      "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }),
      "tsconfig.app.json": APP,
      "src/main.ts": SOURCE,
    });
    assert.deepEqual(await strictOf(dir), { strict: true, target: "es2022", module: "esnext", moduleResolution: "bundler" });
    await rm(dir, { recursive: true, force: true });
  });

  /** One level of following lands on another config with no options and reports the same lie. */
  it("follows a reference that is itself a solution", async () => {
    const dir = await write({
      "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./tsconfig.mid.json" }] }),
      "tsconfig.mid.json": JSON.stringify({ files: [], references: [{ path: "./tsconfig.app.json" }] }),
      "tsconfig.app.json": APP,
      "src/main.ts": SOURCE,
    });
    const options = await strictOf(dir);
    assert.ok(options !== undefined && options !== null && typeof options === "object" && "strict" in options);
    await rm(dir, { recursive: true, force: true });
  });

  /**
   * Answering from a root that holds no options is the false report this exists to remove, so
   * nothing resolving means no answer — `diagnose` reads that as no finding, which is the safe
   * direction: a missing gap is noise, a wrong one sends someone to change correct code.
   */
  it("reports nothing rather than the empty root when no reference resolves", async () => {
    const dir = await write({
      "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "./tsconfig.missing.json" }] }),
      "src/main.ts": SOURCE,
    });
    const probes = await gatherProbes(dir, [{ path: "src/main.ts", ext: "ts", lines: 1 }]);
    assert.equal(probes.tsconfig, null);
    await rm(dir, { recursive: true, force: true });
  });
});
