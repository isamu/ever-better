import type { PackageJson, PackageManager } from "../types.ts";

const LOCKFILES: readonly (readonly [string, PackageManager])[] = [
  ["yarn.lock", "yarn"],
  ["pnpm-lock.yaml", "pnpm"],
  ["bun.lockb", "bun"],
  ["bun.lock", "bun"],
  ["package-lock.json", "npm"],
];

const PACKAGE_MANAGER_NAMES: readonly PackageManager[] = ["yarn", "pnpm", "bun", "npm"];

const fromPackageManagerField = (field: string | undefined): PackageManager | null => {
  if (!field) return null;
  const name = field.split("@")[0];
  return PACKAGE_MANAGER_NAMES.find((candidate) => candidate === name) ?? null;
};

/**
 * A repo can carry more than one lockfile after a migration, so the `packageManager` field wins
 * when present — it is the one a human declared rather than one a tool left behind.
 */
export const detectPackageManager = (
  rootEntries: readonly string[],
  packageJson: PackageJson | null,
): PackageManager => {
  const declared = fromPackageManagerField(packageJson?.packageManager);
  if (declared) return declared;
  const found = LOCKFILES.find(([lockfile]) => rootEntries.includes(lockfile));
  return found ? found[1] : "npm";
};

export const installCommand = (manager: PackageManager, packages: readonly string[]): string => {
  const list = packages.join(" ");
  if (manager === "yarn") return `yarn add --dev ${list}`;
  if (manager === "pnpm") return `pnpm add --save-dev ${list}`;
  if (manager === "bun") return `bun add --dev ${list}`;
  return `npm install --save-dev ${list}`;
};
