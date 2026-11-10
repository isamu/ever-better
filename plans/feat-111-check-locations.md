# A failing `check` says where

Closes #111.

## The gap

`check` fails on unsuppressed errors with the rule and the count and nothing else, so a repository
keeps `eslint .` in its gate beside `check` purely to get the locations on screen — the same lint
twice, and with type-aware rules each run is the slowest step of the gate.

## Approach

The formatter emits a `locations` list beside the counts: one entry per unsuppressed **error**
(file relative to the ESLint cwd with `/` separators, line, column, rule, message), and nothing for
warnings or suppressed findings. It is capped, so the output stays bounded the way the counts are:
after a freeze the unsuppressed set is normally empty, and a failing run has a handful.

`checkVerdict` takes the list as an optional third argument and, when errors fail the run, appends a
"Where they are" block under the per-rule summary, followed by "… and N more — run `eslint .` for the
full list" when the cap cut it short. N is the error total minus what was listed, so it is right
whichever side of the cap the run lands on.

A passing run prints exactly what it printed before, and so does a ceiling regression — those have
no unsuppressed errors to locate.

## Decisions

- **Relative paths are computed in the formatter**, where `context.cwd` is known, rather than in the
  CLI. That keeps `checkVerdict` pure over strings, and `/` keeps the output identical on Windows.
- **A parse error is listed too**, as `(parse error)`, because it is an unsuppressed error and fails
  the gate the same way.
- **A path or message from the linted code is made printable before it is printed**
  (`src/util/terminalText.ts`): a parse error can quote the offending source character, so a file in
  a pull request could otherwise put an ESC sequence or a carriage return into the CI log and make a
  failing gate read as clean. `freeze`'s parse-error sample goes through the same function. Rule ids
  are not escaped — they come from the plugins the repository configures, not from file content.
- **`unattributed` is left as it is.** `freeze` reads it, and after `--suppress-all` it is the same
  set; folding the two together is a separate change.
- **`tier --check` is out of scope.** It gates a different ledger and reports through its own path.

## Verification

- formatter tests: errors listed with relative path, warnings and suppressed findings never listed,
  the cap, a parse error
- `checkVerdict` tests: the block appears only on an error failure, the "and N more" line appears
  only when truncated, a pass and a ceiling regression are unchanged
- the formatter's loop body moved into `tallyMessage` to stay under the complexity limit; the old
  formatter from `main` was run beside the new one over generated results and every output matched
  byte for byte once `locations` was removed
- the end-to-end lifecycle test asserts the new violation's file appears in the failing `check`
