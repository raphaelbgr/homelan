import express, { type Express } from "express";
import type { PeerStore } from "./store/index.js";
import type { RelayConfig } from "./config.js";
import { registerRouter } from "./routes/register.js";
import { lookupRouter } from "./routes/lookup.js";
import { inviteRouter, type InviteStore } from "./routes/invite.js";
import { pairRouter } from "./routes/pair.js";
import { httpsOnlyMiddleware } from "./middleware/httpsOnly.js";
import { rateLimitMiddleware } from "./middleware/rateLimit.js";
export { createRelayHandler } from "./routes/relay.js";

export function createApp(
  config: RelayConfig,
  store: PeerStore,
  inviteStore?: InviteStore
): Express {
  const app = express();
  // Create a shared InviteStore if not provided (production path)
  const sharedInviteStore: InviteStore = inviteStore ?? new Map();

  app.use(express.json());
  app.use(httpsOnlyMiddleware);
  app.use(rateLimitMiddleware({ maxRequests: 100, windowMs: 60_000 }));
  app.use("/register", registerRouter(store, config));
  app.use("/lookup", lookupRouter(store, config));
  app.use("/invite", inviteRouter(store, config, sharedInviteStore));
  app.use("/pair", pairRouter(store, config, sharedInviteStore));
  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
