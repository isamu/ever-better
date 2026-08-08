/**
 * The tsconfig a JavaScript repository starts with.
 *
 * `allowJs` with `checkJs: false` is the whole trick: TypeScript compiles the repo as it is today,
 * so nothing breaks on the first commit, and each renamed file is then checked while the rest is
 * left alone. A big-bang rename produces thousands of type errors at once — and type errors have
 * NO suppression mechanism, so there would be nothing to grandfather them with.
 */
export const renderJsTsconfig = (): string =>
  `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "nodenext",
        moduleResolution: "nodenext",
        strict: true,
        // Compile the JavaScript that is already here, but do not type-check it yet. Each file
        // becomes checked when it is renamed, which is what makes this incremental.
        allowJs: true,
        checkJs: false,
        noEmit: true,
        skipLibCheck: true,
      },
      include: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
      exclude: ["node_modules", "dist", "build"],
    },
    null,
    2,
  )}\n`;
