import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { runRuleCounts, suppressInto } from "../eslintRunner.ts";
import {
  GENERATED_MARKER,
  hasTierImport,
  importsTier,
  moduleSystemOf,
  renderTierConfig,
  importedTierName,
  SPREAD_BLOCK,
  spreadsTier,
  TIER_CONFIG_NAMES,
  tierImportLine,
  tierConfigFileName,
  withTierImport,
} from "../generate/tierConfig.ts";
import { appendConfigBlocks } from "../generate/eslintAppend.ts";
import { parseSuppressions } from "../suppressionsFile.ts";
import { isProcessAlive } from "../util/pid.ts";
import { drained, parseLedger, refused, ruleNames, tierList, violations, type Ledger, type TierEntry, type TierPair } from "../tier.ts";
import { ESLINT_CONFIG_NAMES } from "../eslintConfigNames.ts";

export type TierOptions = {
  cwd: string;
  /** Compare and report, write nothing. What CI runs: a gate may not edit the repository it gates. */
  check?: boolean;
};

export type TierResult = {
  ok: boolean;
  message: string;
};

const STATE_DIR = ".ever-better";

const SCRATCH_DIR = path.join(STATE_DIR, "scratch");

const LEDGER = path.join(STATE_DIR, "tier.json");

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
  // A fresh directory per run, because `--suppress-all` MERGES into whatever is already at that
  // location — measured, not assumed: a clean run over one failing file left an unrelated
  // `stale/file.js: 99` entry sitting beside the real one. Anything an interrupted run left behind
  // would be excused from then on, and the ledger could not tell it from something that fails. A
  // name nothing else can produce is structural; remembering to delete first is a step to forget.
  await mkdir(path.join(cwd, SCRATCH_DIR), { recursive: true });
  const dir = await mkdtemp(path.join(cwd, SCRATCH_DIR, "scan-"));
  const scratch = path.join(dir, "suppressions.json");
  try {
    await suppressInto(cwd, path.relative(cwd, scratch));
    const text = await readFile(scratch, "utf8").catch(() => null);
    // ESLint exited without leaving its output. Reading that as "nothing is failing" would publish
    // an empty list off a scan that never happened.
    if (text === null) throw new Error(`eslint left no suppressions in ${path.relative(cwd, dir)} — the failing set could not be read.`);
    return tierList(parseSuppressions(JSON.parse(text)));
  } finally {
    await rm(dir, { recursive: true, force: true });
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

const found = (pairs: readonly TierPair[]): string[] =>
  pairs.slice(0, 10).map((pair) => `  ${pair.file}  ${pair.rule}  ${pair.count} (excused: ${pair.allowed})`);

const refusal = (pairs: readonly TierPair[]): TierResult => ({
  ok: false,
  message: [
    `${pairs.length} pair(s) fail more than the list excuses. The list may only shrink, so this refuses`,
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
  const spreads = spreadsTier(config.source);
  if (spreads && importsTier(config.source, tierConfigName)) return { wired: true, note: null };
  const repoint = hasTierImport(config.source);
  // Both halves have to be there. An import with no spread downgrades nothing, so treating it as
  // wired records a tier the repository is not living under.
  const spread = spreads ? config.source : appendConfigBlocks(config.source, [SPREAD_BLOCK.join("\n")]);
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

const healMissing = async (cwd: string, config: EslintConfig): Promise<void> => {
  // Whichever file the config imports, not the one this run would write: an earlier version's name
  // is what ESLint will try to load, and a missing one stops the scan that would replace it.
  const imported = importedTierName(config.source);
  if (imported === null) return;
  const target = path.join(cwd, imported);
  const present = await readFile(target, "utf8").then(
    () => true,
    () => false,
  );
  if (!present) await writeAtomic(target, renderTierConfig([], imported));
};

/**
 * The rules the list excuses that ESLint still reports as ERRORS — that is, the part of the tier
 * that is not actually in force. Asked of ESLint rather than inferred from the text of a config
 * file: every wiring check before this one is a guess about what a source file means, and a spread
 * inside a comment, a spread that is not last, or a later block re-raising one rule all read as
 * correct wiring while leaving the ledger describing a repository nobody is living in.
 *
 * One `eslint .` answers it for every listed pair at once. `--print-config` answers it for one file,
 * which is a sample, and a sample passed while a second listed pair sat there as an error.
 *
 * After a successful `tier` — or a `--check` that found no regression — every failing pair is one
 * the list excuses, so any error under a listed rule means that rule is not being downgraded.
 */
const notInForce = async (cwd: string, entries: readonly TierEntry[]): Promise<string[]> => {
  const listed = new Set(ruleNames(entries));
  if (listed.size === 0) return [];
  const counts = await runRuleCounts(cwd);
  return Object.entries(counts.errors)
    .filter(([rule, count]) => count > 0 && listed.has(rule))
    .map(([rule]) => rule)
    .sort((one, other) => one.localeCompare(other));
};

const inertMessage = (rules: readonly string[], lines: readonly string[]): string =>
  [
    `${rules.length} rule(s) the list excuses are still errors: ${rules.join(", ")}.`,
    "",
    ...lines,
    "",
    "Asked by running ESLint, not by reading the config — that is the only answer that counts.",
    "Run `eslint .` to see which files.",
  ].join("\n");

const notWired = (configName: string, rules: readonly string[]): TierResult => ({
  ok: false,
  message: inertMessage(rules, [
    `${configName} was edited, but the generated list is not being applied to all of it. The usual`,
    "cause is that `...everBetterTier` is not the LAST entry in the exported array, so a later block",
    "overrides it. Move it to the end and run `ever-better tier` again.",
  ]),
});

const notApplied = (rules: readonly string[]): TierResult => ({
  ok: false,
  message: inertMessage(rules, [
    `${LEDGER} describes a tier the repository is not living under. Run \`ever-better tier\` to rewire`,
    "it, and check that `...everBetterTier` is LAST in the exported array.",
  ]),
});

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

const UNREADABLE_HOLDER = "unreadable";

const busy = (holder: string): TierResult => ({
  ok: false,
  message:
    holder === UNREADABLE_HOLDER
      ? [
          `${LOCK} exists and cannot be read, so whether another \`ever-better tier\` is running here`,
          "cannot be answered. Taking the lock on that reading is how a live run gets one taken from it.",
          "",
          "Fix its permissions, or delete it if you know no such process exists.",
        ].join("\n")
      : [
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
  if (held.mine) return null;
  if (!held.readable) return held.holder;
  if (isProcessAlive(Number(held.holder))) return held.holder;
  await rm(lock, { force: true });
  const retry = await claim(lock);
  return retry.mine ? null : retry.holder;
};

/** Returns the holder's pid when the lock is already taken, and null when this run now holds it. */
type Claim = { mine: true } | { mine: false; holder: string; readable: boolean };

const claim = async (lock: string): Promise<Claim> => {
  try {
    await writeFile(lock, `${process.pid}\n`, { flag: "wx" });
    return { mine: true };
  } catch (cause) {
    if (!isErrno(cause) || cause.code !== "EEXIST") throw cause;
  }
  // A lock that cannot be READ is not a lock with no holder. Taking it over on that reading removed
  // one held by a live process, which is the whole thing this exists to prevent.
  const text = await readFile(lock, "utf8").catch(() => null);
  if (text === null) return { mine: false, holder: UNREADABLE_HOLDER, readable: false };
  return { mine: false, holder: text.trim() || "unknown", readable: true };
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
  await healMissing(options.cwd, config);

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
  const inert = await notInForce(options.cwd, now);
  if (inert.length > 0) return notWired(config.name, inert);
  await writeAtomic(path.join(options.cwd, LEDGER), `${JSON.stringify(now, null, 2)}\n`);

  return {
    ok: true,
    message: [
      `${violations(now)} violation(s) excused across ${now.length} file(s) and ${ruleNames(now).length} rule(s).`,
      ...(ledger.present ? [`${cleared.length} pair(s) drained since the last run.`] : ["Everything else is an error from this commit on."]),
      ...(wiring.note === null ? [] : [wiring.note]),
      "",
      `Commit ${tierConfigName} and ${LEDGER} together — they are the same statement twice.`,
    ].join("\n"),
  };
};

const NO_LEDGER = [
  `${LEDGER} is not there, so there is nothing to check against.`,
  "",
  "Run `ever-better tier` once to take a tier and commit what it writes.",
].join("\n");

/**
 * The gate. It writes nothing — a check that edits the repository it is checking cannot run on a
 * pull request — so it is also the only path that needs no lock.
 *
 * This is what makes the list's promise enforceable. `eslint .` catches a violation in a file the
 * list does not cover, because that is still an error; it cannot catch a SECOND violation of a rule
 * a file is already excused for, because the whole pair is a warning. The count in the ledger is the
 * only record of how many there were.
 */
const checkTier = async (options: TierOptions): Promise<TierResult> => {
  const ledger = await readLedger(options.cwd);
  if (ledger === null) return { ok: false, message: INVALID_LEDGER };
  if (!ledger.present) return { ok: false, message: NO_LEDGER };

  const now = await failingSet(options.cwd);
  const regressed = refused(ledger, now);
  if (regressed.length > 0) return refusal(regressed);

  // Only once the failing set is within the list: before that, an error under a listed rule is just
  // the regression above, and reporting it as a wiring problem would name the wrong cause.
  const inert = await notInForce(options.cwd, ledger.entries);
  if (inert.length > 0) return notApplied(inert);

  const cleared = drained(ledger.entries, now);
  const behind = violations(ledger.entries) - violations(now);
  return {
    ok: true,
    message: [
      `Clean. ${violations(now)} violation(s) excused across ${now.length} file(s).`,
      ...(cleared.length === 0
        ? []
        : [`${cleared.length} pair(s) and ${behind} violation(s) have been fixed since the ledger was written — run \`ever-better tier\` to record it.`]),
    ].join("\n"),
  };
};

export const runTier = async (options: TierOptions): Promise<TierResult> => {
  if (options.check === true) return checkTier(options);
  const holder = await acquire(options.cwd);
  if (holder !== null) return busy(holder);
  try {
    return await take(options);
  } finally {
    await rm(path.join(options.cwd, LOCK), { force: true });
  }
};
