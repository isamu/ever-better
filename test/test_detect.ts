import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectCi, missingRunners } from "../src/detect/ci.ts";
import { detectLanguageMode, typescriptFileRatio } from "../src/detect/language.ts";
import { detectPackageManager, installCommand } from "../src/detect/packageManager.ts";
import { summarizeSizes } from "../src/detect/sizes.ts";
import { detectEslintSetup, detectTestRunner, detectTooling } from "../src/detect/tooling.ts";
import type { SourceFile } from "../src/types.ts";

const src = (path: string, lines: number): SourceFile => ({
  path,
  lines,
  ext: path.split(".").pop() ?? "",
});

describe("detectPackageManager", () => {
  it("reads the lockfile", () => {
    assert.equal(detectPackageManager(["yarn.lock"], null), "yarn");
    assert.equal(detectPackageManager(["pnpm-lock.yaml"], null), "pnpm");
    assert.equal(detectPackageManager(["package-lock.json"], null), "npm");
  });

  it("prefers the declared packageManager field over a leftover lockfile", () => {
    const declared = detectPackageManager(["yarn.lock"], { packageManager: "pnpm@9.1.0" });
    assert.equal(declared, "pnpm");
  });

  it("falls back to npm when there is nothing to go on", () => {
    assert.equal(detectPackageManager([], null), "npm");
  });

  it("ignores a packageManager field naming something unknown", () => {
    assert.equal(detectPackageManager(["yarn.lock"], { packageManager: "cargo@1" }), "yarn");
  });
});

describe("installCommand", () => {
  it("uses each manager's own dev-dependency flag", () => {
    assert.equal(installCommand("yarn", ["eslint"]), "yarn add --dev eslint");
    assert.equal(installCommand("npm", ["eslint"]), "npm install --save-dev eslint");
    assert.equal(installCommand("pnpm", ["eslint"]), "pnpm add --save-dev eslint");
  });
});

describe("language detection", () => {
  it("reports javascript when there is no tsconfig, however many .ts files exist", () => {
    assert.equal(detectLanguageMode(false, [src("a.ts", 1)]), "javascript");
  });

  it("reports mixed when a tsconfig exists but plenty of .js remains", () => {
    const files = [src("a.ts", 1), src("b.js", 1), src("c.js", 1)];
    assert.equal(detectLanguageMode(true, files), "mixed");
  });

  it("reports typescript once the share passes the threshold", () => {
    const files = [...Array.from({ length: 9 }, (_, i) => src(`a${i}.ts`, 1)), src("b.js", 1)];
    assert.equal(detectLanguageMode(true, files), "typescript");
  });

  it("returns a zero ratio for an empty repo rather than NaN", () => {
    assert.equal(typescriptFileRatio([]), 0);
  });

  it("ignores files that are neither JS nor TS", () => {
    assert.equal(typescriptFileRatio([src("a.ts", 1), src("b.vue", 1)]), 1);
  });
});

describe("detectEslintSetup", () => {
  it("separates flat config from legacy, because they are not interchangeable", () => {
    assert.equal(detectEslintSetup(["eslint.config.js"]), "flat");
    assert.equal(detectEslintSetup([".eslintrc.json"]), "legacy");
    assert.equal(detectEslintSetup(["package.json"]), "none");
  });
});

