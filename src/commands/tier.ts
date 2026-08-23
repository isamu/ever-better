import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { suppressInto } from "../eslintRunner.ts";
import { importsTier, renderTierConfig, SPREAD_BLOCK, tierConfigFileName, withTierImport } from "../generate/tierConfig.ts";
import { appendConfigBlocks } from "../generate/eslintAppend.ts";
import { parseSuppressions } from "../suppressionsFile.ts";
import { isProcessAlive } from "../util/pid.ts";
import { drained, parseLedger, refused, ruleNames, tierList, type Ledger, type TierEntry, type TierPair } from "../tier.ts";

export type TierOptions = {
  cwd: string;
};

export type TierResult = {
  ok: boolean;
  message: string;
};

const LEDGER = path.join(".ever-better", "tier.json");

const LOCK = path.join(".ever-better", "tier.lock");

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
  try {
    await writeFile(staging, contents, "utf8");
    await rename(staging, target);
  } finally {
    await rm(staging, { force: true });
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

type EslintConfig = { name: string; source: string };

const findConfig = async (cwd: string): Promise<EslintConfig | null> => {
  for (const name of CONFIG_NAMES) {
    const source = await readFile(path.join(cwd, name), "utf8").catch(() => null);
    if (source !== null) return { name, source };
  }
  return null;
};

/** Edited once and never again: rewriting a file somebody else owns on every run is what `bootstrap` refuses to do. */
const wireConfig = async (cwd: string, config: EslintConfig, tierConfigName: string): Promise<string | null> => {
  if (importsTier(config.source)) return null;
  const spread = appendConfigBlocks(config.source, [SPREAD_BLOCK.join("\n")]);
  if (spread === null) return `Could not edit ${config.name} — add \`...everBetterTier\` last yourself.`;
  await writeAtomic(path.join(cwd, config.name), withTierImport(spread, tierConfigName));
  return `Wired ${config.name} to spread the generated list last, so it wins.`;
};

const healMissing = async (cwd: string, config: EslintConfig, tierConfigName: string): Promise<void> => {
  if (!importsTier(config.source)) return;
  const target = path.join(cwd, tierConfigName);
  const present = await readFile(target, "utf8").then(
    () => true,
    () => false,
  );
  if (!present) await writeAtomic(target, renderTierConfig([], tierConfigName));
};

const INVALID_LEDGER = [
  `${LEDGER} exists but is not a list of {file, rules} entries.`,
  "",
  "This refuses rather than starting over: rebaselining off an unreadable ledger would write in",
  "everything that has failed since it was last valid. Restore it from git, or delete it on purpose",
  "to take a new tier.",
].join("\n");

const NO_CONFIG = "No ESLint config found. Run `ever-better bootstrap` first.";

const isErrno = (value: unknown): value is { code?: unknown } => typeof value === "object" && value !== null;

const held = (holder: string): TierResult => ({
  ok: false,
  message: [
    `Another \`ever-better tier\` (pid ${holder}) is running in this repository.`,
    "",
    "Two runs would each publish a list computed before the other's fixes landed, and the later write",
    `wins — re-opening an exception the earlier one had drained. If no such process exists, delete`,
    `${LOCK}.`,
  ].join("\n"),
});

/**
 * One run at a time. Not for the file writes, which are atomic on their own, but for the whole
 * read-scan-write: two overlapping runs each publish a snapshot taken before the other's fixes, and
 * the loser's exceptions come back from the dead.
 *
 * A lock left by a killed process would wedge the repository, so a lock whose pid is gone is taken
 * over. `process.kill(pid, 0)` tests for existence without signalling, on Windows too.
 */
const acquire = async (cwd: string): Promise<string | null> => {
  const lock = path.join(cwd, LOCK);
  await mkdir(path.dirname(lock), { recursive: true });
  const mine = String(process.pid);
  try {
    await writeFile(lock, `${mine}\n`, { flag: "wx" });
    return null;
  } catch (cause) {
    if (!isErrno(cause) || cause.code !== "EEXIST") throw cause;
  }
  const holder = (await readFile(lock, "utf8").catch(() => "")).trim();
  if (holder !== "" && isProcessAlive(Number(holder))) return holder;
  // The holder is gone. Replacing the file is safe: whoever wrote it is not coming back.
  await writeFile(lock, `${mine}\n`, "utf8");
  return null;
};

const take = async (options: TierOptions): Promise<TierResult> => {
  const config = await findConfig(options.cwd);
  if (config === null) return { ok: false, message: NO_CONFIG };
  const tierConfigName = tierConfigFileName(config.name);

  const ledger = await readLedger(options.cwd);
  if (ledger === null) return { ok: false, message: INVALID_LEDGER };

  // The config may already import a generated file that is not there — gitignored, or deleted on the
  // assumption that anything generated is disposable. ESLint then cannot load the config at all, and
  // the scan that would rewrite the file is the thing that fails. An empty list is what the scan sees
  // anyway, so writing one first heals it.
  await healMissing(options.cwd, config, tierConfigName);

  const now = await failingSet(options.cwd);
  const regressed = refused(ledger, now);
  if (regressed.length > 0) return refusal(regressed);

  const cleared = drained(ledger.present ? ledger.entries : [], now);
  // The ledger goes first. Interrupted between the two, the generated config is the older and more
  // permissive of the pair, while the ledger the next run compares against is the stricter one.
  await writeAtomic(path.join(options.cwd, LEDGER), `${JSON.stringify(now, null, 2)}\n`);
  await writeAtomic(path.join(options.cwd, tierConfigName), renderTierConfig(now, tierConfigName));
  const wired = await wireConfig(options.cwd, config, tierConfigName);

  return {
    ok: true,
    message: [
      `${now.length} file(s) hold an exception, covering ${ruleNames(now).length} rule(s).`,
      ...(ledger.present ? [`${cleared.length} pair(s) drained since the last run.`] : ["Everything else is an error from this commit on."]),
      ...(wired === null ? [] : [wired]),
      "",
      `Commit ${tierConfigName} and ${LEDGER} together — they are the same statement twice.`,
    ].join("\n"),
  };
};

export const runTier = async (options: TierOptions): Promise<TierResult> => {
  const holder = await acquire(options.cwd);
  if (holder !== null) return held(holder);
  try {
    return await take(options);
  } finally {
    await rm(path.join(options.cwd, LOCK), { force: true });
  }
};
