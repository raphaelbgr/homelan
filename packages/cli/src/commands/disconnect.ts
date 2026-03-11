import { Command } from "commander";
import { IpcClient } from "../ipcClient.js";

interface DisconnectOptions {
  json: boolean;
}

export function disconnectCommand(): Command {
  const cmd = new Command("disconnect");
  cmd
    .description("Disconnect from the home LAN tunnel")
    .option("--json", "Output JSON instead of human text", false)
    .action(async (opts: DisconnectOptions) => {
      const client = new IpcClient();

      if (!(await client.isRunning())) {
        if (opts.json) {
          process.stdout.write(JSON.stringify({ ok: false, error: "Daemon is not running" }) + "\n");
        } else {
          process.stderr.write("Error: homelan daemon is not running\n");
        }
        process.exit(3);
      }

      try {
        const result = await client.post<{ ok: boolean; message: string }>("/disconnect", {});
        if (opts.json) {
          process.stdout.write(JSON.stringify(result) + "\n");
        } else {
          process.stdout.write("Disconnected\n");
        }
        process.exit(0);
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
