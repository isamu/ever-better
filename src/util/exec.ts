import { spawn } from "node:child_process";

export type ExecResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** Anything bigger than this is a runaway, not output we could use. */
const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;

const collect = (chunks: Buffer[], chunk: Buffer, label: string): void => {
  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  if (total > MAX_CAPTURE_BYTES) {
    throw new Error(`${label} exceeded ${MAX_CAPTURE_BYTES} bytes`);
  }
  chunks.push(chunk);
};

export type ExecOptions = {
  /** Needed only for Windows `.cmd` shims, which Node refuses to spawn directly. */
  shell?: boolean;
};

export const exec = async (
  command: string,
  args: readonly string[],
  cwd: string,
  options: ExecOptions = {},
): Promise<ExecResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { cwd, shell: options.shell ?? false });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => collect(out, chunk, `${command} stdout`));
    child.stderr.on("data", (chunk: Buffer) => collect(err, chunk, `${command} stderr`));
    child.on("error", (cause: Error) =>
      reject(new Error(`failed to run \`${command}\` in ${cwd}: ${cause.message}`, { cause })),
    );
    child.on("close", (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out).toString("utf8"),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
  });
