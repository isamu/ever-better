# Run the tier we generate (#98)

`eslint.config.js` claims this repository runs every tier its own generator emits. It does not:
the generator emits `strictTypeChecked`, `stylisticTypeChecked` and a strict `ban-ts-comment`, and
this file runs `recommendedTypeChecked` alone. Every repository `bootstrap` touches is held higher
than this one, so the tier that is meant to be proven here has never been tried here.

## The rule this sets

**Strength parity, not option-for-option identity.** A tier the generator emits must be enabled
here. A rule *option* may differ where the two settings are equally strict and only point in
different directions — but an option that makes a rule **weaker** belongs in the generator too,
or the claim is false again by a smaller margin.

That splits the two options this change needs:

- `restrict-template-expressions` with `allowNumber: true` is a strength reduction, so the
  generator emits it as well.
- `consistent-type-definitions` set to `"type"` is a direction, not a strength. It stays local and
  the generator keeps its default.

## Steps

1. `eslint.config.js`: `strictTypeChecked` + `stylisticTypeChecked`, the generator's
   `ban-ts-comment` shape, and the two options above with their reasons.
2. `src/generate/eslintConfig.ts`: emit `restrict-template-expressions` with `allowNumber: true`.
3. `yarn lint --fix` for the mechanical half.
4. Fix by hand what no fixer can reach, below.
5. `yarn docs` for `docs/generated-config.md`, and update `test_render.ts` / `test_samplesDoc.ts`.
6. The full gate: `format:check`, `lint`, `typecheck`, `build`, `test`, `knip`.

## The manual findings

### `src/state.ts` — a type predicate that asserts more than it checks

`isState` verifies `version`, `rules` and `counters`, and asserts all of `State`. `State.log` is
`LogEntry[]`, not optional, so a 0.1.0 file with no `log` passes the guard and the compiler then
believes a field the file does not have.

That inverts the reading of every `??` downstream:

- `migrate`'s `log: state.log ?? []` is **load-bearing** and is reported as unnecessary
- the same expression in `appendLog`, `logOfKind` and `src/render/quality.ts` runs after `migrate`
  and is **dead**

Fix: give `migrate` an input type that admits the fields 0.1.0 omitted, so the necessary `??`
type-checks, then delete the three that are not. Do not reach for the quick direction — deleting
the `??` in `migrate` to satisfy the linter would remove the migration the comment promises.

A guard that under-verifies while over-asserting is the same escape hatch as `as`, which this repo
bans outright. It just does not look like one, which is the reason to write this down.

### `src/generate/knipConfig.ts` — `string | undefined` reaching a glob

`extensions[0]` is possibly-absent under `noUncheckedIndexedAccess` and the compiler cannot connect
that to the `length === 1` test guarding it. Unreachable at runtime, so this is type honesty rather
than a live bug — but the shape is how a generated config comes out matching nothing.

### `test/` — optional chains on non-nullish values, and `delete` on computed keys

Local to fixtures and teardown. Fix in place; nothing here is a statement about `src/`.

## What this deliberately does not do

- **`restrict-template-expressions` with `allowNumber: false`.** Nearly every violation is a count
  interpolated into a rendered report, which is this tool's native idiom. It would buy a hundred
  `String(n)` wrappers and one real finding, and the one real finding is fixed here anyway.
- **`prefer-readonly-parameter-types`.** Priced and far too noisy.
- **The tsc strictness flags.** Separate invariant, separate issue (#99).

## Verification

The counts move with `typescript-eslint`, so they are not the record — the gate is. What has to
hold after this lands: `yarn lint` exits 0 with no suppressions file, `yarn typecheck` exits 0, and
`test_render.ts` asserts the generated config carries the `allowNumber` option.

Measure the way this repo requires: `--pretty false` for `tsc`, this repo's own formatter for
ESLint counts, and never judge either through a pipe.
