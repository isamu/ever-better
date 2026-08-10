---
description: Work a frozen backlog down one rule at a time — fix the violations, extract the pure function that makes a fix testable, write the test, prune the ceiling, commit. Automates everything it can and opens a GitHub issue only for a refactor that genuinely needs the owner's judgment. Use after `ever-better freeze`, or when the user says "warn を減らして", "backlog を潰して", "リファクタリングして", "drain the baseline", "テストを増やして".
---

# ever-better drain

The phase where the value is. Everything before this installs tooling and records a number; this is
where the number comes down and the bugs come out.

**Automate by default.** The only things that stop and ask are the ones where a wrong guess costs
the owner real work — see "What becomes an issue" below. Everything else you fix, test and commit.

## Before the loop: is this repository typed yet?

If it is still JavaScript, stop and run **`ever-better-migrate`** first. Refactoring untyped code is
done blind — the tier that finds the real bugs cannot run, so nothing but the tests disagrees with
you — and every rename surfaces its type errors *after* the move, which changes the shape of what
you just extracted. Migrate, then run the linter, read what it reports, and let that pick the work.

## The loop

One rule per pull request. Not one violation, not the whole backlog.

**Work the steps in order and say which one you are on.** They are numbered because each depends on
the one before: pruning before the fix reclaims nothing, and a test written after the refactor
asserts the code you just wrote. `ever-better status` and the worklist in `QUALITY.md` are the
checklist — re-read them between steps rather than carrying the position in your head, which is how
a step gets skipped and reported as done.

### 1. Pick the rule

```bash
npx ever-better next
```

It ranks the backlog by what the work costs rather than by how big the number is: the files one or
two edits from clean, the rules whose violations sit in the fewest files, the directories where a
rule survives in one last file, and the files heavy enough to leave alone for now. Take the top of
the first list, unless the user named a rule.

**The ranking is per file because the ratchet is per file.** A file with no suppression left for a
rule fails on the next violation of it, whatever that rule's total is elsewhere — so two violations
in one file buy more enforcement than twenty spread across twenty files, and the rule with 40
violations in three files is less work than the one with 38 across thirty-one.

`npx ever-better status` still answers the other question — which phase this is and how the whole
backlog is moving.

### 2. See the actual violations

```bash
<pm> lint 2>&1 | head -50
```

The suppressions file hides them, so read `eslint-suppressions.json` for which files carry the rule,
then look at those files. Or temporarily narrow: `npx eslint . --rule '{"<rule>":"error"}'` on the
files you care about.

### 3. Pin what the code does now — before you touch it

A refactor is a change that must **not** alter behaviour, and a test written afterwards cannot say
whether it did: it asserts the code you have just written. So the test goes first, against today's
code, at whatever seam already exists — the exported function, the CLI, the route. Run it and watch
it pass. That green is the baseline; when it is still green after the extraction, the extraction is
proven rather than assumed.

If nothing is callable without a filesystem or a network, do not skip the step — take the smallest
seam you can reach and cover that. Step 4 is where it gets easier to test, and a refactor done
before any coverage exists is one nobody can review.

For a change that is *supposed* to alter behaviour — a bug the rule uncovered — the same test runs
the other way: write it, watch it fail, then fix. And for a refactor that is purely types, `emit-diff`
in step 6b proves more than either (see below).

### 4. Fix them — and notice what the fix reveals

This is the part that is not mechanical. A lint rule is a proxy for a real problem, and the fix
usually surfaces it:

| Rule | What the fix usually uncovers |
| --- | --- |
| `no-unsafe-*`, `no-explicit-any` | a JSON or API response nobody validated; a field that is not the type the code assumes |
| `no-floating-promises` | an error that has been silently swallowed since the code was written |
| `consistent-type-assertions` | an `as` asserting something that was never true |
| `max-depth`, `complexity` | a branch nobody has read in years, often unreachable |
| `no-unused-vars` | the leftover half of an abandoned refactor |
| `security/detect-object-injection` | a lookup keyed on a string from outside, answered by the prototype chain |
| `sonarjs/slow-regex`, `sonarjs/super-linear-regex` | a pattern that is fine on every input anyone tried, and hangs on the one nobody did |

