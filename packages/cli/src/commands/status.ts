import { Command } from "commander";
import { IpcClient } from "../ipcClient.js";
import type { DaemonStatus } from "@homelan/shared";

interface StatusOptions {
  human: boolean;
  json: boolean;
}

function formatUptime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function printHumanTable(status: DaemonStatus): void {
  const lines: Array<[string, string]> = [
    ["Status:", status.state],
    ["Mode:", status.mode ?? "none"],
    ["Latency:", status.latencyMs != null ? `${status.latencyMs}ms` : "n/a"],
    ["Uptime:", formatUptime(status.uptimeMs)],
  ];

  if (status.hostInfo) {
    lines.push(["Host:", status.hostInfo.hostname]);
    lines.push(["Subnet:", status.hostInfo.subnet]);
  }

  if (status.connectedPeers.length > 0) {
    lines.push(["Peers:", String(status.connectedPeers.length)]);
  }

  if (status.lanDevices.length > 0) {
    lines.push(["LAN devices:", String(status.lanDevices.length)]);
  }

  const labelWidth = Math.max(...lines.map(([l]) => l.length)) + 1;
  for (const [label, value] of lines) {
    process.stdout.write(`${label.padEnd(labelWidth)} ${value}\n`);
  }
}

export function statusCommand(): Command {
  const cmd = new Command("status");
  cmd
    .description("Show tunnel connection status")
    .option("--human", "Show human-readable table instead of JSON", false)
    .option("--json", "Show JSON output (default)", false)
    .action(async (opts: StatusOptions) => {
      const client = new IpcClient();

      if (!(await client.isRunning())) {
        if (opts.human) {
          process.stderr.write("Error: homelan daemon is not running\n");
        } else {
          process.stdout.write(JSON.stringify({ ok: false, error: "Daemon is not running" }) + "\n");
        }
        process.exit(3);
      }

      try {
        const status = await client.get<DaemonStatus>("/status");

        if (opts.human) {
          printHumanTable(status);
        } else {
          // JSON is default (both --json and no flag)
          process.stdout.write(JSON.stringify(status, null, 2) + "\n");
        }
        process.exit(0);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (opts.human) {
          process.stderr.write(`Error: ${message}\n`);
        } else {
          process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n");
        }
        process.exit(1);
      }
    });

  return cmd;
}
