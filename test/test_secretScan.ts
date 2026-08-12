import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderSecretScanWorkflow, SECRET_FINDING_EXIT_CODE, GITLEAKS } from "../src/generate/secretScan.ts";
import { combineScans, FOUND_IN, interpretGitleaks } from "../src/secretScan.ts";
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
    assert.equal(verdict.code, SECRET_FINDING_EXIT_CODE);
    assert.match(verdict.message, /Rotate them/);
    assert.match(verdict.message, /RuleID: github-pat/);
  });

  /**
   * A key in the history is public and rotation is the only fix; one that is merely uncommitted is
   * not published yet, and telling someone to rotate it as though it were is advice they will learn
   * to discount.
   */
  it("gives different advice for the working tree than for the history", () => {
    const uncommitted = interpretGitleaks(SECRET_FINDING_EXIT_CODE, "", FOUND_IN.workingTree);
    assert.match(uncommitted.message, /not committed yet/);
    assert.doesNotMatch(uncommitted.message, /in every clone/);
    assert.match(interpretGitleaks(SECRET_FINDING_EXIT_CODE, "", FOUND_IN.history).message, /in every clone/);
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

  /** The distinction is only worth making if a caller can still read it. */
  it("carries an exit code of its own rather than collapsing to failure", () => {
    assert.equal(interpretGitleaks(0, "").code, 0);
    assert.equal(interpretGitleaks(SECRET_FINDING_EXIT_CODE, "").code, SECRET_FINDING_EXIT_CODE);
    assert.equal(interpretGitleaks(1, "").code, 1);
    assert.equal(interpretGitleaks(126, "").code, 1);
  });
});

