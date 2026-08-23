import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { suppressInto } from "../eslintRunner.ts";
import {
  GENERATED_MARKER,
  hasTierImport,
  importsTier,
  moduleSystemOf,
  renderTierConfig,
  SPREAD_BLOCK,
  TIER_CONFIG_NAMES,
  tierImportLine,
  tierConfigFileName,
  withTierImport,
} from "../generate/tierConfig.ts";
import { appendConfigBlocks } from "../generate/eslintAppend.ts";
import { parseSuppressions } from "../suppressionsFile.ts";
import { isProcessAlive } from "../util/pid.ts";
import { drained, parseLedger, refused, ruleNames, tierList, type Ledger, type TierEntry, type TierPair } from "../tier.ts";
import { ESLINT_CONFIG_NAMES } from "../eslintConfigNames.ts";

export type TierOptions = {
  cwd: string;
};

export type TierResult = {
  ok: boolean;
  message: string;
};

const LEDGER = path.join(".ever-better", "tier.json");

const LOCK = path.join(".ever-better", "tier.lock");

/**
 * Only ENOENT means "no tier taken yet". A ledger that is there and cannot be read — a directory, a
 * permission, a truncated write — is the strictest possible input, and treating it as absent hands
 * back a fresh baseline that forgives everything failing today.
 */
const readLedger = async (cwd: string): Promise<Ledger | null> => {
  try {
    return parseLedger(await readFile(path.join(cwd, LEDGER), "utf8"));
  } catch (cause) {
    return isErrno(cause) && cause.code === "ENOENT" ? parseLedger(null) : null;
  }
};

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

/** `"type"` from package.json, which is what decides whether a `.js` file is ESM — for Node, and so here. */
const packageType = async (cwd: string): Promise<string | null> => {
  const text = await readFile(path.join(cwd, "package.json"), "utf8").catch(() => null);
  if (text === null) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    const type = isRecord(parsed) ? parsed["type"] : null;
    return typeof type === "string" ? type : null;
  } catch {
    return null;
  }
};

type EslintConfig = { name: string; source: string };

const findConfig = async (cwd: string): Promise<EslintConfig | null> => {
  for (const name of ESLINT_CONFIG_NAMES) {
    const source = await readFile(path.join(cwd, name), "utf8").catch(() => null);
    if (source !== null) return { name, source };
  }
  return null;
};

/**
 * Edited once and never again — except to repoint it. A config still importing the name an earlier
 * version generated keeps applying that file's exceptions while the ledger describes the new one,
 * and the stale file is the more permissive of the two.
 */
type Wiring = { wired: true; note: string | null } | { wired: false };

const wireConfig = async (cwd: string, config: EslintConfig, tierConfigName: string): Promise<Wiring> => {
  if (importsTier(config.source, tierConfigName)) return { wired: true, note: null };
  const repoint = hasTierImport(config.source);
  const spread = repoint ? config.source : appendConfigBlocks(config.source, [SPREAD_BLOCK.join("\n")]);
  if (spread === null) return { wired: false };
  await writeAtomic(path.join(cwd, config.name), withTierImport(spread, tierConfigName));
  const removed = await removeSuperseded(cwd, tierConfigName);
  const wired = repoint ? `Repointed ${config.name} at ${tierConfigName}.` : `Wired ${config.name} to spread the generated list last, so it wins.`;
  return { wired: true, note: removed === null ? wired : `${wired} ${removed}` };
};

/**
 * A tier that is not spread into the config is not in force: the exceptions apply to nothing and
 * every listed pair is still an error. Writing the ledger anyway would record a tier nobody is
 * living under, and the run that did it would exit 0 — so this stops instead, with the two lines to
 * add. The generated file is written first, so the import they add resolves immediately.
 */
const unwired = (configName: string, tierConfigName: string, importLine: string): TierResult => ({
  ok: false,
  message: [
    `Could not edit ${configName}: nothing in it looks like the exported array of config objects.`,
    "",
    `${tierConfigName} has been written. Add these two lines to ${configName} yourself, the spread`,
    "LAST so it wins, and run `ever-better tier` again to record the list:",
    "",
    `  ${importLine}`,
    `  ...everBetterTier,`,
  ].join("\n"),
});

/**
 * The file the rename left behind. ESLint would still lint it — and every rule it downgrades would
 * still apply if anything still imported it. Only a file this tool wrote is removed; the header is
 * the proof, so a name collision with something a person owns is left alone.
 */
