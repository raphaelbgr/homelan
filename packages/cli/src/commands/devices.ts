import { Command } from "commander";
import { IpcClient } from "../ipcClient.js";
import type { IpcDevicesResponse } from "@homelan/shared";
import type { LanDevice } from "@homelan/shared";

function printDevicesTable(devices: LanDevice[]): void {
  if (devices.length === 0) {
    process.stdout.write("No devices discovered yet. Connect and wait up to 30 seconds.\n");
    return;
  }

  // Column headers
  const header: [string, string, string] = ["IP", "Hostname", "Type"];
  const rows: Array<[string, string, string]> = devices.map((d) => [
    d.ip,
    d.hostname ?? "(unknown)",
    d.deviceType ?? "(unknown)",
  ]);

  const allRows: Array<[string, string, string]> = [header, ...rows];
  const colWidths = [0, 1, 2].map((i) => Math.max(...allRows.map((r) => r[i]?.length ?? 0)));

  for (const row of allRows) {
    process.stdout.write(
      row.map((cell, i) => cell.padEnd(colWidths[i] ?? 0)).join("  ") + "\n"
    );
  }
}

export function devicesCommand(): Command {
  const cmd = new Command("devices");
  cmd
    .description("List discovered LAN devices")
    .option("--json", "Output JSON instead of table")
    .action(async (opts: { json: boolean }) => {
      const client = new IpcClient();

      if (!(await client.isRunning())) {
        process.stderr.write("Error: homelan daemon is not running\n");
        process.exit(3);
      }

      try {
        const result = await client.get<IpcDevicesResponse>("/devices");
        if (opts.json) {
          process.stdout.write(JSON.stringify(result.devices, null, 2) + "\n");
        } else {
          printDevicesTable(result.devices);
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
