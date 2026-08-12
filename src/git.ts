import { exec } from "./util/exec.ts";

const shortSha = (raw: string): string | null => {
  const trimmed = raw.trim();
  return /^[0-9a-f]{7,40}$/.test(trimmed) ? trimmed : null;
};

/**
 * Whether there is a history here at all. A caller that scans one has to ask first: `gitleaks
 * detect` outside a work tree logs an error, scans zero commits, and still exits 0 with "no leaks
 * found" — a clean bill of health for a scan that looked at nothing.
 */
export const isGitRepository = async (cwd: string): Promise<boolean> => {
  try {
    const result = await exec("git", ["rev-parse", "--is-inside-work-tree"], cwd);
    return result.code === 0 && result.stdout.trim() === "true";
  } catch {
    return false;
  }
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
