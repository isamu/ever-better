# Generated files must be what Prettier would write

Closes #66.

## The defect

Every repository that ran `bootstrap` got an `eslint.config.js` that failed the
`prettier/prettier` rule that same file switches on:

```
eslint.config.js
  117:21  error  Replace `⏎········"error",⏎········{·min:·3,·…·},⏎······`
                 with `"error",·{·min:·3,·…·}`   prettier/prettier
```

`readabilityBlock` in `src/generate/eslintConfig.ts` hand-wrapped the `id-length`
options across four lines; the `.prettierrc.json` written beside it says
`printWidth: 160`, so Prettier wants them on one. The generator's hand-formatting
and the Prettier config the same tool writes disagreed.

Under `freeze` it is grandfathered on the first run, so every baseline starts with
a violation the tool itself wrote. Under `tier` it is worse, because that mode is
visible by design: the first `ever-better tier` lists `eslint.config.js` as a file
needing work, in a file whose header says not to edit it.

`knip.json` was dirty the same way — `JSON.stringify(_, 2)` puts every array
element on its own line and Prettier keeps a short array on one. That one does not
fail the generated CI, which runs lint rather than `format:check`, but
`format:check` is a script `bootstrap` itself adds.

## The fix

- `id-length` options on one line.
- `renderKnipConfig` collapses arrays that fit, the way Prettier does. An array
  that does not fit is emitted exactly as `JSON.stringify` wrote it, which is also
  what Prettier does with it.

## The test, which is the point

`test/test_generatedFormatting.ts` runs Prettier over **every** sample the docs
page renders, at the print width `bootstrap` writes, and asserts the output is
already formatted. Nothing did that before: `test_render.ts` asserts on content
and never on formatting, which is why a four-line block nobody had read as
Prettier reads it shipped to every user.

`.gitattributes` is exempt — Prettier has no parser for it — and the exemption is
asserted as a list, so a new unformattable sample cannot join it silently.

## Verification

`bootstrap` into a fresh fixture with real ESLint, then run the repository's own
`eslint .` and `prettier --check .`. Both clean. Before the fix, `eslint .`
reported the error above.
