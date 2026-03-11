import { Router } from "express";
import type { Daemon } from "../../daemon.js";

export function statusRouter(daemon: Daemon) {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json(daemon.getStatus());
  });
  return router;
}
