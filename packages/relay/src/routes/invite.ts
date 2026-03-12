import { randomBytes } from "node:crypto";
import { Router, type IRouter } from "express";
import type { PeerStore } from "../store/index.js";
import type { RelayConfig } from "../config.js";
import type { InviteResponse, RelayError } from "@homelan/shared";

const INVITE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export interface InviteEntry {
  expiresAt: number;
  serverPublicKey: string;
}

// InviteStore is a Map of token -> InviteEntry. Shared between invite and pair routers.
export type InviteStore = Map<string, InviteEntry>;

export function inviteRouter(
  _store: PeerStore,
  config: RelayConfig,
  inviteStore: InviteStore
): IRouter {
  const router = Router();

  router.post("/", (req, res) => {
    // Require Bearer token auth with relay secret
    const authHeader = req.headers["authorization"];
    const expectedBearer = `Bearer ${config.relaySecret}`;
    if (!authHeader || authHeader !== expectedBearer) {
      const error: RelayError = {
        error: "Unauthorized",
        code: "UNAUTHORIZED",
      };
      res.status(401).json(error);
      return;
    }

    // Generate 32-byte cryptographically random token as hex (64 chars)
    const token = randomBytes(32).toString("hex");
    const expiresAt = Date.now() + INVITE_TTL_MS;

    inviteStore.set(token, {
      expiresAt,
      serverPublicKey: config.serverPublicKey,
    });

    const inviteUrl = `homelan://pair?token=${token}&relay=${encodeURIComponent(config.relayUrl)}`;

    const response: InviteResponse = {
      inviteUrl,
      token,
      expiresAt,
    };

    res.status(200).json(response);
  });

  return router;
}
