import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { renderSamplesDoc } from "../src/generate/samplesDoc.ts";

const docPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "generated-config.md",
);

describe("docs/generated-config.md", () => {
  it("matches what the generators produce today", async () => {
    // A hand-copied example of generated output is wrong the first time a generator changes, and a
    // wrong example is worse than none — a reader who follows one and gets something else stops
    // believing the rest of the page. Run `yarn docs` after changing any generator.
    const onDisk = await readFile(docPath, "utf8");
    assert.equal(onDisk, renderSamplesDoc(), "docs are stale — run `yarn docs`");
  });

  it("shows every framework a repo might be", () => {
    const doc = renderSamplesDoc();
    for (const heading of ["plain TypeScript", "Vue", "Next.js", "before migrating"]) {
      assert.ok(doc.includes(heading), `missing sample: ${heading}`);
    }
  });

  it("shows every workflow bootstrap writes", () => {
    const doc = renderSamplesDoc();
    for (const file of ["ci.yml", "ever-better.yml", "codex-review.yml", "dependabot.yml"]) {
      assert.ok(doc.includes(file), `missing workflow: ${file}`);
    }
  });

  it("says why the expensive tsconfig flag stays off", () => {
    assert.match(renderSamplesDoc(), /no suppression mechanism/);
  });
});
