import express, { type Express } from "express";
import type { Daemon } from "../daemon.js";
import { statusRouter } from "./routes/status.js";
import { devicesRouter } from "./routes/devices.js";
import { eventsRouter } from "./routes/events.js";
import { connectRouter } from "./routes/connect.js";
import { disconnectRouter } from "./routes/disconnect.js";
import { switchModeRouter } from "./routes/switchMode.js";

export type IpcServer = Express;

/**
 * Creates the Express IPC server for the daemon.
 * Security: only accepts connections from localhost (127.0.0.1 / ::1).
 */
export function createIpcServer(daemon: Daemon): Express {
  const app = express();
  app.use(express.json());

  // Security: reject non-localhost connections
  app.use((req, res, next) => {
    const ip = req.socket.remoteAddress;
    if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
      res.status(403).json({ error: "Forbidden", code: "FORBIDDEN" });
      return;
    }
    next();
  });

  app.use("/status", statusRouter(daemon));
  app.use("/devices", devicesRouter(daemon));
  app.use("/events", eventsRouter(daemon));
  app.use("/connect", connectRouter(daemon));
  app.use("/disconnect", disconnectRouter(daemon));
  app.use("/switch-mode", switchModeRouter(daemon));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, uptimeMs: daemon.uptimeMs });
  });

  // 404 handler — must be last
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
  });

  return app;
}
