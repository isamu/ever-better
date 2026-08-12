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

Fix: `detectJsonIndent(text)` — the whitespace on the first indented line — passed to
`JSON.stringify`. Pure, so it is tested directly: two spaces, four, a tab, CRLF, and a minified file
with no indentation to find, which falls back to two because there is nothing to preserve.

**The trailing newline is deliberately still always written.** Preserving its absence would be the
same principle applied consistently, and would leave a file that the repo's own Prettier then
reports. A text file ends with a newline.

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

Fix: guard on `options.packageJson?.scripts?.["knip"]`, the shape `format:check` already uses. The
dependency check that decides whether to *install* knip stays exactly as it is.

## Files

| File | What |
| --- | --- |
| `src/util/jsonIndent.ts` | new, pure — detect the indentation already in the file |
| `src/commands/bootstrap.ts` | write with it |
| `src/bootstrapPlan.ts` | the knip guard |
| `test/test_jsonIndent.ts` | new |
| `test/test_render.ts` | the knip script cases, both directions |
| `test/e2e/lifecycle.e2e.ts` | a fixture carrying what bootstrap must not lose, and a tab indent |

## Verification

- the e2e runs a real `bootstrap` (a real install) and asserts every original field, an existing
  script and the indentation survive it
- unit tests for the indent detector and for both knip directions
- `yarn format` / `lint` / `typecheck` / `build` / `test` / `knip` / `test:e2e`, exit codes checked
