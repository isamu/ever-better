# bootstrap and package.json

Issue: #47.

## The question that started it

"Does bootstrap overwrite package.json — do the original dependencies and name survive?"

They do. `addScripts` spreads: `{ ...parsed, scripts: { ...existing, ...scripts } }`, and no key is
special-cased. But nothing tested it, and two things around it are wrong.

## 1. Indentation is forced to two spaces

`JSON.stringify(updated, null, 2)` rewrites every line of a file indented with tabs or four spaces.
Nothing breaks; the bootstrap pull request stops being skimmable, which is the cost. npm detects and
preserves the existing indentation when it writes the same file, so this also makes two tools that
both edit `package.json` disagree about its shape.

Fix: `stringifyLike(original, value)` — JSON text shaped like the text it came from.

Preserving the indentation alone was not enough, and the review found both gaps:

- **Line endings.** `JSON.stringify` only ever emits `\n`, so a CRLF checkout was still rewritten
  line for line. The same function now carries the file's ending.
- **Indent width.** `JSON.stringify` clips a string `space` to ten characters, so the function meant
  to preserve indentation reformatted the widest files. Stringifying with one space and multiplying
  each leading run by the detected indent removes the ceiling instead of documenting it.
- **What counts as an indented line.** Anchoring the detector to a following `"` missed any file
  whose first indented line opens with `{` or a digit. JSON has no comments and escapes newlines
  inside strings, so an indented line is always structural: `\S` is simpler and correct.

**The trailing newline is deliberately still always written.** Preserving its absence would be the
same principle applied consistently, and would leave a file that the repo's own Prettier then
reports. A text file ends with a newline.

**Mixed line endings are normalised, also deliberately.** `bootstrap` adds lines, and a line that
did not exist in the original has no ending to preserve — any per-line rule would be invented. The
file's own ending wins.

## 2. The knip script is keyed off the knip dependency

```ts
if (!tooling.knip) additions["knip"] = "knip";
```

`tooling.knip` means "knip is a dependency, or there is a `knip.json`, or a workflow mentions it".
None of those is "there is a `knip` script". Every other addition guards on the script. This one is
wrong in both directions:

- **script, no dependency** — the repo's `"knip": "knip --production"` becomes `"knip": "knip"`.
  The only script bootstrap can overwrite.
- **dependency, no script** — nothing is added, and `renderDeadCodeWorkflow` emits
  `<pm> knip || true`. The script is missing, the `|| true` hides it, and the dead-code scan reports
  nothing for the life of the repository. This repo's own drain skill has the sentence for it: a
  scan that is enabled and silently finds nothing reads exactly like a clean codebase.

Fix: guard on the script, not on the dependency.

And there were **three** definitions of "has this script", two of them wrong: `format:check` carried
the identical truthiness bug, while `detectScripts` tested `typeof === "string"` — so `"lint": ""`
counted as present and `"knip": ""` counted as absent, in the same file. An empty script is how a
script gets disabled without being deleted. One exported `hasScript` now serves all three.

The dependency check that decides whether to *install* knip is unchanged.

## Files

| File | What |
| --- | --- |
| `src/util/jsonFormat.ts` | new, pure — `stringifyLike`: indentation, line endings, trailing newline |
| `src/packageScripts.ts` | new, pure — `withScripts(text, scripts)`, the whole merge |
| `src/commands/bootstrap.ts` | two lines around it |
| `src/detect/tooling.ts` | `hasScript`, exported; `detectScripts` defined in terms of it |
| `src/bootstrapPlan.ts` | both script guards use it |
| `test/test_jsonFormat.ts`, `test/test_packageScripts.ts` | new |
| `test/test_diagnose.ts` | the knip cases, both directions, plus the empty script |
| `test/e2e/lifecycle.e2e.ts` | a fixture carrying what bootstrap must not lose, and a tab indent |

The merge lives in a pure function taking the file's **text** rather than its path, so every promise
this tool makes about a file somebody else owns is a property of one function and is tested at unit
speed instead of behind a 25-second install.

## Verification

- unit tests for the whole write path: merge, unknown fields, existing scripts, two/four/tab/wide
  indents, CRLF, a `null` scripts field, a non-object file, and both knip directions
- the e2e runs a real `bootstrap` (a real install) against a tab-indented fixture carrying fields and
  a script bootstrap knows nothing about, and asserts all of it survives
- every fix break-verified: reverting it fails a test, with the patched line echoed and the file
  checksummed back afterwards
- the **committed** tree checked, not just the working tree — `git archive HEAD` into a clean
  directory, then typecheck. An earlier commit here passed every local check while containing none
  of its own changes
- `yarn format` / `lint` / `typecheck` / `build` / `test` / `knip` / `test:e2e`, exit codes checked
