import { Router, type IRouter } from "express";
import { z } from "zod";
import type { PeerStore } from "../store/index.js";
import type { RelayConfig } from "../config.js";
import type { InviteStore } from "./invite.js";
import type { PairResponse, RelayError } from "@homelan/shared";

// WireGuard public key: base64-encoded 32 bytes = 44 characters (including padding)
const PairSchema = z.object({
  token: z.string().min(1),
  clientPublicKey: z.string().length(44).regex(/^[A-Za-z0-9+/]{43}=$/),
});

export function pairRouter(
  store: PeerStore,
  config: RelayConfig,
  inviteStore: InviteStore
): IRouter {
  const router = Router();

  router.post("/", (req, res) => {
    const result = PairSchema.safeParse(req.body);
    if (!result.success) {
      const error: RelayError = {
        error: result.error.errors.map((e) => e.message).join(", "),
        code: "INVALID_REQUEST",
      };
      res.status(400).json(error);
      return;
    }

    const { token, clientPublicKey } = result.data;

    // Validate token exists and has not expired
    const entry = inviteStore.get(token);
    if (!entry || entry.expiresAt < Date.now()) {
      // Clean up expired token if present
      if (entry) inviteStore.delete(token);
      const error: RelayError = {
        error: "Token not found or expired",
        code: "INVALID_TOKEN",
      };
      res.status(401).json(error);
      return;
    }

    // Single-use: delete token immediately (before responding)
    inviteStore.delete(token);

    // Store client's public key in the peer store for future lookup
    store.upsert({
      publicKey: clientPublicKey,
      endpoint: "",
      timestampMs: Date.now(),
    });

    const response: PairResponse = {
      serverPublicKey: entry.serverPublicKey,
      relayUrl: config.relayUrl,
    };

    res.status(200).json(response);
  });

  return router;
}
