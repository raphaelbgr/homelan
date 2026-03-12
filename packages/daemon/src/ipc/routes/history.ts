import { Router, type Router as IRouter } from "express";
import type { Daemon } from "../../daemon.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function historyRouter(daemon: Daemon): IRouter {
  const router = Router();

  router.get("/", (req, res) => {
    const rawLimit = req.query["limit"];
    let limit = DEFAULT_LIMIT;

    if (rawLimit !== undefined) {
      const parsed = parseInt(String(rawLimit), 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, MAX_LIMIT);
      }
    }

    const entries = daemon.historyLogger.getEntries(limit);
    res.status(200).json({ entries });
  });

  return router;
}