describe("detectTestRunner", () => {
  it("finds a runner from dependencies", () => {
    assert.equal(detectTestRunner({ devDependencies: { vitest: "^4" } }), "vitest");
    assert.equal(detectTestRunner({ devDependencies: { jest: "^30" } }), "jest");
  });

  it("recognises node:test from the script alone", () => {
    assert.equal(detectTestRunner({ scripts: { test: "node --test test/*.ts" } }), "node:test");
  });

  it("recognises node:test whatever launches node", () => {
    // Reporting "none" here is what makes it expensive: bootstrap installs vitest on "none", so a
    // repo already running node:test through tsx gets a second runner added to it.
    assert.equal(detectTestRunner({ scripts: { test: "tsx --test ./test/**/test_*.ts" } }), "node:test");
    assert.equal(detectTestRunner({ scripts: { test: "node --experimental-strip-types --test test/*.ts" } }), "node:test");
    assert.equal(detectTestRunner({ scripts: { test: "node --test-reporter=spec --test test/*.ts" } }), "node:test");
  });

  it("does not read `--test` out of a longer flag", () => {
    assert.equal(detectTestRunner({ scripts: { test: "playwright test --test-dir=e2e" } }), "none");
    assert.equal(detectTestRunner({ scripts: { test: "node --test-reporter=spec build.js" } }), "none");
  });

  it("reports none rather than guessing", () => {
    assert.equal(detectTestRunner({ scripts: { test: "echo nope" } }), "none");
  });

  it("names the runners that are only ever a dependency", () => {
    // Reporting mocha as "none" is not a cosmetic mislabel: bootstrap installs vitest on "none",
    // which puts a second runner into a repo that already tests. Measured on debug-js/debug.
    assert.equal(detectTestRunner({ devDependencies: { mocha: "^11" } }), "mocha");
    assert.equal(detectTestRunner({ devDependencies: { ava: "^6" } }), "ava");
  });

  it("prefers the runner a config would be generated for", () => {
    assert.equal(detectTestRunner({ devDependencies: { mocha: "^11", vitest: "^4" } }), "vitest");
  });
});

describe("detectTooling", () => {
  it("counts a tool wired up only inside a workflow", () => {
    const tooling = detectTooling([], null, "run: npx jscpd src");
    assert.equal(tooling.jscpd, true);
    assert.equal(tooling.knip, false);
  });

  it("lists whichever agent instruction files are present", () => {
    const tooling = detectTooling(["CLAUDE.md", "AGENTS.md"], null);
    assert.deepEqual(tooling.agentInstructions, ["CLAUDE.md", "AGENTS.md"]);
  });
});

describe("detectCi", () => {
  const workflow = (content: string) => [{ path: ".github/workflows/ci.yml", content }];

  it("collects runners from a matrix", () => {
    const ci = detectCi(workflow("os: [ubuntu-latest, macos-latest, windows-latest]"));
    assert.deepEqual(ci.runners, ["macos-latest", "ubuntu-latest", "windows-latest"]);
    assert.deepEqual(missingRunners(ci), []);
  });

  it("does not mistake a workflow filename for a runner", () => {
    const ci = detectCi([{ path: ".github/workflows/windows-daily.yaml", content: "name: windows-daily" }]);
    assert.deepEqual(ci.runners, []);
  });

  it("recognises scripts run through any package manager", () => {
    const ci = detectCi(workflow("run: pnpm lint\nrun: npm run test"));
    assert.equal(ci.runsLint, true);
    assert.equal(ci.runsTest, true);
    assert.equal(ci.runsBuild, false);
  });

  it("sees whether the gate itself is wired, which thorough CI can still miss", () => {
    const without = detectCi(workflow("run: yarn lint\nrun: yarn test"));
    assert.equal(without.runsEverBetterCheck, false);
    const with_ = detectCi(workflow("run: npx --yes ever-better check --no-write"));
    assert.equal(with_.runsEverBetterCheck, true);
  });

  it("reports absent CI without throwing", () => {
    const ci = detectCi([]);
    assert.equal(ci.present, false);
    assert.deepEqual(missingRunners(ci), ["ubuntu", "macos", "windows"]);
  });
});

describe("summarizeSizes", () => {
  it("counts only files over the limit and orders the sample by size", () => {
    const files = [src("a.ts", 100), src("b.ts", 900), src("c.ts", 700)];
    const sizes = summarizeSizes(files, 600);
    assert.equal(sizes.total, 3);
    assert.equal(sizes.overFileLimit, 2);
    assert.deepEqual(
      sizes.largest.map((file) => file.path),
      ["b.ts", "c.ts"],
    );
  });

  it("treats a file exactly at the limit as within it", () => {
    assert.equal(summarizeSizes([src("a.ts", 600)], 600).overFileLimit, 0);
  });
});
