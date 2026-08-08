import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compareEmit, describeComparison, type EmittedFile } from "../emitCompare.ts";
import { exec } from "../util/exec.ts";

export type EmitDiffOptions = {
  cwd: string;
  /** Git ref to compare against. */
  against: string;
};

const TSC_ARGS = [
  "--noEmit",
  "false",
  "--declaration",
  "false",
  "--declarationMap",
  "false",
  // Source maps embed the input path, so two identical outputs would differ on it alone.
  "--sourceMap",
  "false",
];

const hashOf = async (filePath: string): Promise<string> =>
  createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");

const collectEmitted = async (root: string, prefix = ""): Promise<EmittedFile[]> => {
  const entries = await readdir(path.join(root, prefix), { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return collectEmitted(root, relative);
      return [{ path: relative, hash: await hashOf(path.join(root, relative)) }];
    }),
  );
  return nested.flat();
};

const compileTo = async (projectDir: string, outDir: string): Promise<boolean> => {
  const tsc = path.join(projectDir, "node_modules", "typescript", "bin", "tsc");
  const result = await exec(process.execPath, [tsc, ...TSC_ARGS, "--outDir", outDir, "--pretty", "false"], projectDir);
  // Type errors are irrelevant here — tsc still emits, and emitting is the whole point.
  return result.code < 2 || (await readdir(outDir).catch(() => [])).length > 0;
};

/**
 * Compiles the working tree and a git ref, and compares the emitted JavaScript.
 *
 * A refactor that only moves types — narrowing a parameter, deleting an `as`, splitting an
 * interface — erases at compile time. Byte-identical output proves it cannot have changed
 * behaviour, which no amount of test coverage can say as strongly. When the output does differ, the
 * files listed are exactly where to look.
 */
export const runEmitDiff = async (options: EmitDiffOptions): Promise<string> => {
  const scratch = await mkdtemp(path.join(tmpdir(), "ever-better-emit-"));
  const worktree = path.join(scratch, "before");
  const beforeOut = path.join(scratch, "out-before");
  const afterOut = path.join(scratch, "out-after");

  try {
    const added = await exec("git", ["worktree", "add", "--detach", worktree, options.against], options.cwd);
    if (added.code !== 0) {
      return `Could not check out ${options.against}:\n${added.stderr.slice(0, 1000)}`;
    }
    // The checkout has no node_modules, and installing one would take longer than the comparison.
    await symlink(path.join(options.cwd, "node_modules"), path.join(worktree, "node_modules"));

    const compiledBefore = await compileTo(worktree, beforeOut);
    const compiledAfter = await compileTo(options.cwd, afterOut);
    if (!compiledBefore || !compiledAfter) {
      return "tsc produced no output for one of the two trees — cannot compare.";
    }

    const comparison = compareEmit(await collectEmitted(beforeOut), await collectEmitted(afterOut));
    return describeComparison(comparison, options.against);
  } finally {
    await exec("git", ["worktree", "remove", "--force", worktree], options.cwd).catch(() => null);
    await rm(scratch, { recursive: true, force: true });
  }
};
