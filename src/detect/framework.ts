import type { Framework, PackageJson, Runtime, SourceFile } from "../types.ts";
import { allDependencies } from "./tooling.ts";

/**
 * Most specific first. `next` also depends on `react` and `nuxt` on `vue`, so testing in
 * dependency order would report every Next app as a plain React app and lose the plugin that
 * knows about its routing conventions.
 */
const SIGNATURES: readonly (readonly [Framework, readonly string[]])[] = [
  ["next", ["next"]],
  ["nuxt", ["nuxt"]],
  ["astro", ["astro"]],
  ["svelte", ["svelte", "@sveltejs/kit"]],
  ["vue", ["vue"]],
  ["react", ["react"]],
];

const BROWSER_FRAMEWORKS: readonly Framework[] = ["vue", "react", "svelte"];
const FULL_STACK_FRAMEWORKS: readonly Framework[] = ["next", "nuxt", "astro"];

export const detectFramework = (packageJson: PackageJson | null): Framework => {
  const deps = allDependencies(packageJson);
  const found = SIGNATURES.find(([, names]) => names.some((name) => name in deps));
  return found ? found[0] : "none";
};

/**
 * A frontend repo still has `vite.config.ts`, scripts and tests running under Node, so browser-only
 * globals produce a wall of false `no-undef`. Meta-frameworks genuinely execute in both.
 */
export const detectRuntime = (framework: Framework, packageJson: PackageJson | null): Runtime => {
  if (FULL_STACK_FRAMEWORKS.includes(framework)) return "both";
  if (BROWSER_FRAMEWORKS.includes(framework)) return "both";
  const deps = allDependencies(packageJson);
  return "vite" in deps || "webpack" in deps ? "both" : "node";
};

/** Build output that must be ignored, or the first lint run reports thousands of generated files. */
export const frameworkIgnores = (framework: Framework): string[] => {
  const shared = ["dist/**", "build/**", "coverage/**", "node_modules/**", ".vercel/**"];
  const perFramework: Partial<Record<Framework, string[]>> = {
    next: [".next/**", "out/**", "next-env.d.ts"],
    nuxt: [".nuxt/**", ".output/**"],
    svelte: [".svelte-kit/**"],
    astro: [".astro/**"],
  };
  return [...shared, ...(perFramework[framework] ?? [])];
};

/**
 * Vue's SFC compiler is what type-checks a `.vue` file; `tsc` cannot read one at all, so a Vue repo
 * whose typecheck script says `tsc --noEmit` is checking the `.ts` files and silently skipping
 * every component.
 */
export const typecheckCommand = (framework: Framework): string =>
  framework === "vue" || framework === "nuxt" ? "vue-tsc --noEmit" : "tsc --noEmit";

/** True when the generator has no rules for this framework's own file type. */
export const hasUncoveredFileType = (framework: Framework, sourceFiles: readonly SourceFile[]) => {
  const uncovered: Partial<Record<Framework, string>> = { svelte: "svelte", astro: "astro" };
  const extension = uncovered[framework];
  return extension !== undefined && sourceFiles.some((file) => file.ext === extension);
};
