import process from "node:process";

const isErrno = (value: unknown): value is { code?: unknown } => typeof value === "object" && value !== null;

/**
 * Whether a process id belongs to something still running. Signal 0 asks the question without
 * sending anything, and works on Windows too.
 *
 * A process we are not permitted to signal answers EPERM, which is still a running process — reading
 * that as "gone" is how a lock file gets taken from a live holder.
 */
export const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return isErrno(cause) && cause.code === "EPERM";
  }
};
