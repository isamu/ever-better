import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { suppressInto } from "../eslintRunner.ts";
import { importsTier, renderTierConfig, SPREAD_BLOCK, TIER_CONFIG_FILE, withTierImport } from "../generate/tierConfig.ts";
import { appendConfigBlocks } from "../generate/eslintAppend.ts";
import { parseSuppressions } from "../suppressionsFile.ts";
import { drained, regressions, ruleNames, tierList, type TierEntry, type TierPair } from "../tier.ts";

export type TierOptions = {
  cwd: string;
};

export type TierResult = {
  ok: boolean;
  message: string;
};

const LEDGER = path.join(".ever-better", "tier.json");
const SCRATCH = path.join(".ever-better", "tier-scratch.json");

const CONFIG_NAMES = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isEntry = (value: unknown): value is TierEntry =>
  isRecord(value) && typeof value["file"] === "string" && Array.isArray(value["rules"]) && value["rules"].every((rule) => typeof rule === "string");

const readLedger = async (cwd: string): Promise<TierEntry[]> => {
  try {
    const parsed: unknown = JSON.parse(await readFile(path.join(cwd, LEDGER), "utf8"));
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
};

/**
 * ESLint computes the failing set; nothing here reimplements it. The scratch file is `--suppress-all`
 * output read for its file-by-rule counts and deleted — writing it over the repository's own
 * `eslint-suppressions.json` would freeze a baseline nobody asked for.
 */
const failingSet = async (cwd: string, forced: readonly string[]): Promise<TierEntry[]> => {
  const scratch = path.join(cwd, SCRATCH);
  await mkdir(path.dirname(scratch), { recursive: true });
  try {
    await suppressInto(cwd, SCRATCH, forced);
    const text = await readFile(scratch, "utf8").catch(() => "{}");
    return tierList(parseSuppressions(JSON.parse(text)));
  } finally {
    await rm(scratch, { force: true });
  }
};

const found = (pairs: readonly TierPair[]): string[] => pairs.slice(0, 10).map((pair) => `  ${pair.file}  ${pair.rule}`);

const refusal = (pairs: readonly TierPair[]): TierResult => ({
  ok: false,
  message: [
    `${pairs.length} pair(s) fail that the list does not excuse. The list may only shrink, so this refuses`,
    "to write them in — fix them, or say why they belong in the exception list and add them by hand.",
    "",
    ...found(pairs),
    ...(pairs.length > 10 ? [`  ... and ${pairs.length - 10} more`] : []),
  ].join("\n"),
});

/** Edited once and never again: rewriting a file somebody else owns on every run is what `bootstrap` refuses to do. */
const wireConfig = async (cwd: string): Promise<string | null> => {
  for (const candidate of CONFIG_NAMES) {
    const target = path.join(cwd, candidate);
    const source = await readFile(target, "utf8").catch(() => null);
    if (source === null) continue;
    if (importsTier(source)) return null;
    const spread = appendConfigBlocks(source, [SPREAD_BLOCK.join("\n")]);
    if (spread === null) return `Could not edit ${candidate} — add \`...everBetterTier\` last yourself.`;
    await writeFile(target, withTierImport(spread), "utf8");
    return `Wired ${candidate} to spread the generated list last, so it wins.`;
  }
  return "No ESLint config found. Run `ever-better bootstrap` first.";
};

export const runTier = async (options: TierOptions): Promise<TierResult> => {
  const before = await readLedger(options.cwd);
  const now = await failingSet(options.cwd, ruleNames(before));

  const regressed = regressions(before, now);
  if (before.length > 0 && regressed.length > 0) return refusal(regressed);

  const cleared = drained(before, now);
  await writeFile(path.join(options.cwd, LEDGER), `${JSON.stringify(now, null, 2)}\n`, "utf8");
  await writeFile(path.join(options.cwd, TIER_CONFIG_FILE), renderTierConfig(now), "utf8");
  const wired = await wireConfig(options.cwd);

  return {
    ok: true,
    message: [
      `${now.length} file(s) hold an exception, covering ${ruleNames(now).length} rule(s).`,
      ...(before.length === 0 ? ["Everything else is an error from this commit on."] : [`${cleared.length} pair(s) drained since the last run.`]),
      ...(wired === null ? [] : [wired]),
      "",
      `Commit ${TIER_CONFIG_FILE} and ${LEDGER} together — they are the same statement twice.`,
    ].join("\n"),
  };
};
