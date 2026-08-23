/**
 * Every name ESLint searches for, in the order it searches — read out of
 * `eslint/lib/config/config-loader.js`, not out of the documentation. Three commands looked for the
 * first four and missed `.mts` / `.cts`, which meant a repository configured that way looked to this
 * tool like a repository with no ESLint at all.
 */
export const ESLINT_CONFIG_NAMES = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts", "eslint.config.mts", "eslint.config.cts"];
