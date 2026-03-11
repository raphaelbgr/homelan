import { Command } from "commander";
import { IpcClient } from "../ipcClient.js";
import type { IpcSwitchModeResponse } from "@homelan/shared";
import type { TunnelMode } from "@homelan/shared";

export function switchModeCommand(): Command {
  const cmd = new Command("switch-mode");
  cmd
    .description("Switch tunnel mode while connected (full-gateway or lan-only)")
    .argument("<mode>", "Mode to switch to: full-gateway or lan-only")
    .option("--json", "Output JSON response", false)
    .action(async (mode: string, opts: { json: boolean }) => {
      if (mode !== "full-gateway" && mode !== "lan-only") {
        process.stderr.write(
          `Error: Invalid mode "${mode}". Must be full-gateway or lan-only\n`
        );
        process.exit(1);
      }

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

      try {
        const result = await client.post<IpcSwitchModeResponse>("/switch-mode", {
          mode: mode as TunnelMode,
        });
        if (opts.json) {
          process.stdout.write(JSON.stringify(result) + "\n");
        } else {
          process.stdout.write(result.message + "\n");
        }
        process.exit(result.ok ? 0 : 1);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        if (opts.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: message }) + "\n");
        } else {
          process.stderr.write(`Error: ${message}\n`);
        }
        process.exit(1);
      }
    });
  return cmd;
}
