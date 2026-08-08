import { exec } from "./util/exec.ts";

const shortSha = (raw: string): string | null => {
  const trimmed = raw.trim();
  return /^[0-9a-f]{7,40}$/.test(trimmed) ? trimmed : null;
};

export const headCommit = async (cwd: string): Promise<string | null> => {
  try {
    const result = await exec("git", ["rev-parse", "HEAD"], cwd);
    return result.code === 0 ? shortSha(result.stdout) : null;
  } catch {
    return null;
  }
};

/**
 * How far the repository has moved since a diagnosis. Null when the recorded commit is not in this
 * history at all — after a rebase, a force-push, or a fresh shallow clone — which is itself a
 * reason to re-diagnose rather than a number to guess at.
 */
export const commitsSince = async (cwd: string, sha: string | null): Promise<number | null> => {
  if (!sha) return null;
  try {
    const result = await exec("git", ["rev-list", "--count", `${sha}..HEAD`], cwd);
    if (result.code !== 0) return null;
    const count = Number.parseInt(result.stdout.trim(), 10);
    return Number.isNaN(count) ? null : count;
  } catch {
    return null;
  }
};