**The prototype lookup is worth hunting by hand, because it is the one bug the type system
endorses.** `Record<string, Thing>` says every key holds a `Thing`, so `table[key]` typechecks as a
`Thing` — while at runtime `key = "constructor"` returns a function nobody put there, `if (!found)`
does not fire, and the not-found branch is dead code. It has now turned up in an unrelated pair of
repositories: twice in a 13-year-old JavaScript CLI, six times in a current TypeScript UI. It is a
property of the language, not of old code.

Grep for the shape — any bracket access whose key is not a literal — and settle it once, one way,
for the whole repository: `Object.create(null)`, `Object.hasOwn()`, or a `Map`. Which one is the
owner's call; picking a different one per site is how it comes back.

**When a fix changes behaviour, that is a bug, and a bug gets a test.** Say so in the commit
message; do not fold it silently into a lint cleanup.

**`no-explicit-any` and the `no-unsafe-*` family are attacked from the source, never from the
site.** Types flow downhill: one annotation at the origin deletes the finding everywhere below it,
while twenty edits at the sites delete twenty findings and leave the cause. In order:

1. **First check whether the type already exists.** On a real codebase this is the largest category
   by a distance: the ORM already types the row it returns, the SDK already types its events, the
   component library already types its props — and someone wrote `: any` over the top of it. There
   is nothing to write. Deleting the annotation restores the type the compiler knew all along. Do
   this whole group before writing a single new type, because it is both the biggest and the
   cheapest, and it shrinks the count you are reasoning about.
2. **The origin** — `JSON.parse`, `await response.json()`, a library that genuinely returns `any`, a
   config read off disk. One type here usually collapses a whole cluster at once. Follow the flow
   upstream rather than counting: a single `any` on one private method has been measured taking out
   the types of an entire route, so one fix upstream beats twenty at the sites.
3. **The container before the elements.** If the members of an array or a record are `any`, go and
   find the type of the array and give it one — `Item[]`, not `any[]` fixed element by element. The
   element annotations then have nothing left to say and come out with it.
4. **`catch (e: any)`** is an access problem wearing a type: the body wants `e.message`. `unknown`
   plus one `errorMessage(error: unknown): string` helper settles every site at once, and the helper
   is pure, so it is a single test rather than fifty edits. Expect this to be the single largest
   identical group in the repository — 169 sites in one measured case, all collapsing into one
   four-line function.
5. **`as any` last.** It is not a type, it is an assertion that the checker was wrong, so removing
   one costs evidence about what the value really is. Some turn out to be right — those are the ones
   that deserve a named type rather than a deletion.

**Leave, and say which:** a type a dozen files read, a shape only the runtime knows (the fix there
is validation, not annotation), and anything on an exported signature. Those are the `deferred` and
`issue` entries, not this PR.

`npx ever-better next --fan-in` measures the first of those instead of guessing it — every row gains
how many files import it, so "a dozen files read this type" is a number. It is a flag because it
reads every source file, and it changes no ordering: a widely imported file is only expensive for
the rules that move types, and that judgement is yours.

**When `no-explicit-any` is measured in the thousands, it is not the rule to start with.** Finding
the ten violations that matter inside 1,413 is not a thing anyone does, and every other rule's
findings sit underneath it. Leaving it `off` at the beginning is sequencing, not surrender: clear
the mechanical tiers first — formatting, unused bindings, `var`, the `--fix`-able rules — and come
back to it once the repository is in shape. Taken last it is where the largest single reduction
comes from; taken first it is where the effort stops on day one.

What `off` must not become is the end state. A rule switched off is a place nobody is checking, and
`any` is not "the type is unknown" — it is a decision about the type that was never written down.