describe("combineScans", () => {
  const clean = () => interpretGitleaks(0, "");
  const found = () => interpretGitleaks(SECRET_FINDING_EXIT_CODE, "a finding");
  const failed = () => interpretGitleaks(1, "could not run");

  it("passes only when every scan passed", () => {
    assert.equal(combineScans([clean(), clean()]).code, 0);
  });

  it("reports findings from either scan", () => {
    assert.equal(combineScans([clean(), found()]).code, SECRET_FINDING_EXIT_CODE);
    assert.equal(combineScans([found(), clean()]).code, SECRET_FINDING_EXIT_CODE);
  });

  /** "One of them could not look" must never come back as "nothing found". */
  it("lets a failed scan outrank a clean one", () => {
    assert.equal(combineScans([clean(), failed()]).code, 1);
    assert.match(combineScans([clean(), failed()]).message, /not a clean result/);
  });

  /** A scan that could not run might be the one holding the other finding. */
  it("reports the failure even when the other scan found something", () => {
    assert.equal(combineScans([found(), failed()]).code, 1);
  });

  /** The failing code must not cost the finding that names a file. */
  it("keeps every message, whichever code wins", () => {
    const both = combineScans([found(), failed()]);
    assert.match(both.message, /a finding/);
    assert.match(both.message, /could not run/);
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
    assert.match(yaml(), /run: gitleaks git \./);
    assert.match(yaml(), /not gitleaks-action/);
  });

  /**
   * `git` and `dir`, not `detect`: 8.30's own `--help` lists the first two and not the third, so
   * the alias this was adapted from is on its way out. A pinned version means it still works today,
   * and a bump that removes it would fail the job rather than silently scan nothing.
   */
  it("uses a subcommand gitleaks still documents", () => {
    assert.doesNotMatch(yaml(), /gitleaks detect/);
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

  /**
   * A config file is not a scanner. `.gitleaks.toml` beside nothing that reads it scans exactly
   * nothing, and counting it suppressed the gap — for a security check, a false "already covered"
   * is silence where a false gap is only noise.
   */
  it("does not count a config file with nothing running it", () => {
    assert.equal(tooling([".gitleaks.toml"], "").secretScanning, false);
  });

  it("does not count a comment that merely mentions a scanner", () => {
    assert.equal(tooling([], "# we should add gitleaks one day\nrun: yarn lint").secretScanning, false);
  });

  /** The case the comment filter is actually for: a step commented out rather than deleted. */
  it("does not count a commented-out scanner step", () => {
    assert.equal(tooling([], "steps:\n  # - run: gitleaks git .\n  - run: yarn lint").secretScanning, false);
    assert.equal(tooling([], "  #- uses: trufflesecurity/trufflehog@main").secretScanning, false);
  });

  it("does not count a scanner named in a job name or an env var", () => {
    assert.equal(tooling([], "name: gitleaks (disabled)\nenv:\n  TRUFFLEHOG: 1").secretScanning, false);
  });

  /**
   * The rule enumerates what counts as running a scanner rather than what does not, because the
   * ban-list version lost three rounds: a comment, a commented-out step, `echo gitleaks`, then an
   * unrelated action whose name merely starts with one.
   */
  it("does not count a scanner that is only an argument to something else", () => {
    assert.equal(tooling([], "run: echo gitleaks").secretScanning, false);
    assert.equal(tooling([], "run: yarn lint # gitleaks").secretScanning, false);
    assert.equal(tooling([], "run: grep -r trufflehog .").secretScanning, false);
  });

  /**
   * The only direction that is unacceptable: a line that runs nothing reading as covered. `uses:`
   * has to be the line's own key, not text inside a command that echoes it.
   */
  it("does not count a command that merely prints a uses: line", () => {
    assert.equal(tooling([], "run: 'echo uses: gitleaks/gitleaks-action@v2'").secretScanning, false);
    assert.equal(tooling([], 'run: echo "uses: gitleaks/gitleaks-action@v2"').secretScanning, false);
  });

  /**
   * Known false GAPS, pinned so they are a decision rather than an accident. Each runs a scanner
   * and reads as unscanned, which costs a workflow nobody needed — the safe direction. Closing
   * them means parsing a nested shell command or knowing what a docker image contains, which is
   * the ban-list game again with a worse board.
   */
  it("misses a scanner buried in a nested shell or a container, and that is the safe way to be wrong", () => {
    assert.equal(tooling([], "run: bash -c 'gitleaks git .'").secretScanning, false);
    assert.equal(tooling([], "run: docker run zricethezav/gitleaks git .").secretScanning, false);
  });

  it("does not count an action that merely shares a prefix", () => {
    assert.equal(tooling([], "uses: example/gitleaks-docs@v1").secretScanning, false);
    assert.equal(tooling([], "uses: someone/not-trufflehog@main").secretScanning, false);
  });

  it("counts the real actions", () => {
    assert.equal(tooling([], "uses: gitleaks/gitleaks-action@v2").secretScanning, true);
    assert.equal(tooling([], "        uses: trufflesecurity/trufflehog@main").secretScanning, true);
  });

  /** The forms a workflow actually invokes it in, including inside a `run: |` block. */
  it("counts an invocation however it is written", () => {
    assert.equal(tooling([], "      - run: gitleaks git .").secretScanning, true);
    assert.equal(tooling([], "run: npx gitleaks dir .").secretScanning, true);
    assert.equal(tooling([], "run: sudo /usr/local/bin/gitleaks git .").secretScanning, true);
    assert.equal(tooling([], "run: FOO=bar gitleaks git .").secretScanning, true);
    assert.equal(tooling([], "run: env gitleaks git .").secretScanning, true);
    assert.equal(tooling([], "      run: |\n        gitleaks git . --redact").secretScanning, true);
  });

  /** Nearly every workflow mentions `secrets.GITHUB_TOKEN`; that is not a secret scanner. */
  it("is not fooled by a workflow that merely reads a secret", () => {
    assert.equal(tooling([], "env:\n  TOKEN: ${{ secrets.GITHUB_TOKEN }}").secretScanning, false);
  });

  it("reports nothing configured when nothing is", () => {
    assert.equal(tooling(["package.json"], "run: yarn lint").secretScanning, false);
  });
});
