import { Router } from "express";
import type { Daemon } from "../../daemon.js";
import type { SseEvent } from "@homelan/shared";
import type { ConnectionState } from "@homelan/shared";

export function eventsRouter(daemon: Daemon) {
  const router = Router();
  router.get("/", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (event: SseEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Send current state immediately on connect
    sendEvent({
      type: "state_changed",
      timestampMs: Date.now(),
      data: { state: daemon.state },
    });

    // Subscribe to future transitions
    const unsubscribe = daemon.onStateChange(
      (next: ConnectionState, prev: ConnectionState) => {
        sendEvent({
          type: "state_changed",
          timestampMs: Date.now(),
          data: { state: next, prev },
        });
      }
    );

    // Keepalive comment every 30s to prevent proxy timeouts
    const keepalive = setInterval(() => {
      res.write(": keepalive\n\n");
    }, 30_000);

    req.on("close", () => {
      unsubscribe();
      clearInterval(keepalive);
    });
  });
  return router;
}