**When you do come back to it, that rule needs a ratchet of its own inside the ratchet,** because
the file-level suppressions do not stop the count climbing in a directory nobody has reached yet:

- **Promote by directory.** Hold the rule at `off` where nothing has been done, `warn` where work is
  in progress, and `error` on every directory that is finished. A finished directory cannot regress,
  and the boundary moves one directory at a time instead of the whole repo moving at once.
- **Slice an identical group.** 167 sites of the same shape went in as five PRs of roughly fifteen
  to twenty. The constraint is not that a reviewer refuses the big diff — the reviewer is an agent
  and will read all 167 without complaint. It is that recall falls as the diff grows, and every
  hunk in a group like this looks plausible, so the one site whose shape is genuinely different is
  exactly what a long review waves through. Slice for the accuracy of the review, not its capacity.
- **Inventory the remainder rather than counting it.** Once the cheap groups are gone, write down
  what each of the survivors actually needs — delete only, import a library type, write a new type,
  needs a design change — and the number stops being a wall. In one measured case most of the
  remaining hundred turned out to be delete-only, which is invisible while it is still a count.
- **Prove the behaviour did not move.** A type-only PR must produce identical output; `emit-diff`
  (step 6b) is the check. Changing behaviour while believing you were only fixing types is the
  failure mode this whole tier has.

**A rule ESLint can fix is not this work.** `no-var`, `prefer-const`, `no-else-return`,
`sonarjs/no-collapsible-if` and Prettier are all fixable: take the whole rule in one command —
`npx eslint . --fix --rule '{"<rule>":"error"}'` — read the diff, prune, commit. What is left over
afterwards is the judgment. The `var` the fixer would not touch is the clearest case: it declined
because a closure or a read outside the block depends on that function scope, which is the bug.

### 5. Make it testable — extract the pure part

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

### 6. Write the test — then make it fail on purpose

Cover the case that was broken, plus the boundary either side of it.

**Then break the thing under test and run the test again.** Revert the fix, or flip a comparison,
or return a constant. If the test still passes, it is testing nothing: it asserts on a value the
bug never touched, or mocks the very code it claims to cover. Restore, and confirm it goes green.

This costs thirty seconds and is the only thing that distinguishes a test from a decoration. A
suite that never went red is a suite nobody has evidence for — the count went up and the coverage
did not.

The same applies to a rule you have just switched on: make one violation on purpose and confirm the
lint reports it. A rule that is enabled and silently finds nothing reads exactly like a clean
codebase.

### 6b. For a type-only refactor, prove it rather than test it

Narrowing a parameter, deleting an `as`, splitting an interface, adding a guard that replaces a
cast — all of it erases at compile time. So compile before and after and compare the output:

```bash
npx ever-better emit-diff              # against HEAD
npx ever-better emit-diff --against main
```

Byte-identical emitted JavaScript **proves** the change cannot alter behaviour. No amount of test
coverage states that as strongly, and it takes seconds rather than an afternoon of writing tests
for code you did not mean to change.

When the output does differ, the files it names are exactly where to look — and usually the answer
is that the refactor was not type-only after all, which is worth knowing before review rather than
after.

### 6c. Leave the code more readable than the rule required

The rule is the trigger, not the goal. While you are in the function anyway, take the cheap wins —
but only the cheap ones, and only in the same commit if they are genuinely mechanical:

- **A name should not need a comment.** `elapsedMs`, not `t` with `// milliseconds`. Units belong
  in the name; so does the unit of measure in a boolean — `hasExpired` beats `expired`.
- **Delete the comment that restates the code.** Keep the one that says *why*, especially why the
  obvious alternative was rejected. A comment that will not age is a comment about a constraint.
- **Give an unexplained value a name.** A bare `86400` in a condition is a question; `SECONDS_PER_DAY`
  is an answer.
- **Return early.** Most `max-depth` and `complexity` findings are one guard clause away from
  disappearing, and the version with early returns reads top to bottom instead of inside out.
- **One job per function.** If you cannot name it without "and", that is two functions — and the
  split is usually what makes the pure half testable.
