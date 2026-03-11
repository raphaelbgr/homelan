import { Router, type Router as ExpressRouter } from "express";
import type { Daemon } from "../../daemon.js";
import type { IpcSwitchModeRequest, IpcSwitchModeResponse } from "@homelan/shared";

export function switchModeRouter(daemon: Daemon): ExpressRouter {
  const router = Router();
  router.post("/", async (req, res) => {
    const body = req.body as IpcSwitchModeRequest;
    const { mode } = body;

    if (mode !== "full-gateway" && mode !== "lan-only") {
      res
        .status(400)
        .json({
          ok: false,
          message: "Invalid mode. Must be full-gateway or lan-only",
        } satisfies IpcSwitchModeResponse);
      return;
    }

    try {
      await daemon.switchMode(mode);
      res.json({
        ok: true,
        message: `Switched to ${mode} mode`,
      } satisfies IpcSwitchModeResponse);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Switch mode failed";
      res
        .status(409)
        .json({ ok: false, message } satisfies IpcSwitchModeResponse);
    }
  });
  return router;
}
