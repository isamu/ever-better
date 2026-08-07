import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import sonarjs from "eslint-plugin-sonarjs";
import prettier from "eslint-config-prettier";

// This repository runs every tier its own generator emits. When a tier is uncomfortable here it is
// uncomfortable in every repo ever-better touches, which is the point.
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "templates/**", "test/fixtures/**"] },

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  sonarjs.configs.recommended,
  prettier,

  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^__" }],
      "no-console": "off",
    },
  },

  {
    rules: {
      "max-lines": ["error", { max: 300, skipBlankLines: true, skipComments: true }],
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      complexity: ["error", 15],
      "max-depth": ["error", 4],
      "max-nested-callbacks": ["error", 4],
      "sonarjs/cognitive-complexity": ["error", 15],
    },
  },

  {
    // A spec's arrange block repeats by nature, and its length is not a comprehension problem.
    files: ["test/**/*.ts"],
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "sonarjs/no-duplicate-string": "off",
      // node:test's `describe`/`it` return promises the runner owns. Awaiting them is wrong, and
      // `void`-prefixing every block would be noise on every line of every spec.
      "@typescript-eslint/no-floating-promises": "off",
    },
  },

  {
    // Neither is part of the TypeScript program: the formatter ships as plain JS so it loads the
    // same from source and from dist, and the config file cannot reference itself.
    files: ["eslint.config.js", "formatters/**/*.js"],
    languageOptions: { parserOptions: { projectService: false } },
    ...tseslint.configs.disableTypeChecked,
  },
);
