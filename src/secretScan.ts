import { SECRET_FINDING_EXIT_CODE } from "./generate/secretScan.ts";

export type SecretVerdict = {
  ok: boolean;
  /** Mirrors gitleaks: 0 clean, 2 findings, 1 the scan itself failed. Collapsing them loses the
   * distinction the whole exit-code choice exists for, and a caller cannot get it back. */
  code: number;
  message: string;
};

const CLEAN_EXIT_CODE = 0;
const SCAN_FAILED_EXIT_CODE = 1;

/**
 * What a finding means depends on which scan found it, and the difference is the whole advice: a
 * key in the history is already public and rotation is the only fix, while one sitting uncommitted
 * has not been published yet and deleting it genuinely is enough.
 */
export const FOUND_IN = {
  history: "Secrets found in the history. Rotate them — they are in every clone already, and removing the line does not un-publish them.",
  workingTree: "Secrets found in files that are not committed yet. Remove them before committing; rotate as well if this tree was ever pushed or shared.",
} as const;

/**
 * gitleaks answers "I found a secret" and "I could not run" with the same 1 unless a findings code
 * is asked for, so every run passes `--exit-code 2` and this reads three outcomes rather than two.
 * Measured against gitleaks 8.30.1, in both directions.
 */
export const interpretGitleaks = (code: number, output: string, found: string = FOUND_IN.history): SecretVerdict => {
  if (code === CLEAN_EXIT_CODE) return { ok: true, code: CLEAN_EXIT_CODE, message: "No secrets found." };
  if (code === SECRET_FINDING_EXIT_CODE) {
    return { ok: false, code: SECRET_FINDING_EXIT_CODE, message: joined(found, output) };
  }
  return {
    ok: false,
    code: SCAN_FAILED_EXIT_CODE,
    message: joined(`gitleaks could not complete the scan (exit ${code}). This is not a clean result — nothing was checked.`, output),
  };
};

const joined = (headline: string, output: string): string => [headline, "", output.trim()].filter((line) => line.length > 0).join("\n");

/**
 * The worst verdict wins, and a scan that failed outranks a clean one: two scans run, and "one of
 * them could not look" must not be reported as "nothing found".
 */
export const combineScans = (verdicts: readonly SecretVerdict[]): SecretVerdict => {
  const findings = verdicts.filter((verdict) => verdict.code === SECRET_FINDING_EXIT_CODE);
  const failures = verdicts.filter((verdict) => verdict.code === SCAN_FAILED_EXIT_CODE);
  if (failures.length > 0) return failures[0] ?? verdicts[0] ?? clean();
  if (findings.length > 0) {
    return { ok: false, code: SECRET_FINDING_EXIT_CODE, message: findings.map((verdict) => verdict.message).join("\n\n") };
  }
  return clean();
};

const clean = (): SecretVerdict => ({
  ok: true,
  code: CLEAN_EXIT_CODE,
  message: "No secrets found — history and working tree both scanned.",
});

export const MISSING_GITLEAKS = [
  "gitleaks is not on PATH, so nothing was scanned — which is not the same as finding nothing.",
  "",
  "  brew install gitleaks",
  "  or a release binary: https://github.com/gitleaks/gitleaks/releases",
  "",
  "`ever-better bootstrap` writes a CI workflow that installs it for you; this command is for",
  "checking before you push.",
].join("\n");

export const NOT_A_REPOSITORY = [
  "Not a git repository, so there is no history to scan — and that is not a clean result.",
  "",
  "`gitleaks git` here would report `no leaks found` after scanning zero commits, which is why",
  "this refuses rather than passing that on.",
].join("\n");
