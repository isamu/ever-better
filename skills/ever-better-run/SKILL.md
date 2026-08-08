---
description: Run the whole ever-better process on a repository unattended — diagnose, install, freeze, then drain the backlog rule by rule until it is empty, then duplication and dead code. Opens issues for the decisions it must not make alone and keeps going. Use when the user hands over a repo with "きれいにして", "全部やっておいて", "品質上げといて", "clean this repo up", "run ever-better on this", or asks for the process to run without supervision.
---

# ever-better run

The unattended mode. The user has handed you a repository and expects to come back to pull
requests, not questions.

**Default to acting.** Everything in this process that can be decided from the code, you decide.
The list of things that stop and ask is short and is written down below — if something is not on
it, do it.

## Before anything

1. **Confirm the working tree is clean.** `git status --porcelain`. If it is not, stop and say so:
   this process installs packages and rewrites files, and untangling that from someone's own work
   afterwards is not worth the risk.
2. **Confirm you may open pull requests**, and on which base branch. `gh repo view --json defaultBranchRef`.
3. **Say how long this will take and what will arrive.** A first run on an untouched repository
   produces: one formatting PR, one bootstrap PR, one freeze PR, then one PR per rule. That is not
   two or three pull requests, and the user should know before you start.

## The run

### Phase 0-2: get to a frozen baseline

```bash
npx ever-better diagnose
```

Read it, then follow **`ever-better-bootstrap`** and **`ever-better-freeze`**. Three separate pull
requests, in this order, each merged before the next:

1. **`chore: format`** — mechanical, whole-repo, unreviewable if mixed with anything else.
2. **`chore: quality tooling`** — the bootstrap output: ESLint config, scripts, `.gitattributes`,
   workflows.
3. **`chore: freeze the baseline`** — `eslint-suppressions.json`, `.ever-better/state.json`,
   `QUALITY.md`.

After (3), CI rejects any new violation. Everything from here is optional cleanup that can stop at
any point without leaving the repo worse.

### Phase 3: drain, until it is empty

Loop with **`ever-better-drain`**. One rule per pull request, smallest backlog first:

```
npx ever-better status      -> smallest remaining rule
   fix it, extract the pure function, write the test
npx ever-better prune
npx ever-better check
   commit, PR, wait for CI, merge
repeat
```

Keep going while the backlog is non-empty and nothing on the stop list below has come up. Report
progress as you go — the ceiling before and after each PR is the number that matters.

### Phase 4: tighten

When the backlog is empty, add the next tier and freeze again. Type-aware rules first if the repo
is TypeScript and they were off, then `eslint-plugin-security` if it touches the filesystem, child
processes or user input. Each tier is a bootstrap + freeze pair, and then drain again.

### Phase 5: duplication and dead code

**`ever-better-dry`**. These are report-only and never gate, so this phase is pure cleanup.

## The stop list

Open a GitHub issue, then **continue with the next item** — do not wait:

| Situation | Why it is not yours |
| --- | --- |
| The fix changes behaviour ambiguously | Should this throw, retry or log? That is a product decision. |
| The fix changes a public API | A published signature, a wire format, a config key in someone's file. |
| A refactor is a project in itself | Splitting a 2000-line file; a module that wants redesigning rather than editing. |
| A rule looks wrong for this repo | The answer may be to configure the rule, not change the code. |
| CI fails for a reason unrelated to your change | Flaky test, expired secret, broken runner. Report; do not "fix" it by disabling. |

Each issue: the rule, the file and line, the two or three options, and which one you would pick
with the reason. Then move on.

**Stop the whole run** — and ask — only for these:

- The working tree was dirty, or the repo has uncommitted work you did not create.
- `freeze` reports violations it could not suppress. That is a broken config, and every later PR
  would be red.
- Two consecutive drain PRs fail CI for reasons you cannot diagnose.
- The user's own CI was already failing before you started.

## Reporting back

When you stop — finished or blocked — say:

- the ceiling at the start and now, and how many rules reached zero
- every behaviour change you made, with the test that pins it
- every issue you opened and why it was not yours to decide
- what is left, and what running again would do

## What this never does

- Merges to the default branch without CI green.
- Runs `freeze` a second time to make a red build green. It refuses; `--force` is not the answer.
- Weakens a rule, adds an ignore comment, or widens an ignore glob to get past a failure. If a rule
  is genuinely wrong for the repo, that is an issue, not an edit.
- Rewrites an ESLint config the repo already had. The exceptions in it have reasons that are not in
  the file.
