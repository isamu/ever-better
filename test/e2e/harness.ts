import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const cli = path.join(repoRoot, "dist", "cli.js");

/** Installing real packages is the slow part, and the reason this is not in `yarn test`. */
export const TIMEOUT_MS = 600_000;

export type Run = { code: number; stdout: string; stderr: string };

export const run = (command: string, args: readonly string[], cwd: string): Promise<Run> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd, shell: false });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => out.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => err.push(chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
  });

export const everBetter = (args: readonly string[], cwd: string): Promise<Run> => run(process.execPath, [cli, ...args], cwd);

export const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;
