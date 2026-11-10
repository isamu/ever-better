import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { censusFiles } from "../src/detect/untracked.ts";
import { diagnose } from "../src/diagnose.ts";
import { listSourcePaths } from "../src/facts.ts";
import { renderReport } from "../src/render/report.ts";
import type { RepoFacts } from "../src/types.ts";
import { exec } from "../src/util/exec.ts";

describe("censusFiles", () => {
  it("leaves untracked files out once the repository has a commit", () => {
    assert.deepEqual(censusFiles({ all: ["a.ts", "scratch.ts", "b.ts"], untracked: ["scratch.ts"], hasCommits: true }), {
      counted: ["a.ts", "b.ts"],
      leftOut: ["scratch.ts"],
    });
  });

  it("counts everything before the first commit, where every file is untracked", () => {
    assert.deepEqual(censusFiles({ all: ["a.ts", "b.ts"], untracked: ["a.ts", "b.ts"], hasCommits: false }), { counted: ["a.ts", "b.ts"], leftOut: [] });
  });

  it("leaves nothing out when nothing is untracked", () => {
    assert.deepEqual(censusFiles({ all: ["a.ts"], untracked: [], hasCommits: true }), { counted: ["a.ts"], leftOut: [] });
  });

  it("keeps the listing's order", () => {
    const listing = { all: ["z.ts", "m.ts", "a.ts", "b.ts"], untracked: ["m.ts", "b.ts"], hasCommits: true };
    assert.deepEqual(censusFiles(listing), { counted: ["z.ts", "a.ts"], leftOut: ["m.ts", "b.ts"] });
  });

  it("ignores an untracked name that is not in the listing", () => {
    assert.deepEqual(censusFiles({ all: ["a.ts"], untracked: ["node_modules/x.js"], hasCommits: true }), { counted: ["a.ts"], leftOut: [] });
  });

  it("handles an empty working copy", () => {
    assert.deepEqual(censusFiles({ all: [], untracked: [], hasCommits: false }), { counted: [], leftOut: [] });
  });
});

const facts = (untrackedSources: string[]): RepoFacts => ({
  cwd: "/repo",
  rootEntries: ["package.json"],
  allFiles: ["package.json"],
  packageJson: { name: "demo" },
  workspacePackages: [],
  sourceFiles: [{ path: "src/a.ts", ext: "ts", lines: 10 }],
  generatedSources: [],
  untrackedSources,
  workflows: [],
  probes: { rules: null, tsconfig: null },
});

describe("untracked sources in the diagnosis", () => {
  it("counts them and says they were not counted", () => {
    const diagnosis = diagnose(facts(["scratch.ts", "tmp/b.ts"]));
    assert.equal(diagnosis.untrackedSources, 2);
    assert.match(renderReport(diagnosis), /\n {2}untracked {9}2 \(not counted\)\n/);
  });

  it("prints no line when there are none", () => {
    assert.doesNotMatch(renderReport(diagnose(facts([]))), /untracked/);
  });
});

const git = async (cwd: string, ...args: string[]): Promise<void> => {
  const result = await exec("git", ["-c", "user.email=t@example.com", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args], cwd);
  assert.equal(result.code, 0, `git ${args.join(" ")}: ${result.stderr}`);
};

/** Real git, no ESLint: `listSourcePaths` only lists, so this stays a unit-speed test. */
describe("listSourcePaths against a real git repository", () => {
  let repo = "";

  before(async () => {
    repo = await mkdtemp(path.join(tmpdir(), "ever-better-untracked-"));
    await mkdir(path.join(repo, "src"));
    await writeFile(path.join(repo, "src", "a.ts"), "export const a = 1;\n");
    await git(repo, "init", "-q");
  });

  after(async () => {
    await rm(repo, { recursive: true, force: true });
  });

  it("counts untracked source before the first commit", async () => {
    assert.deepEqual(await listSourcePaths(repo), ["src/a.ts"]);
  });

  it("leaves out a file added after the first commit until it is committed", async () => {
    await git(repo, "add", "-A");
    await git(repo, "commit", "-q", "-m", "init");
    await writeFile(path.join(repo, "src", "scratch.ts"), "export const s = 1;\n");
    assert.deepEqual(await listSourcePaths(repo), ["src/a.ts"]);
    await git(repo, "add", "src/scratch.ts");
    assert.deepEqual(await listSourcePaths(repo), ["src/a.ts", "src/scratch.ts"]);
  });
});
