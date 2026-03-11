import { Router, type IRouter } from "express";
import { z } from "zod";
import type { PeerStore } from "../store/index.js";
import type { RelayConfig } from "../config.js";
import type { RegisterResponse, RelayError } from "@homelan/shared";

// WireGuard public key: base64-encoded 32 bytes = 44 characters (including padding)
const RegisterSchema = z.object({
  publicKey: z.string().length(44).regex(/^[A-Za-z0-9+/]{43}=$/),
  endpoint: z.string(),
  timestampMs: z.number(),
});

export function registerRouter(store: PeerStore, config: RelayConfig): IRouter {
  const router = Router();

  router.post("/", (req, res) => {
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      const error: RelayError = {
        error: result.error.errors.map((e) => e.message).join(", "),
        code: "INVALID_REQUEST",
      };
      res.status(400).json(error);
      return;
    }

    const { publicKey, endpoint, timestampMs } = result.data;
    store.upsert({ publicKey, endpoint, timestampMs });

    const response: RegisterResponse = {
      ok: true,
      ttlSeconds: config.ttlSeconds,
    };
    res.status(200).json(response);
  });

  return router;
}
