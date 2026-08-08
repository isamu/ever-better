#!/usr/bin/env node
import { parseArgs } from "node:util";
import { DEFAULT_NODE_VERSION } from "./generate/actionVersions.ts";
import process from "node:process";
import { runBootstrap } from "./commands/bootstrap.ts";
import { runCheck } from "./commands/check.ts";
import { runDiagnose } from "./commands/diagnose.ts";
import { runEmitDiff } from "./commands/emitDiff.ts";
import { runFreeze } from "./commands/freeze.ts";
import { isLogKind, LOG_KIND_LIST, runLog } from "./commands/log.ts";
import { runPrune } from "./commands/prune.ts";
import { runStatus } from "./commands/status.ts";

const USAGE = `ever-better — make a codebase that can only get better

  diagnose    survey the repo and write QUALITY.md   (read-only without --write)
  bootstrap   install missing tooling, generate configs
  freeze      pin today's violations as the ceiling   (once, at the start)
  prune       reclaim suppressions you have fixed     (lowers the ceiling)
  check       fail if anything rose above its ceiling (for CI)
  status      print the current backlog
  emit-diff   prove a type-only refactor changed no behaviour
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
  rule: string | undefined;
  rest: string[];
};

const dispatch = async (
  command: string,
  flags: Flags,
): Promise<{ output: string; ok: boolean }> => {
  if (command === "diagnose") {
    const output = await runDiagnose({ cwd: flags.cwd, json: flags.json, write: flags.write });
    return { output, ok: true };
  }
  if (command === "bootstrap") {
    const output = await runBootstrap({
      cwd: flags.cwd,
      dryRun: flags.dryRun,
      nodeVersion: flags.node,
    });
    return { output, ok: true };
  }
  if (command === "freeze") {
    return { output: await runFreeze({ cwd: flags.cwd, force: flags.force }), ok: true };
  }
  if (command === "emit-diff") {
    return { output: await runEmitDiff({ cwd: flags.cwd, against: flags.against }), ok: true };
  }
  if (command === "prune") {
    return { output: await runPrune({ cwd: flags.cwd }), ok: true };
  }
  if (command === "check") {
    const result = await runCheck({ cwd: flags.cwd, write: !flags.noWrite });
    return { output: result.message, ok: result.ok };
  }
  if (command === "log") {
    if (!isLogKind(flags.kind))
      return { output: `--kind must be one of: ${LOG_KIND_LIST}`, ok: false };
    const text = flags.rest.join(" ").trim();
    if (!text)
      return { output: 'log needs text: ever-better log --kind deferred "..."', ok: false };
    // exactOptionalPropertyTypes: an optional property must be OMITTED, not set to undefined.
    const rule = flags.rule === undefined ? {} : { rule: flags.rule };
    const output = await runLog({ cwd: flags.cwd, kind: flags.kind, text, ...rule });
    return { output, ok: true };
  }
  if (command === "status") {
    return { output: await runStatus({ cwd: flags.cwd, json: flags.json }), ok: true };
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
    rule: values.rule,
    rest: positionals.slice(1),
  };

  const { output, ok } = await dispatch(command, flags);
  process.stdout.write(`${output}\n`);
  return ok ? 0 : 1;
};

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
