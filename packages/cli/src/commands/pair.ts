import { Command } from "commander";
import ora from "ora";
import { IpcClient, IpcClientError } from "../ipcClient.js";

interface PairOptions {
  json: boolean;
}

interface PairResponse {
  ok: boolean;
  serverPublicKey: string;
}

export function pairCommand(): Command {
  const cmd = new Command("pair");
  cmd
    .description("Pair with home server using an invite URL")
    .argument("<invite-url>", "Invite URL (homelan:// or https://)")
    .option("--json", "Output JSON instead of spinner", false)
    .action(async (inviteUrl: string, opts: PairOptions) => {
      const client = new IpcClient();

      if (!(await client.isRunning())) {
        if (opts.json) {
          process.stdout.write(
            JSON.stringify({ ok: false, error: "Daemon is not running" }) + "\n"
          );
        } else {
          process.stderr.write(
            "Daemon is not running. Start with: homelan start\n"
          );
        }
        process.exit(3);
      }

      const spinner = opts.json ? null : ora("Pairing with home server...").start();

      try {
        const result = await client.post<PairResponse>("/pair", { inviteUrl });

        if (opts.json) {
          process.stdout.write(
            JSON.stringify({ ok: true, serverPublicKey: result.serverPublicKey }) + "\n"
          );
        } else {
          spinner?.succeed("Paired successfully");
        }
        process.exit(0);
      } catch (err: unknown) {
        if (err instanceof IpcClientError) {
          if (err.statusCode === 409) {
            if (opts.json) {
              process.stdout.write(
                JSON.stringify({ ok: false, error: "Cannot pair while connected. Disconnect first." }) + "\n"
              );
            } else {
              spinner?.fail("Cannot pair while connected. Disconnect first.");
            }
          } else {
            if (opts.json) {
              process.stdout.write(
                JSON.stringify({ ok: false, error: err.message }) + "\n"
              );
            } else {
              spinner?.fail(`Pairing failed: ${err.message}`);
            }
          }
        } else {
          const message = err instanceof Error ? err.message : String(err);
          if (opts.json) {
            process.stdout.write(
              JSON.stringify({ ok: false, error: message }) + "\n"
            );
          } else {
            spinner?.fail(`Pairing failed: ${message}`);
          }
        }
        process.exit(1);
      }
    });

  return cmd;
}
