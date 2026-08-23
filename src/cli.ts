#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DEFAULT_NODE_VERSION } from "./generate/actionVersions.ts";
import process from "node:process";
import { runBootstrap } from "./commands/bootstrap.ts";
import { runCatalog } from "./commands/catalog.ts";
import { runCheck } from "./commands/check.ts";
import { runDiagnose } from "./commands/diagnose.ts";
import { runEmitDiff } from "./commands/emitDiff.ts";
import { runFreeze } from "./commands/freeze.ts";
import { isLogKind, LOG_KIND_LIST, runLog } from "./commands/log.ts";
import { runMigrate } from "./commands/migrate.ts";
import { runNext } from "./commands/next.ts";
import { runPrune } from "./commands/prune.ts";
import { runReport } from "./commands/report.ts";
import { runSecrets } from "./commands/secrets.ts";
import { runStatus } from "./commands/status.ts";
import { runTier } from "./commands/tier.ts";

const USAGE = `ever-better — make a codebase that can only get better

  diagnose    survey the repo and write QUALITY.md   (read-only without --write)
  bootstrap   install missing tooling, generate configs
  freeze      pin today's violations as the ceiling   (once, at the start)
  prune       reclaim suppressions you have fixed     (lowers the ceiling)
  check       fail if anything rose above its ceiling (for CI)
  status      print the current backlog
  next        what to drain first, and what each one enforces
  report      where the findings are, by rule and area (markdown, for CI)
  secrets     scan the whole history for committed credentials (gitleaks)
  tier        every rule an error, the files that trip one downgraded to warn (--check for CI)
  emit-diff   prove a type-only refactor changed no behaviour
  catalog     list the helpers that already exist, so nobody writes a sixth
  migrate     JavaScript to TypeScript, the whole repo or one file at a time
  log         record what happened, stamped with the current commit

Options
  --cwd <dir>       target repository (default: current directory)
  --json            machine-readable output where supported
  --write           diagnose: persist state and QUALITY.md
  --dry-run         bootstrap: print the plan without touching anything
  --force           freeze: allow a ceiling to move up
  --no-write        check: do not update the ledger
  --node <version>  node version for the generated workflow (default: ${DEFAULT_NODE_VERSION})
  --kind <kind>     log: ${LOG_KIND_LIST}
  --rule <name>     log: the rule this entry is about
  --against <ref>   emit-diff: git ref to compare against (default: HEAD)
  --file <path>     migrate: the one file to rename (omit to see the plan)
  --all             migrate: rename every JavaScript file in one pass
  --fan-in          next: also count how many files import each one (reads every source file)
  --check           tier: compare against the ledger and write nothing (for CI)
`;

const OPTIONS = {
  cwd: { type: "string" },
  json: { type: "boolean", default: false },
  write: { type: "boolean", default: false },
  "dry-run": { type: "boolean", default: false },
  force: { type: "boolean", default: false },
  "no-write": { type: "boolean", default: false },
  node: { type: "string", default: DEFAULT_NODE_VERSION },
  kind: { type: "string", default: "note" },
  rule: { type: "string" },
  against: { type: "string", default: "HEAD" },
  file: { type: "string" },
  all: { type: "boolean", default: false },
  "fan-in": { type: "boolean", default: false },
  check: { type: "boolean", default: false },
  help: { type: "boolean", default: false },
} as const;

type Flags = {
  cwd: string;
  json: boolean;
  write: boolean;
  dryRun: boolean;
  force: boolean;
  noWrite: boolean;
  node: string;
  kind: string;
  against: string;
  file: string | undefined;
  all: boolean;
  fanIn: boolean;
  check: boolean;
  rule: string | undefined;
  rest: string[];
};

type Outcome = { output: string; ok: boolean; code?: number };

/** Commands that only ever succeed. `check` and `log` are the two that can fail, below. */
const ALWAYS_OK: Record<string, (flags: Flags) => Promise<string>> = {
  diagnose: (flags) => runDiagnose({ cwd: flags.cwd, json: flags.json, write: flags.write }),
  bootstrap: (flags) => runBootstrap({ cwd: flags.cwd, dryRun: flags.dryRun, nodeVersion: flags.node }),
  freeze: (flags) => runFreeze({ cwd: flags.cwd, force: flags.force }),
  prune: (flags) => runPrune({ cwd: flags.cwd }),
  status: (flags) => runStatus({ cwd: flags.cwd, json: flags.json }),
  next: (flags) => runNext({ cwd: flags.cwd, json: flags.json, fanIn: flags.fanIn }),
  report: (flags) => runReport({ cwd: flags.cwd, json: flags.json }),
  catalog: (flags) => runCatalog({ cwd: flags.cwd }),
  migrate: (flags) => runMigrate({ cwd: flags.cwd, file: flags.file ?? null, all: flags.all }),
  "emit-diff": (flags) => runEmitDiff({ cwd: flags.cwd, against: flags.against }),
};

const dispatchLog = async (flags: Flags): Promise<Outcome> => {
  if (!isLogKind(flags.kind)) return { output: `--kind must be one of: ${LOG_KIND_LIST}`, ok: false };
  const text = flags.rest.join(" ").trim();
  if (!text) return { output: 'log needs text: ever-better log --kind deferred "..."', ok: false };
  // exactOptionalPropertyTypes: an optional property must be OMITTED, not set to undefined.
  const rule = flags.rule === undefined ? {} : { rule: flags.rule };
  return { output: await runLog({ cwd: flags.cwd, kind: flags.kind, text, ...rule }), ok: true };
};

const dispatch = async (command: string, flags: Flags): Promise<Outcome> => {
  const alwaysOk = ALWAYS_OK[command];
  if (alwaysOk) return { output: await alwaysOk(flags), ok: true };
  if (command === "log") return dispatchLog(flags);
  if (command === "check") {
    const result = await runCheck({ cwd: flags.cwd, write: !flags.noWrite });
    return { output: result.message, ok: result.ok };
  }
  if (command === "tier") {
    const result = await runTier({ cwd: flags.cwd, check: flags.check });
    return { output: result.message, ok: result.ok };
  }
  if (command === "secrets") {
    // Carries gitleaks' own code — 2 findings, 1 could-not-scan — because flattening both to 1 is
    // the ambiguity this feature exists to remove, and a caller cannot get the distinction back.
    const verdict = await runSecrets({ cwd: flags.cwd });
    return { output: verdict.message, ok: verdict.ok, code: verdict.code };
  }
  return { output: `Unknown command: ${command}\n\n${USAGE}`, ok: false };
};

const main = async (): Promise<number> => {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: OPTIONS,
    allowPositionals: true,
  });

  const command = positionals[0];
  if (!command || values.help) {
    process.stdout.write(USAGE);
    return command ? 0 : 1;
  }

  const flags: Flags = {
    cwd: values.cwd ?? process.cwd(),
    json: values.json,
    write: values.write,
    dryRun: values["dry-run"],
    force: values.force,
    noWrite: values["no-write"],
    node: values.node,
    kind: values.kind,
    against: values.against,
    file: values.file,
    all: values.all,
    fanIn: values["fan-in"],
    check: values.check,
    rule: values.rule,
    rest: positionals.slice(1),
  };

  const { output, ok, code } = await dispatch(command, flags);
  process.stdout.write(`${output}\n`);
  return code ?? (ok ? 0 : 1);
};

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
