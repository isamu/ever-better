# ChangeLog

## 0.4.1 — 2026-08-11

Four bug fixes, every one found by **using** the tool rather than reading it — three while writing [the article about it](https://zenn.dev/singularity/articles/ever-better-pm2), one by running the whole loop on a fresh clone of [debug-js/debug](https://github.com/debug-js/debug).

### Fixed

- **The security tier is no longer dropped on browser bundles** (#43). `security.configs.recommended` was removed entirely for `runtime: "browser"`, on the ground that everything it looks for is Node-side. Two of its rules are not. `detect-object-injection` is the only rule in the generated config that sees a lookup answering out of the prototype chain — a key of `"constructor"` returns an inherited function, the `if (!found)` guard never fires, and no type objects, since `Record<string, T>` claims that key holds a `T`. Six of those were in a browser TypeScript UI and two in a 13-year-old JavaScript CLI. A super-linear regex likewise freezes the tab, not the server. The plugin now loads everywhere, with the seven genuinely Node-side rules turned off on browser bundles instead.
- **mocha is recognised as a test runner** (#43). `detectTestRunner` knew only vitest, jest and `node:test`, so a repository testing with mocha came back `"none"` — and `"none"` is what `bootstrap` installs vitest on. The cost was not a wrong label; it was a second test runner added to a repository that already had one. `mocha`, `ava`, `tap` and `jasmine` are now detected from dependencies. A bare test script is still not evidence.
- **`ever-better strictness` removed from the migrate skill** (#43). The skill told the agent to run a command that does not exist. Strictness pricing is something `bootstrap` already does.
- **`freeze` names where the unsuppressable errors are** (#43). Errors `--suppress-all` cannot record have no rule id by definition, so "Fix the config before committing" sent the reader to the config they had just generated rather than to the failing file. Freeze now lists the buckets and a bounded sample of file, line and message. The sample is capped at three in the formatter, keeping its output constant-size.

### Added

- **`ever-better next --fan-in`** (#42). `next` ranked the backlog by how much work a rule is, and said nothing about how far that work travels. A `no-explicit-any` in a module twenty files import changes an exported shape and lands errors in files the diff never opened; the same finding in a leaf is one edit. `--fan-in` counts importers per row. A flag rather than a default because it reads every source file, and it changes no ordering.
- **`docs/RESULTS.md` and a report-a-run issue template** (#43). The bug-yield claim rests on two repositories and both are the author's. The file says so and asks for rows — numbers only, no source. A run that found zero real bugs is the most useful row it could get.

### Skill guidance

`ever-better-drain` gained the operational half that only shows up on a repository measured in thousands (#43, #44):

- Two bug families worth hunting by hand: the prototype lookup, with the note that **the type system endorses it**, and super-linear regexes, where the rule was measured wrong in both directions.
- Leaving `no-explicit-any` off at the start is **sequencing, not surrender** — finding the ten violations that matter inside 1,413 is not a thing anyone does. What `off` must not become is the end state.
- The largest `any` group is annotations written over types the library **already publishes** — delete, do not write.
- Directory-level promotion `off → warn → error`, because a file list goes stale the moment someone adds a sibling.
- Slicing an identical group is for **review accuracy, not reviewer capacity**. The reviewer is an agent and will read all 167 hunks; what falls as the diff grows is recall.
- For a refactor too big to characterise with a handful of tests, **keep the old body and diff against it** (#44). The old implementation already knows every answer. The inputs must not be ones you invented, and the old body must be copied rather than delegated to.

📦 [`ever-better@0.4.1`](https://www.npmjs.com/package/ever-better/v/0.4.1)
