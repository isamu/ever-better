# Offer the strictness flags we were not offering (#99)

`docs/HANDOFF.md` sets the target as "`strict` plus every flag it does not include".
`STRICTNESS_FLAGS` delivers six, and this repository's own `tsconfig.json` carries exactly those
six — the two have matched so far and should keep matching.

Two more measure at zero cost here, and one of them exposes a limit in the mechanism: every flag is
assumed to be turned on with `true`, so a flag that is strict when set to **`false`** cannot be
offered at all.

## The shape

`StrictnessFlag` gains the value that makes it strict. The pipeline currently flattens flags to
their names in `applyStrictness` and then needs the value back twice — when pricing and when
writing — so the fix is to **flatten later**, not to add a lookup. `FlagCost` keeps a bare name,
because a report wants a name and its tests should not move for this.

| site | change |
| --- | --- |
| `probe/effectiveTsconfig.ts` | `value` on each flag; "missing" becomes "not at its wanted value" |
| `probe/tsconfigCost.ts` | takes flags, prices with `{ [name]: value }` |
| `generate/tsconfigEdit.ts` | takes flags, writes `"name": value` |
| `commands/strictness.ts` | keeps the flag objects as far as the write |

## Steps

1. `value` on `StrictnessFlag`; `true` on the existing six.
2. Add `noUncheckedSideEffectImports` (`true`) — no mechanism change needed for this one.
3. Carry the value through the four sites above.
4. Add `allowUnreachableCode` (`false`).
5. Both into this repository's `tsconfig.json`.
6. `STRICTNESS_SAMPLE` and `yarn docs`.
7. The gate: `format:check`, `lint`, `typecheck`, `build`, `test`, `knip`, and `test:e2e`.

## A limit this keeps on purpose

`addCompilerOptions` skips any flag the file already mentions, so a repository that has explicitly
written `allowUnreachableCode: true` is reported as missing it and never corrected. That is the
conservative reading and it is the existing behaviour for the `true`-valued flags too — overwriting
somebody's stated decision is not this command's job. Worth a comment, not a change.

## What this leaves out, and why

- **`allowUnusedLabels`.** Free here, but pricing is one full `tsc` run per candidate flag on the
  target repository, and a label is not something anybody writes. The candidate list is a cost
  every user pays, so completeness is not reason enough.
- **`noUnusedLocals` / `noUnusedParameters`.** Free here and still wrong: `no-unused-vars` already
  covers them *and* can be grandfathered by `--suppress-all`, which a type error can never be.
  Moving this into the type layer trades nothing for the loss of the only mechanism that lets a
  repository stage the work.
- **`isolatedDeclarations`.** Costed, and not really strictness — it constrains how declarations
  may be emitted. Its own issue if wanted.
- **`skipLibCheck: false`.** Zero here, deferred deliberately: it lets a dependency upgrade turn
  `typecheck` red through no fault of the repository, which is a different kind of decision.

## Verification

Each flag was priced by writing it into `tsconfig.json` — not passed on the command line, which
resolves differently — and counted with `--pretty false`, restoring the file between each. Re-run
after rebasing: these numbers are this repository's and they move with the compiler.
