import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { RelayConfig } from "../config.js";

interface RelayOptions {
  /** How long (ms) to wait for a second peer to pair before closing. Default: 10_000 */
  pairingTimeoutMs?: number;
}

interface HandshakeFrame {
  publicKey: string;
  relaySecret: string;
  sessionToken: string;
}

function isHandshakeFrame(obj: unknown): obj is HandshakeFrame {
  if (!obj || typeof obj !== "object") return false;
  const h = obj as Record<string, unknown>;
  return (
    typeof h["publicKey"] === "string" &&
    typeof h["relaySecret"] === "string" &&
    typeof h["sessionToken"] === "string"
  );
}

/**
 * Creates a WebSocket upgrade handler for the /relay endpoint.
 *
 * Protocol:
 *  1. Client connects and sends a JSON handshake frame first:
 *     { publicKey, relaySecret, sessionToken }
 *  2. Relay validates relaySecret; closes with 4001 if invalid.
 *  3. Relay pairs two clients sharing the same sessionToken and
 *     proxies raw binary frames between them.
 *  4. If no partner arrives within pairingTimeoutMs, the waiting peer
 *     is closed.
 *  5. When one peer disconnects, the relay closes the partner.
 */
export function createRelayHandler(
  config: RelayConfig,
  options: RelayOptions = {},
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const pairingTimeoutMs = options.pairingTimeoutMs ?? 10_000;

  const wss = new WebSocketServer({ noServer: true });

  // Map from sessionToken → waiting (unpaired) WebSocket
  const waiting = new Map<string, WebSocket>();
  // Map from sessionToken → timer handle (cancelled when paired)
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  wss.on("connection", (ws: WebSocket) => {
    // Step 1: wait for the JSON handshake as the first message
    ws.once("message", (data) => {
      let handshake: HandshakeFrame;
      try {
        const text = data instanceof Buffer ? data.toString("utf8") : String(data);
        const parsed: unknown = JSON.parse(text);
        if (!isHandshakeFrame(parsed)) throw new Error("invalid shape");
        handshake = parsed;
      } catch {
        ws.close(4001, "bad handshake");
        return;
      }

      // Step 2: validate relaySecret
      if (handshake.relaySecret !== config.relaySecret) {
        ws.close(4001, "invalid relaySecret");
        return;
      }

      const { sessionToken } = handshake;

      // Step 3: try to pair
      const partner = waiting.get(sessionToken);
      if (partner && partner.readyState === WebSocket.OPEN) {
        // Cancel the partner's pairing timeout
        const timer = timers.get(sessionToken);
        if (timer !== undefined) {
          clearTimeout(timer);
          timers.delete(sessionToken);
        }
        waiting.delete(sessionToken);

        // Pipe binary frames bidirectionally
        pipeMessages(ws, partner);
        pipeMessages(partner, ws);

        // Propagate close in both directions
        ws.on("close", () => {
          if (partner.readyState === WebSocket.OPEN) partner.close();
        });
        partner.on("close", () => {
          if (ws.readyState === WebSocket.OPEN) ws.close();
        });
      } else {
        // No partner yet — wait
        waiting.set(sessionToken, ws);

        const timer = setTimeout(() => {
          timers.delete(sessionToken);
          waiting.delete(sessionToken);
          if (ws.readyState === WebSocket.OPEN) {
            ws.close(4002, "pairing timeout");
          }
        }, pairingTimeoutMs);
        timers.set(sessionToken, timer);

        // If client disconnects while waiting, clean up
        ws.on("close", () => {
          if (waiting.get(sessionToken) === ws) {
            waiting.delete(sessionToken);
          }
          const t = timers.get(sessionToken);
          if (t !== undefined) {
            clearTimeout(t);
            timers.delete(sessionToken);
          }
        });
      }
    });
  });

  return (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  };
}

function pipeMessages(from: WebSocket, to: WebSocket): void {
  from.on("message", (data, isBinary) => {
    if (to.readyState === WebSocket.OPEN) {
      to.send(data, { binary: isBinary });
    }
  });
}