const removeSuperseded = async (cwd: string, keep: string): Promise<string | null> => {
  const stale = TIER_CONFIG_NAMES.filter((name) => name !== keep);
  const removed: string[] = [];
  for (const name of stale) {
    const target = path.join(cwd, name);
    const source = await readFile(target, "utf8").catch(() => null);
    if (source === null || !source.startsWith(GENERATED_MARKER)) continue;
    await rm(target, { force: true });
    removed.push(name);
  }
  return removed.length === 0 ? null : `Removed the superseded ${removed.join(", ")}.`;
};

const healMissing = async (cwd: string, config: EslintConfig, tierConfigName: string): Promise<void> => {
  if (!importsTier(config.source, tierConfigName)) return;
  const target = path.join(cwd, tierConfigName);
  const present = await readFile(target, "utf8").then(
    () => true,
    () => false,
  );
  if (!present) await writeAtomic(target, renderTierConfig([], tierConfigName));
};

const INVALID_LEDGER = [
  `${LEDGER} exists but could not be read as a list of {file, rules} entries.`,
  "",
  "This refuses rather than starting over: rebaselining off an unreadable ledger would write in",
  "everything that has failed since it was last valid. Restore it from git, or delete it on purpose",
  "to take a new tier.",
].join("\n");

const NO_CONFIG = "No ESLint config found. Run `ever-better bootstrap` first.";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const isErrno = (value: unknown): value is { code?: unknown } => isRecord(value);

const busy = (holder: string): TierResult => ({
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
 * `wx` is the arbiter — an atomic create that fails if the file is there. A lock left by a killed
 * process would wedge the repository, so a lock whose pid is gone is removed and the create retried;
 * losing that retry means someone else got there first, and this refuses rather than proceeding.
 *
 * A window remains: two runs can both find the same dead holder and both take over. What that costs
 * is bounded — the loser republishes a superset of the winner's list, every entry of which the
 * ledger already excused, so nothing is forgiven that was not already, and the next run drains what
 * the loser put back. It is the reason this is a lock and not the whole guarantee; `refused()` is.
 */
const acquire = async (cwd: string): Promise<string | null> => {
  const lock = path.join(cwd, LOCK);
  await mkdir(path.dirname(lock), { recursive: true });
  const held = await claim(lock);
  if (held === null) return null;
  if (isProcessAlive(Number(held))) return held;
  await rm(lock, { force: true });
  return claim(lock);
};

/** Returns the holder's pid when the lock is already taken, and null when this run now holds it. */
const claim = async (lock: string): Promise<string | null> => {
  try {
    await writeFile(lock, `${process.pid}\n`, { flag: "wx" });
    return null;
  } catch (cause) {
    if (!isErrno(cause) || cause.code !== "EEXIST") throw cause;
  }
  const holder = (await readFile(lock, "utf8").catch(() => "")).trim();
  return holder === "" ? "unknown" : holder;
};

const take = async (options: TierOptions): Promise<TierResult> => {
  const config = await findConfig(options.cwd);
  if (config === null) return { ok: false, message: NO_CONFIG };
  const tierConfigName = tierConfigFileName(moduleSystemOf(config.name, config.source, await packageType(options.cwd)));

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
  // The generated file and the wiring come before the ledger, because the ledger is the claim that a
  // tier is in force and the wiring is what makes that true. Interrupted between them, the ledger
  // still in place is the older one, which excuses everything the new config does and more — so the
  // next run compares against something more permissive than reality and refuses nothing wrongly.
  await writeAtomic(path.join(options.cwd, tierConfigName), renderTierConfig(now, tierConfigName));
  const wiring = await wireConfig(options.cwd, config, tierConfigName);
  if (!wiring.wired) return unwired(config.name, tierConfigName, tierImportLine(tierConfigName));
  await writeAtomic(path.join(options.cwd, LEDGER), `${JSON.stringify(now, null, 2)}\n`);

  return {
    ok: true,
    message: [
      `${now.length} file(s) hold an exception, covering ${ruleNames(now).length} rule(s).`,
      ...(ledger.present ? [`${cleared.length} pair(s) drained since the last run.`] : ["Everything else is an error from this commit on."]),
      ...(wiring.note === null ? [] : [wiring.note]),
      "",
      `Commit ${tierConfigName} and ${LEDGER} together — they are the same statement twice.`,
    ].join("\n"),
  };
};

export const runTier = async (options: TierOptions): Promise<TierResult> => {
  const holder = await acquire(options.cwd);
  if (holder !== null) return busy(holder);
  try {
    return await take(options);
  } finally {
    await rm(path.join(options.cwd, LOCK), { force: true });
  }
};
