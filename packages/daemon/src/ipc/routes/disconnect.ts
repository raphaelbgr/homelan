import { Router, type Router as ExpressRouter } from "express";
import type { Daemon } from "../../daemon.js";
import type { IpcDisconnectResponse } from "@homelan/shared";

export function disconnectRouter(daemon: Daemon): ExpressRouter {
  const router = Router();

  router.post("/", async (_req, res) => {
    try {
      await daemon.disconnect();
      const successResp: IpcDisconnectResponse = { ok: true, message: "Disconnected" };
      res.status(200).json(successResp);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error during disconnect";
      const errorResp: IpcDisconnectResponse = { ok: false, message };
      res.status(500).json(errorResp);
    }
  });

  return router;
}
