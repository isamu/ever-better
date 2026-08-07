---
description: Pin a repository's current lint violations as a ceiling that can only fall, and wire CI to enforce it. Use after `ever-better-bootstrap`, or when the user says "ベースラインを固定して", "freeze the baseline", "既存のエラーは許して新しいのだけ止めたい", "grandfather the existing violations". Also covers reclaiming the ceiling with prune after a fix.
---

# ever-better freeze

Record every violation that exists right now, so that from this commit on, only new ones fail.

## What actually happens

`eslint --suppress-all` writes `eslint-suppressions.json`: per file, per rule, how many violations
exist today. ESLint then stays silent about exactly that many and reports anything beyond them as
an error. `ever-better` runs it, records the same counts in `.ever-better/state.json`, and renders
`QUALITY.md` from them.

The ledger is not a duplicate of the suppressions file. It carries the diagnosis, the phase, and
the ceiling per rule in one place a human and an agent can both read.

## Steps

### 1. Make sure the tree is committed and formatted

Freezing an unformatted tree bakes formatting violations into the ceiling, and the first `format`
run afterwards then looks like an improvement that nobody made. Format, commit, then freeze.

### 2. Freeze

```bash
npx ever-better freeze
```

Read the output. It says how many violations were grandfathered and across how many rules. **If it
reports violations that could not be suppressed, stop** — those are almost always parse errors or
a misconfigured plugin, and CI will be red from the first push. Fix the configuration, delete
`eslint-suppressions.json`, and freeze again.

### 3. Commit the three artifacts together

```
eslint-suppressions.json     ESLint's record — the ceiling itself
.ever-better/state.json      the ledger
QUALITY.md                   the human view, rendered from the ledger
```

They only make sense as a set. Say in the commit message what the baseline number is — it is the
number every later PR is measured against, and it belongs in the history.

### 4. Wire the gate

CI must run `npx ever-better check` on every pull request. Without it the ceiling is a note, not a
ratchet. If `bootstrap` generated `.github/workflows/ci.yml`, the step is already there; otherwise
add it after the lint step.

`check` exits non-zero when there are unsuppressed violations, or when any recorded count rose.

### 5. Tell the user what changed about their workflow

Three things, and they are the whole point:

- New code is now held to every rule. Old code is not.
- A red `check` means the diff added something — not that the repo is bad.
- Fixing grandfathered violations is optional and always welcome. `QUALITY.md` lists them
  smallest-first.

## After a fix: prune, do not re-freeze

When someone fixes a grandfathered violation, the suppression it used is now stale. Reclaim it:

```bash
npx ever-better prune
```

This lowers the ceiling by exactly what was fixed, and commits alongside the fix.

**`freeze` refuses to run a second time, on purpose.** Re-freezing would pin whatever exists at
that moment, quietly legalising everything added since — which is the one thing the baseline
exists to prevent. `--force` exists for the genuine case of a rule being reconfigured, and should
be explained in the PR when used.

## When the count goes up anyway

`check` failing is the system working. Before touching any config, find out which of these it is:

- **the diff genuinely added a violation** → fix the diff
- **a rule was upgraded and now reports more** → that is a rebaseline (`freeze --force`), and it
  belongs in its own PR with the reason written down
- **a file moved** → suppressions are keyed by path, so a rename looks like new violations plus
  stale suppressions. `prune`, then `freeze --force`, in one commit with the rename.
