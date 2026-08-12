# Secret scanning

Issue: #50. Reference implementation: receptron/mulmoclaude `.github/workflows/secret-scan.yml`.

## Why it does not fit the ratchet, which is the whole reason it is separate

Every other finding here is grandfathered: `--suppress-all` records what exists, old code is
forgiven, new code is held to the rule. **A leaked key cannot work that way.** It is not debt to
drain in priority order — it is already public, and the fix is rotation, outside the repository.

So this is a gate from the first run, with no baseline and no ceiling. The opposite of everything
else in the tool, and the reason it is its own command rather than another tier in `bootstrap`.

## The exit codes, measured

gitleaks 8.30.1, run locally rather than read from documentation:

| case | exit |
| --- | --- |
| clean repository | 0 |
| findings, `--exit-code 1` | 1 |
| findings, `--exit-code 7` | 7 |
| **source unreadable — the scan itself failed** | **1** |

The last row is the trap. With `--exit-code 1` — which the reference workflow uses — **"a secret was
found" and "gitleaks could not run" are the same exit code.** The gate is still safe, since both
fail, but the message a human reads is wrong: a broken scanner sends someone hunting for a leak that
does not exist, and the person who eventually works that out trusts the check less.

So the generated workflow and the local command both use `--exit-code 2`:

- `0` clean
- `2` findings — the gate
- anything else, `1` included — the scan failed, and it says so

Two fixture traps found on the way, both of which would have produced a confident wrong answer:

- `AKIAIOSFODNN7EXAMPLE` is **allowlisted by gitleaks** — it is AWS's own documented example key. A
  fixture built from it reports "no leaks found" and reads as "the scanner does not work".
- A `ghp_` token has to be exactly 36 characters *and* pass an entropy check. A sequential alphabet
  fails both.

Any test that plants a secret has to plant one that is actually detectable, and prove it by watching
the scan fail before trusting the run where it passes.

## What is generated

`.github/workflows/secret-scan.yml`, carrying the reference implementation's hard-won details rather
than rediscovering them:

- **the gitleaks CLI binary, not `gitleaks-action`** — the action requires a licence key under a
  GitHub Organization; the CLI is MIT
- **the download is checksum-verified** against a pinned version. A scanner fetched over the network
  without verification is its own supply-chain hole
- **`fetch-depth: 0`** — the point is the whole history; a shallow clone misses the commit that
  leaked
- **`--redact`** so the finding does not print the secret into a public log
- `persist-credentials: false`, `permissions: contents: read`

## What is not attempted

- **Rotation.** A finding is not fixable by this tool: the key is already public and on someone
  else's dashboard. The command reports and stops, and must never suggest that deleting the line
  fixes it.
- **A baseline.** There is deliberately no way to grandfather a finding. `.gitleaksignore` is
  gitleaks' own mechanism and is the right place for a false positive.
- **GitHub's native secret scanning / push protection**, which cannot be detected from the
  repository contents — so a repo that has it still gets the gap reported. Said out loud in the gap
  text rather than left to confuse someone.

## Files

| File | What |
| --- | --- |
| `src/generate/secretScan.ts` | the workflow, plus the pinned version and checksum |
| `src/detect/tooling.ts` | detect gitleaks / trufflehog in a workflow or a config file |
| `src/diagnose.ts` | the gap |
| `src/bootstrapPlan.ts` | write the workflow when nothing scans today |
| `src/secretScan.ts` | pure — turn an exit code into a verdict |
| `src/commands/secrets.ts` | run gitleaks locally; a command that can fail |
| `src/cli.ts` | dispatch alongside `check`, since it has an exit code that matters |
| tests, `README.md`, `README.ja.md` | |

## Verification

- the exit-code contract against the real gitleaks, both directions, with a fixture whose secret is
  proven detectable
- generator output asserted on the details above, each of which exists for a stated reason
- `yarn format` / `lint` / `typecheck` / `build` / `test` / `knip`, exit codes checked
