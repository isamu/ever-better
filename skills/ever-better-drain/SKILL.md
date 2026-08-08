---
description: Work a frozen backlog down one rule at a time — fix the violations, extract the pure function that makes a fix testable, write the test, prune the ceiling, commit. Automates everything it can and opens a GitHub issue only for a refactor that genuinely needs the owner's judgment. Use after `ever-better freeze`, or when the user says "warn を減らして", "backlog を潰して", "リファクタリングして", "drain the baseline", "テストを増やして".
---

# ever-better drain

The phase where the value is. Everything before this installs tooling and records a number; this is
where the number comes down and the bugs come out.

**Automate by default.** The only things that stop and ask are the ones where a wrong guess costs
the owner real work — see "What becomes an issue" below. Everything else you fix, test and commit.

## The loop

One rule per pull request. Not one violation, not the whole backlog.

### 1. Pick the rule

```bash
npx ever-better status
```

It lists the **smallest** remaining backlogs first. Take the top one, unless the user named a rule.

Small first is deliberate: a rule that reaches zero is a rule that can never come back, because
`prune` removes its last suppression and `check` then rejects the next one. A half-drained large
rule protects nothing.

### 2. See the actual violations

```bash
<pm> lint 2>&1 | head -50
```

The suppressions file hides them, so read `eslint-suppressions.json` for which files carry the rule,
then look at those files. Or temporarily narrow: `npx eslint . --rule '{"<rule>":"error"}'` on the
files you care about.

### 3. Fix them — and notice what the fix reveals

This is the part that is not mechanical. A lint rule is a proxy for a real problem, and the fix
usually surfaces it:

| Rule | What the fix usually uncovers |
| --- | --- |
| `no-unsafe-*`, `no-explicit-any` | a JSON or API response nobody validated; a field that is not the type the code assumes |
| `no-floating-promises` | an error that has been silently swallowed since the code was written |
| `consistent-type-assertions` | an `as` asserting something that was never true |
| `max-depth`, `complexity` | a branch nobody has read in years, often unreachable |
| `no-unused-vars` | the leftover half of an abandoned refactor |

**When a fix changes behaviour, that is a bug, and a bug gets a test.** Say so in the commit
message; do not fold it silently into a lint cleanup.

### 4. Make it testable — extract the pure part

If you cannot write the test without a filesystem, a clock, a network call or a process, the
function is doing two jobs. Split it:

- the **decision** — takes plain values, returns a value, no I/O. This is what gets the test.
- the **effect** — reads, writes, spawns. Thin, no branching worth testing.

Pass what varies as an argument rather than reading it inside: the current time, the home
directory, the platform. A function that takes `now: Date` is testable; one that calls
`new Date()` is not.

This repo is the worked example: `gatherFacts` is the only function that touches the filesystem for
detection, `diagnose` is pure over what it returns, and that is why the diagnosis has real tests
and no fixtures on disk.

### 5. Write the test before moving on

Cover the case that was broken, plus the boundary either side of it. Then **break the fix on
purpose and run the test** — a test that passes against the bug is worse than no test, and this is
the only way to know.

### 6. Reclaim the ceiling

```bash
npx ever-better prune
npx ever-better check
```

`prune` removes the suppressions whose violations are gone and lowers the ceiling by exactly that
much. Commit `eslint-suppressions.json` and `.ever-better/state.json` with the fix — they are part
of it.

**Never run `freeze` here.** It would re-pin the ceiling at today's number and quietly forgive
anything added since. It refuses by design; `--force` is not the answer to a red build.

### 7. Commit and open the PR

One rule, and say in the body: the rule, how many violations it removed, the ceiling before and
after, and **every behaviour change with its test**. A reviewer needs to separate "renamed a
variable" from "this was returning undefined".

## What becomes an issue instead

Open a GitHub issue — do not guess — when the fix requires a decision only the owner can make:

- **The behaviour is ambiguous.** The code swallows an error; whether it should now throw, retry or
  log is a product decision.
- **The fix is a public API change.** A signature in a published package, a wire format, a config
  key someone else's file already uses.
- **The refactor is large enough to be its own project.** Splitting a 2000-line file, or a rule
  whose backlog is concentrated in one module that wants redesigning rather than editing.
- **The rule may be wrong for this repo.** If a rule's backlog is entirely one legitimate pattern,
  the answer might be to configure the rule, not to change the code — and that is the owner's call.

Write the issue with: the rule, the file and line, what the two or three options are, and what you
would pick and why. Then move to the next rule rather than blocking.

Everything else — a missing await, a narrowed type, a validated response, an extracted function, a
new test — you do, without asking.

## When the backlog is empty

The rule's suppressions are gone and `check` now rejects the next one automatically. Move to the
next smallest, and when the whole ledger is empty go to `ever-better-dry` for the duplication that
lint cannot see.
