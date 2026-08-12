import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSecretScanWorkflow, SECRET_FINDING_EXIT_CODE, GITLEAKS } from "../src/generate/secretScan.ts";
import { interpretGitleaks } from "../src/secretScan.ts";
import { detectTooling } from "../src/detect/tooling.ts";

/**
 * The exit codes are measured against gitleaks 8.30.1, not read from documentation:
 * clean 0, findings at whatever `--exit-code` asks for, and 1 for "the scan itself failed".
 * That last one is why findings get a code of their own.
 */
describe("interpretGitleaks", () => {
  it("passes a clean history", () => {
    const verdict = interpretGitleaks(0, "no leaks found");
    assert.equal(verdict.ok, true);
  });

  it("fails on findings, and says rotation rather than deletion", () => {
    const verdict = interpretGitleaks(SECRET_FINDING_EXIT_CODE, "RuleID: github-pat");
    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /Rotate them first/);
    assert.match(verdict.message, /RuleID: github-pat/);
  });

  /** The distinction the whole exit-code choice exists for. */
  it("does not report a failed scan as a leak", () => {
    const verdict = interpretGitleaks(1, "fatal: not a git repository");
    assert.equal(verdict.ok, false);
    assert.match(verdict.message, /could not complete the scan/);
    assert.doesNotMatch(verdict.message, /Rotate/);
  });

  it("treats any other code as a failed scan rather than a pass", () => {
    assert.equal(interpretGitleaks(127, "command not found").ok, false);
    assert.equal(interpretGitleaks(-1, "killed").ok, false);
  });
});

describe("renderSecretScanWorkflow", () => {
  const yaml = (): string => renderSecretScanWorkflow();

  /** A shallow clone misses the commit that leaked, which is the only commit that matters. */
  it("scans the whole history", () => {
    assert.match(yaml(), /fetch-depth: 0/);
  });

  it("keeps the secret out of the log", () => {
    assert.match(yaml(), /--redact/);
  });

  it("gives findings their own exit code, so a broken scan is not read as a leak", () => {
    assert.match(yaml(), new RegExp(`--exit-code ${SECRET_FINDING_EXIT_CODE}`));
  });

  /** Fetching a scanner over the network unverified is its own supply-chain hole. */
  it("verifies the download against a pinned checksum", () => {
    assert.match(yaml(), /sha256sum -c -/);
    assert.match(yaml(), new RegExp(GITLEAKS.sha256));
    assert.match(yaml(), new RegExp(`GITLEAKS_VERSION: ${GITLEAKS.version.replaceAll(".", "\\.")}`));
  });

  it("pins a checksum that is the right shape to be one", () => {
    assert.match(GITLEAKS.sha256, /^[0-9a-f]{64}$/);
  });

  /**
   * gitleaks-action needs a licence key under an Organization; the CLI is MIT. The name appears in
   * the comment saying so, which is the point — the assertion is that nothing `uses:` it.
   */
  it("runs the CLI rather than the action", () => {
    assert.doesNotMatch(yaml(), /uses:.*gitleaks/);
    assert.match(yaml(), /run: gitleaks detect/);
    assert.match(yaml(), /not gitleaks-action/);
  });

  it("asks for no more than reading the repository, and does not keep the token", () => {
    assert.match(yaml(), /permissions:\n {2}# [^\n]*\n {2}contents: read/);
    assert.match(yaml(), /persist-credentials: false/);
  });

  it("says why it has no baseline, since every other check here does", () => {
    assert.match(yaml(), /no baseline/);
  });
});

describe("secret scanning detection", () => {
  const tooling = (rootEntries: string[], workflowText: string) => detectTooling(rootEntries, null, workflowText);

  it("sees a workflow that runs a scanner", () => {
    assert.equal(tooling([], "run: gitleaks detect --source .").secretScanning, true);
    assert.equal(tooling([], "uses: trufflesecurity/trufflehog@main").secretScanning, true);
  });

  it("sees a gitleaks config at the root", () => {
    assert.equal(tooling([".gitleaks.toml"], "").secretScanning, true);
  });

  /** Nearly every workflow mentions `secrets.GITHUB_TOKEN`; that is not a secret scanner. */
  it("is not fooled by a workflow that merely reads a secret", () => {
    assert.equal(tooling([], "env:\n  TOKEN: ${{ secrets.GITHUB_TOKEN }}").secretScanning, false);
  });

  it("reports nothing configured when nothing is", () => {
    assert.equal(tooling(["package.json"], "run: yarn lint").secretScanning, false);
  });
});
