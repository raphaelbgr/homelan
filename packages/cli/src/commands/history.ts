import { Command } from "commander";
import { IpcClient } from "../ipcClient.js";

interface HistoryEntry {
  timestamp: string;
  action: "connect" | "disconnect" | "mode_switch" | "error";
  mode?: string;
  duration_ms?: number;
  peer_endpoint?: string;
  fallback_method?: string;
  error?: string;
}

interface HistoryResponse {
  entries: HistoryEntry[];
}

interface HistoryOptions {
  json: boolean;
  limit: string;
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "--";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function printHistoryTable(entries: HistoryEntry[]): void {
  if (entries.length === 0) {
    process.stdout.write("No connection history yet.\n");
    return;
  }

  type Row = [string, string, string, string, string];

  const header: Row = ["Timestamp", "Action", "Mode", "Duration", "Method"];
  const rows: Row[] = entries.map((e) => [
    new Date(e.timestamp).toLocaleString(),
    e.action,
    e.mode ?? "--",
    formatDuration(e.duration_ms),
    e.fallback_method ?? "--",
  ]);

  const allRows: Row[] = [header, ...rows];
  const colWidths = [0, 1, 2, 3, 4].map((i) =>
    Math.max(...allRows.map((r) => (r[i] ?? "").length))
  );

  for (const row of allRows) {
    process.stdout.write(
      row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join("  ") + "\n"
    );
  }
}

export function historyCommand(): Command {
  const cmd = new Command("history");
  cmd
    .description("Show connection history")
    .option("--json", "Output JSON instead of table", false)
    .option("--limit <n>", "Number of entries to show", "20")
    .action(async (opts: HistoryOptions) => {
      const client = new IpcClient();

      if (!(await client.isRunning())) {
        if (opts.json) {
          process.stdout.write(
            JSON.stringify({ ok: false, error: "Daemon is not running" }) + "\n"
          );
        } else {
          process.stderr.write("Error: homelan daemon is not running\n");
        }
        process.exit(3);
      }

      const limit = parseInt(opts.limit, 10);

      try {
        const result = await client.get<HistoryResponse>(`/history?limit=${limit}`);

        if (opts.json) {
          process.stdout.write(JSON.stringify(result.entries, null, 2) + "\n");
        } else {
          printHistoryTable(result.entries);
        }
        process.exit(0);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error: ${message}\n`);
        process.exit(1);
      }
    });

  return cmd;
}