- **Shrink the scope.** A variable declared far from its use is a variable the reader has to carry.
- **Take one slice off the oversized file, every time you are in it.** File and function size come
  down in the later phases, but "later" never arrives for a 2000-line module if the only plan is one
  heroic split. Move the function you just made pure into its own file; lift out the one helper that
  has no business being there. Thirty lines a pass is what turns the split from a project into
  something that has already happened by the time anyone schedules it.

Do not turn a lint fix into a rewrite. If the readable version is a genuine redesign, that is an
issue, not this commit.

### 6d. Before you keep the extracted function, check it does not already exist

Duplication is not only a phase-five sweep — the cheapest moment to remove a copy is the moment you
are writing it. You have just made something pure and named it, so ask the tools first:

```bash
grep -n "<what it does>" docs/shared-helpers.md          # the catalogue, if the repo has one
npx --yes jscpd@4 <the files you touched> --reporters console --format "typescript,javascript"
```

Three outcomes, and only the middle one is work:

- **It exists** → call it, delete yours. A second implementation under a sixth name is the copy no
  scan will ever flag, because two independent versions of the same idea are rarely textually alike.
- **It exists twice, badly** → this is the extraction. Put the shared version in the standard module
  described under "Preventing the next copy" in **`ever-better-dry`** — a real place with a domain
  name, not `utils/misc.ts` — and point both callers at it.
- **It is genuinely local** → leave it in the file. A helper with one caller belongs next to it.

Then regenerate the catalogue (`npx ever-better catalog`) in the same commit, so the next person
searching finds what you just added rather than writing it again.

### 7. Reclaim the ceiling

```bash
npx ever-better prune
npx ever-better check
```

`prune` removes the suppressions whose violations are gone and lowers the ceiling by exactly that
much. Commit `eslint-suppressions.json` and `.ever-better/state.json` with the fix — they are part
of it.

**Never run `freeze` here.** It would re-pin the ceiling at today's number and quietly forgive
anything added since. It refuses by design; `--force` is not the answer to a red build.

### 8. Record what the rule cost, then commit and open the PR

```bash
npx ever-better log --kind drained --rule <rule> "12 violations; 1 real bug — parseDate returned undefined for an empty string"
```

Numbers are recorded for you; **what you found is not**. Write the entry as you finish the rule and
before the commit, not in a batch at the end — each is stamped with whatever is HEAD at that moment,
which is the only thing that makes an old entry re-checkable. It renders into the **Work log** in
`QUALITY.md`, which is what an owner who was not watching reads before any diff, so it wants the
rule, the count, and the one thing worth knowing rather than "fixed max-depth".

One rule per PR, and say in the body: the rule, how many violations it removed, the ceiling before
and after, and **every behaviour change with its test**. A reviewer needs to separate "renamed a
variable" from "this was returning undefined".

**When the edit re-indents a block, that is two commits, not one.** Wrapping a body in a guard, a
function or a `try` shifts every line inside it, and the formatter then rewraps them — so the diff
marks the whole block as changed and the three lines you actually wrote are invisible in it. Make
the edit keeping the existing indentation, commit that, then run the formatter and commit the
reflow on its own. The first diff is the change; the second is noise a reviewer can skip. Squashing
them back together is how a real edit hides inside a reformat.

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

```bash
npx ever-better log --kind issue --rule <rule> "opened #42 — swallowed error, product decision"
```

**A rule you walked past needs an entry as much as one you drained** — `issue` for what became
somebody's decision, `deferred` for what you looked at and chose to leave. Without one the ledger
shows a backlog that stopped moving and no reason why, which reads as an unattended run that quietly
gave up.

Everything else — a missing await, a narrowed type, a validated response, an extracted function, a
new test — you do, without asking.

## When the backlog is empty

The rule's suppressions are gone and `check` now rejects the next one automatically. Move to the
next smallest, and when the whole ledger is empty go to `ever-better-dry` for the duplication that
lint cannot see.
