import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectFramework, detectRuntime, frameworkIgnores, hasUncoveredFileType, typecheckCommand } from "../src/detect/framework.ts";
import { eslintConfigFileName, eslintPackagesFor } from "../src/generate/eslintConfig.ts";
import type { SourceFile } from "../src/types.ts";

const deps = (...names: string[]) => ({
  dependencies: Object.fromEntries(names.map((name) => [name, "^1"])),
});

describe("detectFramework", () => {
  it("recognises each framework from its own package", () => {
    assert.equal(detectFramework(deps("vue")), "vue");
    assert.equal(detectFramework(deps("react", "react-dom")), "react");
    assert.equal(detectFramework(deps("svelte")), "svelte");
    assert.equal(detectFramework(deps("astro")), "astro");
  });

  it("reports Next as next, not as react", () => {
    // next depends on react, so testing in dependency order loses the plugin that knows about
    // its routing conventions.
    assert.equal(detectFramework(deps("next", "react", "react-dom")), "next");
  });

  it("reports Nuxt as nuxt, not as vue", () => {
    assert.equal(detectFramework(deps("nuxt", "vue")), "nuxt");
  });

  it("finds a framework in devDependencies too", () => {
    assert.equal(detectFramework({ devDependencies: { vue: "^3" } }), "vue");
  });

  it("returns none for a plain library", () => {
    assert.equal(detectFramework(deps("express")), "none");
    assert.equal(detectFramework(null), "none");
  });
});

describe("detectRuntime", () => {
  it("gives a frontend repo both global sets", () => {
    // Browser-only globals make every vite.config.ts and test file report false no-undef.
    assert.equal(detectRuntime("vue", deps("vue")), "both");
    assert.equal(detectRuntime("next", deps("next")), "both");
  });

  it("keeps a plain library on node globals", () => {
    assert.equal(detectRuntime("none", deps("express")), "node");
  });

  it("treats a bundled library as browser-capable", () => {
    assert.equal(detectRuntime("none", { devDependencies: { vite: "^7" } }), "both");
  });
});

describe("frameworkIgnores", () => {
  it("ignores each framework's build output", () => {
    assert.ok(frameworkIgnores("next").includes(".next/**"));
    assert.ok(frameworkIgnores("nuxt").includes(".output/**"));
    assert.ok(frameworkIgnores("svelte").includes(".svelte-kit/**"));
  });

  it("always ignores the shared ones", () => {
    for (const framework of ["none", "vue", "react"] as const) {
      assert.ok(frameworkIgnores(framework).includes("node_modules/**"));
      assert.ok(frameworkIgnores(framework).includes(".vercel/**"));
    }
  });
});

describe("typecheckCommand", () => {
  it("uses vue-tsc where tsc cannot read the files", () => {
    // tsc cannot parse an SFC at all, so `tsc --noEmit` in a Vue repo silently skips every
    // component while still exiting 0.
    assert.equal(typecheckCommand("vue"), "vue-tsc --noEmit");
    assert.equal(typecheckCommand("nuxt"), "vue-tsc --noEmit");
  });

  it("uses plain tsc everywhere else", () => {
    assert.equal(typecheckCommand("react"), "tsc --noEmit");
    assert.equal(typecheckCommand("none"), "tsc --noEmit");
  });
});

describe("hasUncoveredFileType", () => {
  const file = (ext: string): SourceFile => ({ path: `a.${ext}`, ext, lines: 1 });

  it("flags a framework whose file type the generator does not configure", () => {
    assert.equal(hasUncoveredFileType("svelte", [file("svelte")]), true);
    assert.equal(hasUncoveredFileType("astro", [file("astro")]), true);
  });

  it("stays quiet for the frameworks that are covered", () => {
    assert.equal(hasUncoveredFileType("vue", [file("vue")]), false);
    assert.equal(hasUncoveredFileType("next", [file("tsx")]), false);
  });

  it("stays quiet when the framework is a dependency but no such file exists", () => {
    assert.equal(hasUncoveredFileType("svelte", [file("ts")]), false);
  });
});

describe("eslintPackagesFor", () => {
  it("adds the framework's plugin", () => {
    assert.ok(eslintPackagesFor("vue").includes("eslint-plugin-vue"));
    assert.ok(eslintPackagesFor("next").includes("@next/eslint-plugin-next"));
    assert.ok(eslintPackagesFor("react").includes("eslint-plugin-react-hooks"));
  });

  it("never asks for eslint-plugin-react", () => {
    // Its peer range stops at eslint ^9.7, so installing it next to the ESLint 10 we set up
    // fails outright and leaves the repo with no linter at all.
    for (const framework of ["react", "next"] as const) {
      assert.ok(!eslintPackagesFor(framework).includes("eslint-plugin-react"));
    }
  });

  it("asks for nothing extra when there is no framework", () => {
    assert.deepEqual(eslintPackagesFor("none"), eslintPackagesFor("svelte"));
  });
});

describe("eslintConfigFileName", () => {
  it("uses .mjs unless the package declares ESM", () => {
    // The config is ESM either way; in a CommonJS package a `.js` file makes Node reparse it and
    // warn on every single lint run.
    assert.equal(eslintConfigFileName(null), "eslint.config.mjs");
    assert.equal(eslintConfigFileName({ name: "x" }), "eslint.config.mjs");
    assert.equal(eslintConfigFileName({ type: "module" }), "eslint.config.js");
  });
});
