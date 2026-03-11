import { Daemon } from "./daemon.js";
import { createIpcServer } from "./ipc/server.js";
import type { Server } from "node:http";

const IPC_PORT = 30001;
const daemon = new Daemon();

async function main(): Promise<void> {
  await daemon.start();

  const app = createIpcServer(daemon);
  const server: Server = app.listen(IPC_PORT, "127.0.0.1", () => {
    console.log(`[daemon] IPC server listening on 127.0.0.1:${IPC_PORT}`);
  });

  process.on("SIGTERM", () => gracefulShutdown(server));
  process.on("SIGINT", () => gracefulShutdown(server));
}

function gracefulShutdown(server: Server): void {
  console.log("[daemon] Shutting down...");
  server.close(() => {
    console.log("[daemon] Shutdown complete.");
    process.exit(0);
  });
}

main().catch((err: unknown) => {
  console.error("[daemon] Fatal startup error:", err);
  process.exit(1);
});
