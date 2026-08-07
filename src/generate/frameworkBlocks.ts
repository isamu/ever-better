import type { Framework } from "../types.ts";

export type FrameworkParts = {
  imports: string[];
  /** Lines spliced into the `tseslint.config(...)` call, in order. */
  configs: string[];
  packages: string[];
};

const EMPTY: FrameworkParts = { imports: [], configs: [], packages: [] };

/**
 * ESLint's type program does not generate component types for SFCs, so anything imported from a
 * `.vue` resolves to the error type and every read through it is reported as unsafe. `vue-tsc`
 * resolves them fully, so the code IS type-checked — just not by this pass. Leaving the family on
 * would fill the baseline with findings that can never be fixed, only re-suppressed.
 */
const vueErrorTypeBlock = (typed: boolean): string[] => {
  if (!typed) return [];
  return [
    "  {",
    "    // The `any` family is off wherever a .vue component type is in play. This is a limit of",
    "    // the linter, not a hole in the code — vue-tsc still checks it.",
    "    //",
    "    // A .ts file that imports a type or component FROM a .vue inherits the same blind spot.",
    "    // Add it to this list with the import named, so the entry can be deleted if the type",
    "    // program ever learns SFCs.",
    '    files: ["**/*.vue"],',
    "    rules: {",
    '      "@typescript-eslint/no-unsafe-argument": "off",',
    '      "@typescript-eslint/no-unsafe-assignment": "off",',
    '      "@typescript-eslint/no-unsafe-call": "off",',
    '      "@typescript-eslint/no-unsafe-member-access": "off",',
    '      "@typescript-eslint/no-unsafe-return": "off",',
    "    },",
    "  },",
  ];
};

/**
 * `flat/recommended` is an ARRAY, so it is spread. The `**\/*.vue` block must come after it:
 * eslint-plugin-vue installs vue-eslint-parser for SFCs, and this sets the parser it delegates the
 * `<script>` block to. Reversing them makes every component fail to parse.
 */
const vueParts = (typed: boolean): FrameworkParts => ({
  imports: ['import pluginVue from "eslint-plugin-vue";'],
  configs: [
    '  ...pluginVue.configs["flat/recommended"],',
    "  {",
    '    files: ["**/*.vue"],',
    "    languageOptions: {",
    "      parserOptions: {",
    "        parser: tseslint.parser,",
    ...(typed
      ? [
          "        // Without this the type program refuses .vue outright, and every component",
          "        // reports an unsuppressable parse error.",
          '        extraFileExtensions: [".vue"],',
        ]
      : []),
    "      },",
    "    },",
    "    rules: {",
    "      // A component called Button.vue is one word on purpose.",
    '      "vue/multi-word-component-names": "off",',
    "    },",
    "  },",
    ...vueErrorTypeBlock(typed),
  ],
  packages: ["eslint-plugin-vue", "vue-eslint-parser"],
});

/**
 * `eslint-plugin-react` is deliberately NOT here. Its peer range stops at `^9.7`, so installing it
 * alongside the ESLint 10 this tool sets up fails outright under npm's strict peer resolution —
 * bootstrap would leave the repo with no linter at all. `eslint-plugin-react-hooks` supports 10
 * and carries the rules that catch real bugs (rules of hooks, exhaustive deps); the rest of
 * `eslint-plugin-react` is mostly JSX style, which prettier already settles.
 *
 * Add it back — with `react.configs.flat["jsx-runtime"]`, or `react-in-jsx-scope` fires on every
 * file — once it declares support for ESLint 10.
 */
const reactParts = (): FrameworkParts => ({
  imports: ['import reactHooks from "eslint-plugin-react-hooks";'],
  // `configs.flat[...]`, not `configs[...]`: the top-level entries are still eslintrc shape, whose
  // `plugins: ["react-hooks"]` array makes flat config refuse to load at all.
  configs: ['  reactHooks.configs.flat["recommended-latest"],'],
  packages: ["eslint-plugin-react-hooks"],
});

const nextParts = (): FrameworkParts => {
  const react = reactParts();
  return {
    imports: [...react.imports, 'import next from "@next/eslint-plugin-next";'],
    configs: [...react.configs, '  next.configs["core-web-vitals"],'],
    packages: [...react.packages, "@next/eslint-plugin-next"],
  };
};

/**
 * Svelte and Astro are detected so the diagnosis is honest, but nothing here configures their file
 * types yet. Emitting a comment rather than nothing means the reader finds out from the config
 * instead of from a lint run that silently skipped half the repo.
 */
const uncoveredParts = (framework: Framework): FrameworkParts => ({
  imports: [],
  configs: [
    `  // ${framework} detected. ever-better does not configure .${framework} files yet — add the`,
    `  // eslint-plugin-${framework} flat config here, or those files go unlinted.`,
  ],
  packages: [],
});

export const frameworkParts = (framework: Framework, typed: boolean): FrameworkParts => {
  if (framework === "vue" || framework === "nuxt") return vueParts(typed);
  if (framework === "react") return reactParts();
  if (framework === "next") return nextParts();
  if (framework === "svelte" || framework === "astro") return uncoveredParts(framework);
  return EMPTY;
};
