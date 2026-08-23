import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { suppressInto } from "../eslintRunner.ts";
import { importsTier, renderTierConfig, SPREAD_BLOCK, TIER_CONFIG_FILE, withTierImport } from "../generate/tierConfig.ts";
import { appendConfigBlocks } from "../generate/eslintAppend.ts";
import { parseSuppressions } from "../suppressionsFile.ts";
import { drained, parseLedger, refused, ruleNames, tierList, type Ledger, type TierEntry, type TierPair } from "../tier.ts";

export type TierOptions = {
  cwd: string;
};

export type TierResult = {
  ok: boolean;
  message: string;
};

const LEDGER = path.join(".ever-better", "tier.json");

const CONFIG_NAMES = ["eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"];

const readLedger = async (cwd: string): Promise<Ledger | null> => parseLedger(await readFile(path.join(cwd, LEDGER), "utf8").catch(() => null));

/**
 * ESLint computes the failing set; nothing here reimplements it. The scratch file is
 * `--suppress-all` output read for its file-by-rule counts and deleted — writing it over the
 * repository's own `eslint-suppressions.json` would freeze a baseline nobody asked for.
 *
 * The name carries the pid so two runs in one checkout cannot read or delete each other's file.
 * Sharing one meant a concurrent delete produced an EMPTY failing set, and an empty failing set
 * publishes an empty list.
 */
const failingSet = async (cwd: string): Promise<TierEntry[]> => {
  const relative = path.join(".ever-better", `tier-scratch-${process.pid}.json`);
  const scratch = path.join(cwd, relative);
  await mkdir(path.dirname(scratch), { recursive: true });
  try {
    await suppressInto(cwd, relative);
    const text = await readFile(scratch, "utf8").catch(() => null);
    // ESLint exited without leaving its output. Reading that as "nothing is failing" would publish
    // an empty list off a scan that never happened.
    if (text === null) throw new Error(`eslint left no suppressions at ${relative} — the failing set could not be read.`);
    return tierList(parseSuppressions(JSON.parse(text)));
  } finally {
    await rm(scratch, { force: true });
  }
};

/** Whole-file replacement, so an interrupt leaves the previous file rather than half of one. */
const writeAtomic = async (target: string, contents: string): Promise<void> => {
  const staging = `${target}.tmp-${process.pid}`;
  await writeFile(staging, contents, "utf8");
  await rename(staging, target);
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
    await writeAtomic(target, withTierImport(spread));
    return `Wired ${candidate} to spread the generated list last, so it wins.`;
  }
  return "No ESLint config found. Run `ever-better bootstrap` first.";
};

const INVALID_LEDGER = [
  `${LEDGER} exists but is not a list of {file, rules} entries.`,
  "",
  "This refuses rather than starting over: rebaselining off an unreadable ledger would write in",
  "everything that has failed since it was last valid. Restore it from git, or delete it on purpose",
  "to take a new tier.",
].join("\n");

export const runTier = async (options: TierOptions): Promise<TierResult> => {
  const ledger = await readLedger(options.cwd);
  if (ledger === null) return { ok: false, message: INVALID_LEDGER };

  const before = ledger.present ? ledger.entries : [];
  const now = await failingSet(options.cwd);

  const regressed = refused(ledger, now);
  if (regressed.length > 0) return refusal(regressed);

  const cleared = drained(before, now);
  // The ledger goes first. Interrupted between the two, the generated config is the older and more
  // permissive of the pair, while the ledger the next run compares against is the stricter one.
  await writeAtomic(path.join(options.cwd, LEDGER), `${JSON.stringify(now, null, 2)}\n`);
  await writeAtomic(path.join(options.cwd, TIER_CONFIG_FILE), renderTierConfig(now));
  const wired = await wireConfig(options.cwd);

  return {
    ok: true,
    message: [
      `${now.length} file(s) hold an exception, covering ${ruleNames(now).length} rule(s).`,
      ...(ledger.present ? [`${cleared.length} pair(s) drained since the last run.`] : ["Everything else is an error from this commit on."]),
      ...(wired === null ? [] : [wired]),
      "",
      `Commit ${TIER_CONFIG_FILE} and ${LEDGER} together — they are the same statement twice.`,
    ].join("\n"),
  };
};
