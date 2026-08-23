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

  /**
   * A false gap is noise; a false "already covered" means the gap is never reported at all, and
   * `diagnose` is only worth having if it can be believed without opening the workflow. Matching
   * the raw text claimed CI coverage for every line below.
   */
  it("does not count a script that is printed rather than run", () => {
    assert.equal(detectCi(workflow('      - run: echo "yarn run lint"')).runsLint, false);
    assert.equal(detectCi(workflow("      - run: echo npm run lint")).runsLint, false);
  });

  it("does not count a commented-out step", () => {
    assert.equal(detectCi(workflow("      # - run: yarn run lint")).runsLint, false);
  });

  it("does not count a different binary that happens to end in a manager's name", () => {
    assert.equal(detectCi(workflow("      - run: ./tools/yarn lint")).runsLint, false);
  });

  it("does not count a manager named in a job or step name", () => {
    assert.equal(detectCi(workflow("  lint:\n    name: yarn run lint")).runsLint, false);
  });

  it("reads the script a chained command runs, not only the first", () => {
    assert.equal(detectCi(workflow("      - run: yarn install && yarn lint")).runsLint, true);
  });

  it("reads a command inside a run block", () => {
    assert.equal(detectCi(workflow("      - run: |\n          yarn run lint")).runsLint, true);
  });

  it("accepts every way a manager spells the same invocation", () => {
    for (const command of ["yarn lint", "yarn run lint", "pnpm run lint", "npm run lint", "npm run-script lint", "bun run lint"]) {
      assert.equal(detectCi(workflow(`      - run: ${command}`)).runsLint, true, command);
    }
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

  it("recognises the explicit `run` form every manager accepts", () => {
    // `yarn run lint` is what the Vite scaffold writes, and reading it as "no lint in CI" makes
    // the review-tier gaps fire against a repo that already runs the whole tier.
    const ci = detectCi(workflow("run: yarn run lint\nrun: pnpm run test\nrun: bun run build\nrun: npm run typecheck"));
    assert.equal(ci.runsLint, true);
    assert.equal(ci.runsTest, true);
    assert.equal(ci.runsBuild, true);
    assert.equal(ci.runsTypecheck, true);
  });

  it("does not read one script's name out of another", () => {
    const ci = detectCi(workflow("run: yarn run lint:fix\nrun: yarn run test-setup\nrun: yarn build --watch"));
    assert.equal(ci.runsLint, true, "a colon namespaces the same tier");
    assert.equal(ci.runsBuild, true);
    assert.equal(ci.runsTest, false, "test-setup is not the test script");
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
