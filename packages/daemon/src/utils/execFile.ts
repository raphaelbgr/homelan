import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(nodeExecFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export type ShellExecutor = (cmd: string, args: string[]) => Promise<ExecResult>;

/**
 * Safe shell executor. Always uses execFile (not exec) with args as an array
 * to prevent shell injection — never interpolates args into a shell string.
 */
export async function execFileSafe(
  cmd: string,
  args: string[],
  timeoutMs = 5000
): Promise<ExecResult> {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    timeout: timeoutMs,
    encoding: "utf8",
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}
