import { Router, type Router as IRouter } from "express";
import type { Daemon } from "../../daemon.js";
import { RelayClientError } from "../../nat/relayClient.js";

export function pairRouter(daemon: Daemon): IRouter {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = req.body as { inviteUrl?: unknown };

    // Validate inviteUrl
    if (!body.inviteUrl || typeof body.inviteUrl !== "string" || body.inviteUrl.trim() === "") {
      res.status(400).json({
        error: "inviteUrl is required and must be a non-empty string",
        code: "INVALID_REQUEST",
      });
      return;
    }

    // Cannot pair while connected
    if (daemon.state !== "idle") {
      res.status(409).json({
        error: "Cannot pair while daemon is not idle. Disconnect first.",
        code: "NOT_IDLE",
      });
      return;
    }

    try {
      await daemon.pair(body.inviteUrl);
      res.status(200).json({ ok: true });
    } catch (err) {
      if (err instanceof RelayClientError) {
        res.status(500).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      const message = err instanceof Error ? err.message : "Pair failed";
      res.status(500).json({
        error: message,
        code: "PAIR_FAILED",
      });
    }
  });

  return router;
}
