import { SECRET_FINDING_EXIT_CODE } from "../generate/secretScan.ts";
import { isGitRepository } from "../git.ts";
import { combineScans, FOUND_IN, interpretGitleaks, MISSING_GITLEAKS, NOT_A_REPOSITORY, type SecretVerdict } from "../secretScan.ts";
import { exec } from "../util/exec.ts";

export type SecretsOptions = {
  cwd: string;
};

const FLAGS = ["--redact", "--verbose", "--exit-code", String(SECRET_FINDING_EXIT_CODE)];

/**
 * Two scans, because either one alone passes a repository that is holding a secret.
 *
 * `git` reads the history — a key committed and then deleted is still in every clone, and that is
 * the one a working-tree scan cannot see. `dir` reads the files as they are now, which is the key
 * pasted an hour ago and not committed yet: `git` reports "no leaks found" for it, and for a
 * repository with no commits at all it reports that having read nothing.
 *
 * `dir` honours `.gitignore`, so `node_modules` costs nothing — measured at ~1 MB and 93ms on this
 * repository rather than assumed.
 */
const SCANS: readonly { args: readonly string[]; found: string }[] = [
  { args: ["git", ".", ...FLAGS], found: FOUND_IN.history },
  { args: ["dir", ".", ...FLAGS], found: FOUND_IN.workingTree },
];

const runScan = async (cwd: string, scan: { args: readonly string[]; found: string }): Promise<SecretVerdict> => {
  const result = await exec("gitleaks", [...scan.args], cwd);
  return interpretGitleaks(result.code, `${result.stdout}\n${result.stderr}`, scan.found);
};

export const runSecrets = async (options: SecretsOptions): Promise<SecretVerdict> => {
  // Measured, not assumed: outside a work tree `gitleaks git` logs an error, scans zero commits,
  // and exits 0. Passing that on would be a clean result for a scan that read nothing.
  if (!(await isGitRepository(options.cwd))) return { ok: false, code: 1, message: NOT_A_REPOSITORY };
  try {
    return combineScans(await Promise.all(SCANS.map((scan) => runScan(options.cwd, scan))));
  } catch {
    // Spawning failed outright, which on every platform here means the binary is not there.
    return { ok: false, code: 1, message: MISSING_GITLEAKS };
  }
};
