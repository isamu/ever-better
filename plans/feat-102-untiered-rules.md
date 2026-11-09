# Four type-aware rules that belong to no tier (#102)

## The defect in the config, not in the code

`#98` brought this repository up to every tier its own generator emits. Some type-aware rules are
carried by no `typescript-eslint` preset at all, so a repository running every preset still runs
none of them. They have to be named one at a time, and nothing in the tier work reaches them.

Confirmed rather than assumed, with `eslint --print-config src/tier.ts`: all four are `ABSENT`,
and so are the two core rules the extension rules would otherwise double-report with.

## What changes

Four rules, in their own block in `eslint.config.js`:

- `@typescript-eslint/switch-exhaustiveness-check` — adding a member to a union becomes an error at
  every `switch` over it
- `@typescript-eslint/require-array-sort-compare` — `[10, 9].sort()` is lexicographic
- `@typescript-eslint/default-param-last` — a default before a required parameter can never be used
- `@typescript-eslint/no-loop-func` — a closure in a loop capturing the loop variable

## Why each measures zero, which is not the same reason

The distinction decides whether a rule is worth a line of config:

- `switch-exhaustiveness-check` is zero because `grep -rn "switch (" src/ test/` finds no `switch`
  statements at all. It is a forward guarantee, not a statement that the existing ones are
  exhaustive — there are none.
- `require-array-sort-compare` is zero because every `.sort(` in `src/` and `formatters/` already
  passes a comparator. This one is zero because the code is right.
- `default-param-last` and `no-loop-func` are zero against the loops and signatures that exist.

Two more rules from #102 are deliberately left out, because neither can ever fire here:
`no-unsafe-type-assertion` (`consistent-type-assertions: never` already rejects every non-const
assertion) and `no-unnecessary-parameter-property-assignment` (`erasableSyntaxOnly` makes parameter
properties a compile error).

## Deliberately not in this change

**The generator.** Adding these four to the tiers `ever-better` emits changes what every repository
it touches is held to, which is a user-facing decision and not a free one — some repository will
freeze a backlog for them. Running them here first is the order this repository argues for in the
comment at the top of its own config, so this change earns the right to make that decision rather
than making it.

Also out: `strict-boolean-expressions`, `explicit-function-return-type`, `promise-function-async`,
`consistent-type-imports`, `explicit-module-boundary-types` and `prefer-destructuring`. All are
costed in #102 and none is zero.

## Verification

- `yarn lint` — the whole repository, with the four rules on
- `yarn typecheck`, `yarn build`, `yarn test`
- each rule measured on its own before being added, by patching it into the config one at a time
  and counting through this repository's own `formatters/rule-counts.js`
