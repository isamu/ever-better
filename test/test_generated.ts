import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { declaredOutDir, generatedDirs, isGenerated } from "../src/detect/generated.ts";

describe("declaredOutDir", () => {
  it("reads the option", () => {
    assert.equal(declaredOutDir('{ "compilerOptions": { "outDir": "./lib" } }'), "./lib");
  });

  it("reads it beside the trailing block comment tsc's own template writes", () => {
    assert.equal(declaredOutDir('{ "outDir": "./dist", /* Specify an output folder. */ }'), "./dist");
  });

  it("does not read a commented-out one, which names no directory", () => {
    // The expensive direction: excluding a directory that is really source hides the code.
    assert.equal(declaredOutDir('{\n  // "outDir": "./lib",\n  "strict": true\n}'), null);
    assert.equal(declaredOutDir('{\n  /*\n   "outDir": "./lib",\n  */\n  "strict": true\n}'), null);
  });

  it("is null when the option is absent", () => {
    assert.equal(declaredOutDir('{ "compilerOptions": { "strict": true } }'), null);
    assert.equal(declaredOutDir(""), null);
  });
});

describe("generatedDirs", () => {
  it("resolves the directory against the config that declares it", () => {
    const configs = [
      { dir: "", text: '{ "outDir": "./dist" }' },
      { dir: "packages/a", text: '{ "outDir": "./lib" }' },
    ];
    assert.deepEqual(generatedDirs(configs), ["dist", "packages/a/lib"]);
  });

  it("follows a relative step out of the package", () => {
    assert.deepEqual(generatedDirs([{ dir: "packages/a", text: '{ "outDir": "../../build" }' }]), ["build"]);
  });

  it("lists a shared directory once", () => {
    const configs = [
      { dir: "", text: '{ "outDir": "./lib" }' },
      { dir: "", text: '{ "outDir": "lib" }' },
    ];
    assert.deepEqual(generatedDirs(configs), ["lib"]);
  });

  it("drops an outDir that is the repository root, which would mark every file generated", () => {
    assert.deepEqual(generatedDirs([{ dir: "", text: '{ "outDir": "." }' }]), []);
    assert.deepEqual(generatedDirs([{ dir: "", text: '{ "outDir": "./" }' }]), []);
  });

  it("drops one that escapes the repository, which this tool cannot see into anyway", () => {
    assert.deepEqual(generatedDirs([{ dir: "", text: '{ "outDir": "../elsewhere" }' }]), []);
  });

  it("is empty without configs, and without the option", () => {
    assert.deepEqual(generatedDirs([]), []);
    assert.deepEqual(generatedDirs([{ dir: "", text: "{}" }]), []);
  });
});

describe("isGenerated", () => {
  it("matches a file inside the directory", () => {
    assert.equal(isGenerated(["packages/a/lib"], "packages/a/lib/index.js"), true);
  });

  it("does not match the sibling whose name merely starts the same", () => {
    assert.equal(isGenerated(["lib"], "library/index.ts"), false);
    assert.equal(isGenerated(["lib"], "src/lib/index.ts"), false);
  });

  it("matches nothing when nothing is generated", () => {
    assert.equal(isGenerated([], "src/index.ts"), false);
  });
});
