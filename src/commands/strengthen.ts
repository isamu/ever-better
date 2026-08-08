import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { canLint, printConfig } from "../eslintRunner.ts";
import { appendConfigBlocks, renderRuleBlock } from "../generate/eslintAppend.ts";
import { findWeakRules, type RuleVerdict } from "../probe/effectiveRules.ts";
import { sampleSourceFile } from "../probe/gather.ts";
import type { SourceFile } from "../types.ts";

const BACKUP_SUFFIX = ".ever-better-backup";

const CONFIG_NAMES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
];

const findConfig = (rootEntries: readonly string[]): string | null =>
  CONFIG_NAMES.find((name) => rootEntries.includes(name)) ?? null;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pluginNames = (plugins: unknown): string[] => {
  if (Array.isArray(plugins)) return plugins.filter((name) => typeof name === "string");
  return Object.keys(isRecord(plugins) ? plugins : {});
};

/**
 * A rule from a plugin the config never registered cannot be set: ESLint refuses the whole file
 * with "Could not find plugin". The printed config lists what is actually loaded, so this is the
 * difference between strengthening a config and breaking it.
 *
 * It lists them as `name:package@version`, not as bare names — matching the whole string finds
 * nothing, and every plugin rule is then silently skipped. That reads as "the config was already
 * fine" rather than as a bug.
 */
const loadedPlugins = (printed: Record<string, unknown> | null): string[] =>
  pluginNames(printed?.["plugins"]).map((name) => name.split(":")[0] ?? name);

/**
 * Type-aware rules need `project` or `projectService`. Setting one without it makes ESLint fatal
 * on every file — a strengthened config that cannot lint anything is worse than a weak one.
 */
const hasTypeInformation = (printed: Record<string, unknown> | null): boolean => {
  const options = printed?.["parserOptions"];
  if (!isRecord(options)) return false;
  return Boolean(options["project"]) || Boolean(options["projectService"]);
};

const isSettable = (rule: string, printed: Record<string, unknown> | null): boolean => {
  const slash = rule.indexOf("/");
  if (slash < 0) return true;
  return loadedPlugins(printed).includes(rule.slice(0, slash));
};

export type StrengthenResult = {
  enabled: string[];
  skipped: string[];
  message: string;
};

const nothing = (message: string): StrengthenResult => ({ enabled: [], skipped: [], message });

const settableRules = (weak: readonly RuleVerdict[], printed: Record<string, unknown> | null) => {
  const typed = hasTypeInformation(printed);
  return weak.filter(
    (verdict) =>
      isSettable(verdict.rule.name, printed) && (typed || verdict.rule.typeAware !== true),
  );
};

/**
 * Adds the missing high-value rules to a config the repository already wrote.
 *
 * Backed up first, then verified by loading the result — a config this tool cannot parse is a
 * config it must not silently mangle, and "ESLint still runs" is the only check that actually
 * proves the edit was valid. On any doubt the backup goes back.
 */
export const strengthenEslintConfig = async (
  cwd: string,
  rootEntries: readonly string[],
  sourceFiles: readonly SourceFile[],
): Promise<StrengthenResult> => {
  const configName = findConfig(rootEntries);
  if (!configName) return nothing("No flat ESLint config to strengthen.");

  const sample = sampleSourceFile(sourceFiles);
  if (!sample) return nothing("No source file to measure the config against.");

  const before = await printConfig(cwd, sample.path);
  const weak = settableRules(findWeakRules(before), before);
  if (weak.length === 0) return nothing("Every high-value rule is already enforcing.");

  const configPath = path.join(cwd, configName);
  const backupPath = `${configPath}${BACKUP_SUFFIX}`;
  const original = await readFile(configPath, "utf8");
  const block = renderRuleBlock(
    weak.map((verdict) => ({ name: verdict.rule.name, setting: verdict.rule.setting })),
    [
      "Added by ever-better. Flat config is an array and later entries win, so this",
      "block overrides whatever came before it. Everything above is untouched.",
    ],
  );
  const updated = appendConfigBlocks(original, block);
  if (!updated) {
    return nothing(`Could not find where ${configName} ends — left it alone. Add these by hand.`);
  }

  await copyFile(configPath, backupPath);
  await writeFile(configPath, updated, "utf8");

  // Verified by LINTING, not by printing the config: printing resolves rules without loading them,
  // so a rule needing a type program prints happily and then makes every real run fatal.
  if (!(await canLint(cwd, sample.path))) {
    await copyFile(backupPath, configPath);
    await rm(backupPath, { force: true });
    return nothing(`Editing ${configName} stopped ESLint running — restored, nothing changed.`);
  }

  const names = weak.map((verdict) => verdict.rule.name);
  return {
    enabled: names,
    skipped: findWeakRules(before)
      .filter((verdict) => !names.includes(verdict.rule.name))
      .map((verdict) => verdict.rule.name),
    message: [
      `Strengthened ${configName}: ${names.length} rules now enforcing.`,
      `  ${names.join(", ")}`,
      `Backup at ${configName}${BACKUP_SUFFIX} — delete it once the diff looks right.`,
    ].join("\n"),
  };
};
