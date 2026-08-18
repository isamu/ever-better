# `eslint-disable` is the exemption nothing counts

Issue: #56.

## Measured first

The generated config was rendered into a fixture and run against real ESLint 10.8.1, one file per
escape hatch. `any`, `as`, `!`, `@ts-ignore`, `@ts-nocheck` and a description-less
`@ts-expect-error` are all errors already. A **live** `eslint-disable` is honoured: the rule it
names simply stops reporting.

`reportUnusedDisableDirectives: "error"` was already generated and does not help — it catches a
directive that suppresses *nothing*, which is the opposite case.

## Why it is worse here than elsewhere

| | recorded | visible to `status` / `next` / `report` | `prune` can reclaim it |
| --- | --- | --- | --- |
| `eslint-suppressions.json` | yes, as a count | yes | yes — the ceiling falls |
| an `eslint-disable` comment | no | no | no |

A disabled violation is invisible to the linter, so `--suppress-all` never records it either. It is
a permanent exemption that nothing counts, in a tool whose one promise is that the ceiling can fall
but never rise.

## The fix

`linterOptions.noInlineConfig: true`, verified to restore the error and to report the now-inert
directives.

**The migration only works because the ratchet exists.** Set before `freeze`, every violation an
existing disable comment was hiding becomes visible exactly once, lands in the ceiling, and drains
like everything else. The sanctioned escape hatch becomes the suppressions file — the counted one.

Cost: legitimate inline configuration goes too (`/* eslint-env */`, per-file rule overrides). Same
trade the config already makes everywhere else.

## Also: this repository is weaker than what it generates

`eslint.config.js` here has no `linterOptions` block at all — ESLint's default is
`reportUnusedDisableDirectives: "warn"`, and there is no `noInlineConfig`. CLAUDE.md says this repo
runs every tier it generates. No live disable directives exist in `src/`, `test/`, `formatters/` or
`scripts/`, so adopting it costs nothing today and stops the next one silently.

## Files

| File | What |
| --- | --- |
| `src/generate/eslintConfig.ts` | `noInlineConfig: true`, and the header comment names the directive |
| `eslint.config.js` | dogfood the same block |
| `test/test_render.ts` | assert it is generated, and why |
| `docs/generated-config.md` | regenerated |

## Verification

- the fixture re-run: the `any` behind a disable comment is an error again
- break-verified: removing the line puts the hole back
- `yarn format` / `lint` / `typecheck` / `build` / `test` / `knip`, exit codes checked
