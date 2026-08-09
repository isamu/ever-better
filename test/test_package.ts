import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { formatterPath } from "../src/eslintRunner.ts";
import { exec } from "../src/util/exec.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readPackageJson = async (): Promise<{ files?: string[]; bin?: Record<string, string> }> => {
  const parsed: unknown = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8"));
  assert.ok(typeof parsed === "object" && parsed !== null);
  return parsed;
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
};

describe("published package", () => {
  it("ships the ESLint formatter", async () => {
    // `files` originally listed a `templates` directory that does not exist and omitted
    // `formatters`, so the tarball would have shipped without the formatter every command depends
    // on — working perfectly from a clone and broken for everyone installing from npm.
    const { files } = await readPackageJson();
    assert.ok(files?.includes("formatters"), `files was ${JSON.stringify(files)}`);
  });

  it("lists nothing in files that is missing from disk", async () => {
    const { files } = await readPackageJson();
    for (const entry of files ?? []) {
      assert.ok(await exists(path.join(repoRoot, entry)), `files lists a missing entry: ${entry}`);
    }
  });

  it("resolves the formatter to a file that is really there", async () => {
    assert.ok(await exists(formatterPath()), `${formatterPath()} does not exist`);
  });

  it("points bin at the built entry point", async () => {
    const { bin } = await readPackageJson();
    assert.equal(bin?.["ever-better"], "dist/cli.js");
  });
});

/**
 * A NUL is a legal character inside a string literal, so tsc, ESLint and Prettier all accept a
 * source file containing one — and git then classifies that file as binary and shows `Bin 0 ->
 * 4893 bytes` instead of a diff. The whole file becomes invisible to review while every check
 * stays green, which is why nothing else in this toolchain can catch it.
 */
describe("sources are text", () => {
  it("has no control bytes that make git treat a source file as binary", async () => {
    const listed = await exec("git", ["ls-files", "-z", "*.ts", "*.js", "*.mjs", "*.json", "*.md"], repoRoot);
    const files = listed.stdout.split("\0").filter((entry) => entry.length > 0);
    assert.ok(files.length > 0, "git ls-files returned nothing");
    const binary = await Promise.all(files.map(async (file) => ((await readFile(path.join(repoRoot, file), "utf8")).includes("\0") ? file : null)));
    assert.deepEqual(
      binary.filter((file) => file !== null),
      [],
    );
  });
});
