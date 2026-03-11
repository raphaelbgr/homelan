import { Router } from "express";
import type { Daemon } from "../../daemon.js";

export function connectRouter(_daemon: Daemon) {
  const router = Router();
  router.post("/", (_req, res) => {
    res.status(501).json({
      error: "Not implemented. Available in Phase 2.",
      code: "NOT_IMPLEMENTED",
    });
  });
  return router;
}
