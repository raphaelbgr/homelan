import { Command } from "commander";
import ora from "ora";
import { IpcClient } from "../ipcClient.js";
import type { ConnectionState, DaemonStatus } from "@homelan/shared";

interface ConnectOptions {
  mode: string;
  timeout: string;
  retry: string;
  json: boolean;
}

async function pollUntilConnected(
  client: IpcClient,
  timeoutMs: number
): Promise<{ state: ConnectionState; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const status = await client.get<DaemonStatus>("/status");
    if (status.state === "connected") return { state: "connected" };
    if (status.state === "error") return { state: "error", error: "Daemon reported error state" };
    if (status.state === "idle") return { state: "idle", error: "Connection aborted" };
  }
  return { state: "error", error: "Timeout" };
}

async function attemptConnect(
  client: IpcClient,
  mode: string,
  timeoutSec: number,
  useJson: boolean
): Promise<number> {
  const spinner = useJson ? null : ora("Discovering peer...").start();

  try {
    // POST /connect (async — daemon starts connecting)
    await client.post<{ ok: boolean; message: string }>("/connect", { mode });

    if (spinner) spinner.text = "Connecting...";

    const result = await pollUntilConnected(client, timeoutSec * 1000);

    if (result.state === "connected") {
      if (useJson) {
        process.stdout.write(JSON.stringify({ ok: true, state: "connected" }) + "\n");
      } else {
        spinner?.succeed("Connected");
      }
      return 0;
    }

    if (result.error === "Timeout") {
      if (useJson) {
        process.stdout.write(JSON.stringify({ ok: false, error: "Timeout" }) + "\n");
      } else {
        spinner?.fail("Connection timed out");
      }
      return 2;
    }

    if (useJson) {
      process.stdout.write(JSON.stringify({ ok: false, error: result.error ?? "Unknown error" }) + "\n");
    } else {
      spinner?.fail(result.error ?? "Connection failed");
    }
    return 1;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (useJson) {
      process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n");
    } else {
      spinner?.fail(message);
    }
    return 1;
  }
}

export function connectCommand(): Command {
  const cmd = new Command("connect");
  cmd
    .description("Connect to the home LAN tunnel")
    .option("--mode <mode>", "Tunnel mode: lan-only or full-gateway", "lan-only")
    .option("--timeout <seconds>", "Connection timeout in seconds", "30")
    .option("--retry <count>", "Retry count on failure", "0")
    .option("--json", "Output JSON lines instead of spinner", false)
    .action(async (opts: ConnectOptions) => {
      const client = new IpcClient();

      if (!(await client.isRunning())) {
        if (opts.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: "Daemon is not running" }) + "\n");
        } else {
          process.stderr.write("Error: homelan daemon is not running\n");
        }
        process.exit(3);
      }

      const timeoutSec = parseInt(opts.timeout, 10);
      const retryCount = parseInt(opts.retry, 10);

      let exitCode = 1;
      for (let attempt = 0; attempt <= retryCount; attempt++) {
        if (attempt > 0) {
          if (!opts.json) {
            process.stderr.write(`Retrying... (attempt ${attempt + 1} of ${retryCount + 1})\n`);
          }
        }
        exitCode = await attemptConnect(client, opts.mode, timeoutSec, opts.json);
        if (exitCode === 0) break;
      }

      process.exit(exitCode);
    });

  return cmd;
}
