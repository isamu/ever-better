import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { everBetter, isRecord, run, TIMEOUT_MS } from "./harness.ts";

const MESSY_SOURCE = `export const parse = (input: any) => {
  const out: any = {};
  for (const part of input.split("&")) {
    const [key, value] = part.split("=");
    out[key] = value;
  }
  return out;
};

export const deep = (aaa: number, bbb: number, ccc: number, ddd: number): string => {
  if (aaa > 0) {
    if (bbb > 0) {
      if (ccc > 0) {
        if (ddd > 0) {
          if (aaa + bbb > ccc) return "yes";
        }
      }
    }
  }
  return "no";
};
`;

/**
 * Carries the things `bootstrap` must not lose. It adds scripts to this file, and a reader has to
 * be able to trust that "adds" is the whole story — identity, metadata and a script somebody else
 * wrote have to come out the other side untouched.
 */
const ORIGINAL_PACKAGE_JSON = {
  name: "e2e-fixture",
  private: true,
  version: "1.0.0",
  type: "module",
  description: "a fixture with fields nothing in bootstrap knows about",
  engines: { node: ">=20.11" },
  scripts: { "custom-task": "echo somebody-elses-script" },
};

/**
 * The lifecycle, against real ESLint, in a real repository. Every claim this tool makes about the
 * ratchet lives here — that old code is grandfathered, that new code is rejected, and that fixing
 * something lowers the ceiling rather than breaking the build.
 *
 * Hand-verified through the whole of development; automated so a regression is caught by CI rather
 * than by whoever runs it next.
 */
describe("lifecycle", { timeout: TIMEOUT_MS }, () => {
  let repo = "";

  before(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "ever-better-e2e-"));
    await mkdir(path.join(repo, "src"), { recursive: true });
    await run("git", ["init", "-q", "."], repo);
    // Tab-indented on purpose: bootstrap rewrites this file, and it must not reformat it.
    await writeFile(path.join(repo, "package.json"), `${JSON.stringify(ORIGINAL_PACKAGE_JSON, null, "\t")}\n`);
    await writeFile(
      path.join(repo, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "nodenext",
            moduleResolution: "nodenext",
            strict: true,
            noEmit: true,
          },
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(path.join(repo, "src", "messy.ts"), MESSY_SOURCE);
  });

  after(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("diagnoses a bare repository without throwing", async () => {
    const result = await everBetter(["diagnose"], repo);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /ESLint is not configured/);
  });

  it("bootstraps a working toolchain", async () => {
    const result = await everBetter(["bootstrap"], repo);
    assert.equal(result.code, 0, result.stderr);
    const lint = await run(path.join(repo, "node_modules", ".bin", "eslint"), ["."], repo).catch(() => null);
    // 1 means violations found — the config loaded and the rules ran, which is the point.
    assert.ok(lint !== null && lint.code < 2, `eslint could not run: ${lint?.stderr ?? "spawn failed"}`);
  });

  it("adds scripts to package.json without losing anything already in it", async () => {
    const text = await readFile(path.join(repo, "package.json"), "utf8");
    const after: unknown = JSON.parse(text);
    assert.ok(isRecord(after), "package.json is no longer an object");

    assert.match(text, /\n\t"name"/, "bootstrap reindented a tab-indented package.json");

    for (const [key, value] of Object.entries(ORIGINAL_PACKAGE_JSON)) {
      if (key === "scripts") continue;
      assert.deepEqual(after[key], value, `bootstrap changed ${key}`);
    }
    // The package manager owns this one; bootstrap must not have dropped what the install wrote.
    assert.ok(isRecord(after["devDependencies"]), "devDependencies missing after install");

    const scripts = after["scripts"];
    assert.ok(isRecord(scripts), "scripts missing");
    assert.equal(scripts["custom-task"], "echo somebody-elses-script", "a script bootstrap did not write was overwritten");
    assert.equal(scripts["lint"], "eslint .", "bootstrap did not add its own scripts");
  });

  it("freezes today's violations as the ceiling", async () => {
    const result = await everBetter(["freeze"], repo);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Baseline pinned: \d+ violations/);
  });

  it("passes check immediately after freezing", async () => {
    const result = await everBetter(["check"], repo);
    assert.equal(result.code, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Clean\./);
  });

  it("rejects a violation added after the freeze", async () => {
    await writeFile(path.join(repo, "src", "new.ts"), "export const sneaky = (x: any) => x;\n");
    const result = await everBetter(["check"], repo);
    assert.equal(result.code, 1, "a new violation must fail the gate");
    assert.match(result.stdout, /unsuppressed error/);
  });

  it("passes again once the new violation is gone", async () => {
    await rm(path.join(repo, "src", "new.ts"));
    const result = await everBetter(["check"], repo);
    assert.equal(result.code, 0, result.stdout + result.stderr);
  });

  it("lowers the ceiling when a grandfathered violation is fixed", async () => {
    const before = await everBetter(["status"], repo);
    const backlogBefore = Number(/backlog\s+(\d+)/.exec(before.stdout)?.[1] ?? "0");
    assert.ok(backlogBefore > 0, "fixture should start with a backlog");

    await writeFile(path.join(repo, "src", "messy.ts"), MESSY_SOURCE.replace(/export const deep[\s\S]*$/, ""));
    const pruned = await everBetter(["prune"], repo);
    assert.equal(pruned.code, 0, pruned.stderr);

    const after = await everBetter(["status"], repo);
    const backlogAfter = Number(/backlog\s+(\d+)/.exec(after.stdout)?.[1] ?? "0");
    assert.ok(backlogAfter < backlogBefore, `ceiling did not fall: ${backlogBefore} -> ${backlogAfter}`);
  });

  it("refuses a second freeze, which would forgive everything added since", async () => {
    const result = await everBetter(["freeze"], repo);
    assert.match(result.stdout, /Already frozen/);
  });
});
