import { Router, type Router as ExpressRouter } from "express";
import type { Daemon } from "../../daemon.js";

export function devicesRouter(daemon: Daemon): ExpressRouter {
  const router = Router();
  router.get("/", (_req, res) => {
    res.json({ devices: daemon.getLanDevices() });
  });
  return router;
}
