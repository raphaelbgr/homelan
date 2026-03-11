import { Router, type IRouter } from "express";
import type { PeerStore } from "../store/index.js";
import type { RelayConfig } from "../config.js";
import type { LookupResponse, RelayError } from "@homelan/shared";

export function lookupRouter(store: PeerStore, config: RelayConfig): IRouter {
  const router = Router();

  router.get("/:publicKey", (req, res) => {
    const publicKey = req.params["publicKey"];
    if (!publicKey) {
      const error: RelayError = {
        error: "Public key is required",
        code: "INVALID_REQUEST",
      };
      res.status(400).json(error);
      return;
    }

    const peer = store.findByPublicKey(publicKey, config.ttlSeconds);
    if (!peer) {
      const error: RelayError = {
        error: "Peer not found",
        code: "NOT_FOUND",
      };
      res.status(404).json(error);
      return;
    }

    const response: LookupResponse = {
      publicKey: peer.publicKey,
      endpoint: peer.endpoint,
      timestampMs: peer.timestampMs,
    };
    res.status(200).json(response);
  });

  return router;
}
