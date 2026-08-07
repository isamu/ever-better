# CLAUDE.md — ever-better

Working notes for AI agents in this repo. What the tool is and how to use it lives in
**README.md**; the design reasoning lives in [`plans/mvp-p0-p2.md`](plans/mvp-p0-p2.md); where the
work stands and what to do next lives in [`docs/HANDOFF.md`](docs/HANDOFF.md). Read those first.

## Stack

TypeScript, ESM, Node 20.11+. **Zero runtime dependencies** — that is a feature, not an accident.
A tool that installs other people's dev dependencies has no business dragging in its own. Before
adding one, check whether `node:util`, `node:fs` or a subprocess already covers it.

Package manager here is **yarn**.

## Run after changes

```
yarn format      # prettier
yarn lint        # eslint (this repo runs every tier it generates)
yarn typecheck   # tsc --noEmit over src AND test
yarn build       # tsc -p tsconfig.build.json -> dist/
yarn test        # node:test over test/*.ts
```

Never judge these through a pipe — `yarn lint | tail` exits with `tail`'s status and reports a
failing lint as success. Check the exit code, or use `set -o pipefail`.

## Imports use `.ts` extensions

`import { x } from "./foo.ts"`, not `"./foo.js"`. Tests run the TypeScript sources directly under
Node's native type stripping, and `rewriteRelativeImportExtensions` turns them into `.js` on emit.
`erasableSyntaxOnly` is on, so enums, namespaces and parameter properties are compile errors — they
would build fine and then crash the test runner.

## The one architectural rule

**Deterministic work goes in the CLI. Judgment goes in a skill.**

| CLI (`src/`) | Skill (`skills/`) |
| --- | --- |
| detect, install, count, render, gate | is this warning a real bug |
| the same answer every run | how to split this function |
| no LLM in the loop | DRY or coincidence |

If you are about to write a heuristic in a SKILL.md that produces a number, it belongs in the CLI.
If you are about to encode taste in `src/`, it belongs in a skill.

## Pure decisions, one impure gatherer

`gatherFacts(cwd)` in `src/facts.ts` is the **only** place detection touches the filesystem. It
returns a `RepoFacts` value; `diagnose(facts)` and everything under `src/detect/` are pure
functions over it. That is why the diagnosis has real tests and no fixtures on disk.

Keep it that way. A new detector takes facts and returns a verdict — it does not read a file.

## Do not reimplement the ratchet

`eslint --suppress-all` / `--prune-suppressions` **is** the ratchet, maintained by the ESLint team.
We invoke it. We never parse or write `eslint-suppressions.json` — `src/suppressionsFile.ts` only
sums it, to report how much a prune reclaimed.

Two behaviours here were bugs, and both would come back if the reasoning is lost:

- **`runRuleCounts` must pass `--pass-on-unpruned-suppressions`.** Without it ESLint exits fatally
  the moment a suppressed violation is *fixed*, because the leftover suppression is now unused —
  turning every act of draining into a red build.
- **`freeze` refuses to run twice.** A second freeze pins whatever exists at that moment, quietly
  legalising everything added since. `prune` is the only path down; `--force` is the documented
  escape and belongs in a PR description.

## Counting violations goes through the formatter, not `--format json`

`formatters/rule-counts.js` is an ESLint formatter that emits per-rule totals. `--format json`
grows with the number of violations, and the first run on an untouched repository is exactly when
that is largest.

It is **plain JavaScript and never compiled** — it must load identically whether the CLI runs from
`dist/` or from source. `formatterPath()` resolves it relative to the package root.

## Reading files

`countLines` streams and counts newline bytes. It does not `readFile(…, "utf8")`, because a
repository can contain a generated source file of any size and that call throws outright past
V8's string limit — which would report the largest file in the repo as unreadable rather than as
large. Any new file read needs the same question asked: who writes this, and is it bounded?

## Testing

`node:test` + `node:assert/strict`, in `test/test_*.ts`. Test the pure functions; the impure edges
(`gatherFacts`, the command wrappers) are thin on purpose.

The lifecycle itself — bootstrap, freeze, reject a new violation, fix, prune — has been verified by
hand against real ESLint on a scratch repo. There is no automated end-to-end test yet; adding one
is the highest-value test work outstanding.

## Framework support is verified against real ESLint, not by reading docs

`src/detect/framework.ts` decides what a repo is; `src/generate/frameworkBlocks.ts` decides what
that means for the config. Every rule in there cost a failure on a fixture that runs the actual
linter, and reading a plugin's README would have produced the wrong answer in each case:

- **A plugin's flat config may not be where its docs say.** `eslint-plugin-react-hooks` exposes
  `configs["recommended-latest"]` in eslintrc shape (`plugins` is an ARRAY) and the flat one under
  `configs.flat[...]`. Using the wrong one makes ESLint refuse to load the file at all.
- **Peer ranges decide what can be installed.** `eslint-plugin-react` stops at eslint `^9.7`, so
  it is deliberately absent — npm's strict resolution would fail the install and leave the repo
  with no linter. Before adding any plugin, check `npm view <pkg> peerDependencies` against the
  ESLint we install.
- **`.vue` needs `extraFileExtensions`** or the type program rejects every SFC with a parse error
  nothing can suppress, and the `**/*.vue` block must come AFTER `pluginVue.configs["flat/recommended"]`
  or vue-eslint-parser is replaced.

When adding a framework, build a fixture under the scratchpad with real dependencies, run
`bootstrap` then `eslint .` against it, and only then write the test.

## Anything that ships to users needs the generator tested

A bug in `src/generate/` reaches every repository that runs `bootstrap`, and it will not show up
in this repo's own lint. Two already did: the generated config produced an unsuppressable parse
error on itself, and a `node:test` repo got a config that flagged every `describe`. Both are now
pinned by tests in `test/test_render.ts`. Add one for every rule the generator emits.
