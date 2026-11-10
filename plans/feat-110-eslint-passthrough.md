# ESLint options after `--`

Part of #110 — `--concurrency` only. The `--cache` family is left for its own change; see below.

## The gap

Every run `ever-better` starts uses a fixed argument list, so an option ESLint accepts only on the
command line cannot reach it. `--concurrency` is the one that matters: it cannot be set in
`eslint.config.js`, and with type-aware rules it decides whether the gate's slowest step uses one
core or several. The only way to get it today is to patch `dist/eslintRunner.js`.

## Approach

Arguments after `--` on the five commands that lint (`check`, `freeze`, `prune`, `report`, `tier`)
are checked against a list of what is **permitted** and forwarded to every lint run that command
starts. Anything else is refused with a message naming it, and nothing runs.

```
ever-better check --no-write -- --concurrency=auto
```

`src/eslintPassThrough.ts` is the rule: a pure function from the arguments to either the list to
forward or the reason it was refused.

## Decisions

- **A permitted list, not a banned one.** The issue names four arguments that would break the counts
  (`--format`, `--suppress-all`, `--suppressions-location`, `--fix`), but they are not the only ones:
  `--quiet` drops warnings and the warning counter falls with them, `--rule` and `--config` change
  what is enforced, `--max-warnings` changes the exit code the runner reads. A banned list is wrong
  the first time someone thinks of one more, and it fails open. This one fails closed: an argument
  nobody listed is refused, and widening the list is a deliberate change with its own test.
- **`--concurrency` only, for now.** `--cache` skips files, and whether a cached run reports the same
  per-file suppressed counts as a full one has not been measured against real ESLint. It belongs in
  the list once it has been, in its own change.
- **The value is checked by ESLint's own rule** (`validateConcurrency` in its `lib/cli.js`: `auto`,
  `off`, or anything `Number` reads as a positive integer), so a typo is reported by `ever-better`
  rather than as an ESLint failure halfway through `freeze`, and nothing ESLint accepts is refused.
  A number is forwarded as `Number` reads it (`04` becomes `4`), so only digits, `auto` or `off`
  reach ESLint. Both `--concurrency=N` and `--concurrency N` are accepted.
  Giving it twice is refused rather than guessing which one wins.
- **`printConfig` and `canLint` do not get it.** They read one file; there is nothing to parallelise.
- **`log` is unchanged.** It reads its text from positionals, and `--` there still means "the rest
  is text". Other commands that do not lint ignore positionals as before.

## Verification

- the rule against real ESLint: a set of values, the odd ones included (`04`, `0x4`, `1e1`, an
  overflowing digit string), passed to ESLint 10 and to `parseEslintPassThrough` agree on every one
- the rule, in both directions: each accepted form, and a refusal for an unknown flag, a missing or
  malformed value, a repeat, a bare positional, and the arguments the issue names
- the CLI split: positionals before `--` stay with the command, those after go to the rule
- end to end against real ESLint: `check -- --concurrency=2` passes on the lifecycle fixture, and an
  unknown argument fails before ESLint runs
