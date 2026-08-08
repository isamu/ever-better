/**
 * The action versions written into every workflow this tool generates.
 *
 * A hardcoded version rots, and a stale one is invisible: the generated workflow keeps working on
 * an action two majors behind and nobody looks. Two things keep these honest —
 *
 * 1. `test/test_actionVersions.ts` asserts they match what THIS repository's own workflows use, so
 *    when Dependabot bumps ours the test fails until the generator follows.
 * 2. `bootstrap` writes a `dependabot.yml` into the target repo, so the generated workflows keep
 *    themselves current afterwards rather than depending on this constant staying fresh.
 */
export const ACTION_VERSIONS = {
  checkout: "actions/checkout@v7",
  setupNode: "actions/setup-node@v7",
  uploadSarif: "github/codeql-action/upload-sarif@v4",
  pnpmSetup: "pnpm/action-setup@v4",
  bunSetup: "oven-sh/setup-bun@v2",
} as const;

/** Node major written into generated workflows and used as the `--node` default. */
export const DEFAULT_NODE_VERSION = "24";
