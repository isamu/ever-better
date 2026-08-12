import { SECRET_FINDING_EXIT_CODE } from "./generate/secretScan.ts";

export type SecretVerdict = {
  ok: boolean;
  message: string;
};

const CLEAN_EXIT_CODE = 0;

/**
 * gitleaks answers "I found a secret" and "I could not run" with the same 1 unless a findings code
 * is asked for, so the run passes `--exit-code 2` and this reads three outcomes rather than two.
 * Measured against gitleaks 8.30.1, both directions.
 *
 * A finding is deliberately not called fixable: the key is already public and on somebody else's
 * dashboard, and deleting the line changes nothing about that.
 */
export const interpretGitleaks = (code: number, output: string): SecretVerdict => {
  if (code === CLEAN_EXIT_CODE) return { ok: true, message: "No secrets found in the history." };
  if (code === SECRET_FINDING_EXIT_CODE) {
    return {
      ok: false,
      message: ["Secrets found. Rotate them first — they are already public, and removing the line does not un-publish them.", "", output.trim()]
        .filter((line) => line.length > 0)
        .join("\n"),
    };
  }
  return {
    ok: false,
    message: [`gitleaks could not complete the scan (exit ${code}). This is not a clean result — nothing was checked.`, "", output.trim()]
      .filter((line) => line.length > 0)
      .join("\n"),
  };
};

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
  "`gitleaks detect` here would report `no leaks found` after scanning zero commits, which is why",
  "this refuses rather than passing that on.",
].join("\n");
