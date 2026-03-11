import express, { type Express } from "express";
import type { PeerStore } from "./store/index.js";
import type { RelayConfig } from "./config.js";
import { registerRouter } from "./routes/register.js";
import { lookupRouter } from "./routes/lookup.js";
import { httpsOnlyMiddleware } from "./middleware/httpsOnly.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
export { createRelayHandler } from "./routes/relay.js";

export function createApp(config: RelayConfig, store: PeerStore): Express {
  const app = express();
  app.use(express.json());
  app.use(httpsOnlyMiddleware);
  app.use(rateLimitMiddleware({ maxRequests: 100, windowMs: 60_000 }));
  app.use("/register", registerRouter(store, config));
  app.use("/lookup", lookupRouter(store, config));
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
