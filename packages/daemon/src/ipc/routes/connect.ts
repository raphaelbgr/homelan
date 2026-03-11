import { Router, type Router as ExpressRouter } from "express";
import type { Daemon } from "../../daemon.js";
import type {
  IpcConnectRequest,
  IpcConnectResponse,
} from "@homelan/shared";
import type { TunnelMode, NatTraversalConfig } from "@homelan/shared";

const DEFAULT_STUN_SERVERS = [
  "stun.l.google.com:19302",
  "stun1.l.google.com:19302",
];

const DEFAULT_HOLE_PUNCH_TIMEOUT_MS = 4000;

export function connectRouter(daemon: Daemon): ExpressRouter {
  const router = Router();

  router.post("/", async (req, res) => {
    const body = req.body as Partial<IpcConnectRequest>;

    // Validate mode
    const mode = body.mode as TunnelMode | undefined;
    if (mode !== "full-gateway" && mode !== "lan-only") {
      const errorResp: IpcConnectResponse = {
        ok: false,
        message: 'Invalid mode: expected "full-gateway" or "lan-only"',
      };
      res.status(400).json(errorResp);
      return;
    }

    // Build NatTraversalConfig from environment variables or defaults
    const relayUrl = process.env["RELAY_URL"] ?? "";
    const relaySecret = process.env["RELAY_SECRET"] ?? "";
    const peerPublicKey = process.env["PEER_PUBLIC_KEY"] ?? "";

    if (!relayUrl) {
      const errorResp: IpcConnectResponse = {
        ok: false,
        message: "RELAY_URL environment variable is not set",
      };
      res.status(500).json(errorResp);
      return;
    }

    if (!peerPublicKey) {
      const errorResp: IpcConnectResponse = {
        ok: false,
        message: "PEER_PUBLIC_KEY environment variable is not set",
      };
      res.status(500).json(errorResp);
      return;
    }

    const config: NatTraversalConfig & { mode: TunnelMode } = {
      stunServers: DEFAULT_STUN_SERVERS,
      holePunchTimeoutMs: DEFAULT_HOLE_PUNCH_TIMEOUT_MS,
      relayUrl,
      relaySecret,
      peerPublicKey,
      mode,
    };

    try {
      await daemon.connect(config);
      const successResp: IpcConnectResponse = { ok: true, message: "Connected" };
      res.status(200).json(successResp);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error during connect";
      const errorResp: IpcConnectResponse = { ok: false, message };
      res.status(500).json(errorResp);
    }
  });

  return router;
}
