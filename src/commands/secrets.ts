import { SECRET_FINDING_EXIT_CODE } from "../generate/secretScan.ts";
import { isGitRepository } from "../git.ts";
import { interpretGitleaks, MISSING_GITLEAKS, NOT_A_REPOSITORY, type SecretVerdict } from "../secretScan.ts";
import { exec } from "../util/exec.ts";

export type SecretsOptions = {
  cwd: string;
};

/**
 * The whole history, not the working tree: a key deleted in a later commit is still in the clone
 * everyone else has. `--redact` keeps the finding out of a terminal recording or a CI log.
 */
const ARGS = ["detect", "--source", ".", "--redact", "--verbose", "--exit-code", String(SECRET_FINDING_EXIT_CODE)];

export const runSecrets = async (options: SecretsOptions): Promise<SecretVerdict> => {
  // Measured, not assumed: outside a work tree `gitleaks detect` logs an error, scans zero
  // commits, and exits 0 with "no leaks found". Passing that through would hand back a clean
  // result for a scan that read nothing, which is the one answer this command must never give.
  if (!(await isGitRepository(options.cwd))) return { ok: false, message: NOT_A_REPOSITORY };
  try {
    const result = await exec("gitleaks", ARGS, options.cwd);
    return interpretGitleaks(result.code, `${result.stdout}\n${result.stderr}`);
  } catch {
    // Spawning failed outright, which on every platform here means the binary is not there.
    return { ok: false, message: MISSING_GITLEAKS };
  }
};
