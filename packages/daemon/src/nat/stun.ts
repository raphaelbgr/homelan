import * as dgram from "node:dgram";
import * as crypto from "node:crypto";
import type { StunResult } from "@homelan/shared";

export type { StunResult };

// RFC 5389 STUN magic cookie
const MAGIC_COOKIE = 0x2112a442;
const BINDING_REQUEST = 0x0001;
const BINDING_RESPONSE = 0x0101;
const XOR_MAPPED_ADDRESS = 0x0020;
const MAPPED_ADDRESS = 0x0001;
const IPV4_FAMILY = 0x01;
const DEFAULT_TIMEOUT_MS = 3000;

export class StunError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StunError";
  }
}

/**
 * Sends a STUN Binding Request (RFC 5389) over UDP and resolves the external
 * IP:port from the XOR-MAPPED-ADDRESS attribute in the response.
 *
 * @param stunServer - "host:port" format, e.g. "stun.l.google.com:19302"
 * @param timeoutMs - timeout in milliseconds (default 3000)
 */
export async function resolveExternalEndpoint(
  stunServer: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<StunResult> {
  const colonIdx = stunServer.lastIndexOf(":");
  if (colonIdx === -1) {
    throw new StunError(`Invalid STUN server format: ${stunServer}`);
  }
  const host = stunServer.slice(0, colonIdx);
  const port = parseInt(stunServer.slice(colonIdx + 1), 10);
  if (isNaN(port) || port <= 0 || port > 65535) {
    throw new StunError(`Invalid STUN server port: ${stunServer}`);
  }

  return new Promise<StunResult>((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function cleanup() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      try {
        socket.close();
      } catch {
        // already closed
      }
    }

    function fail(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }

    function succeed(result: StunResult) {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    }

    // Build 20-byte STUN Binding Request header
    // Type (2) + Length (2) + Magic Cookie (4) + Transaction ID (12)
    const request = Buffer.alloc(20);
    request.writeUInt16BE(BINDING_REQUEST, 0); // message type
    request.writeUInt16BE(0, 2); // message length (no attributes)
    request.writeUInt32BE(MAGIC_COOKIE, 4); // magic cookie
    const txId = crypto.randomBytes(12);
    txId.copy(request, 8);

    socket.on("error", (err) => {
      fail(new StunError(`UDP socket error: ${err.message}`));
    });

    socket.on("message", (msg) => {
      try {
        const result = parseStunResponse(msg);
        if (result) {
          succeed(result);
        }
      } catch (err) {
        // Malformed response — ignore, wait for timeout or retry
      }
    });

    timer = setTimeout(() => {
      fail(new StunError("STUN request timed out"));
    }, timeoutMs);

    socket.send(request, port, host, (err) => {
      if (err) {
        fail(new StunError(`Failed to send STUN request: ${err.message}`));
      }
    });
  });
}

/**
 * Parses a STUN Binding Response and extracts the external endpoint.
 * Returns null if the message is not a valid Binding Response.
 */
function parseStunResponse(msg: Buffer): StunResult | null {
  if (msg.length < 20) return null;

  const msgType = msg.readUInt16BE(0);
  if (msgType !== BINDING_RESPONSE) return null;

  const msgLength = msg.readUInt16BE(2);
  const magicCookie = msg.readUInt32BE(4);
  if (magicCookie !== MAGIC_COOKIE) return null;

  // Parse TLV attributes starting at offset 20
  let offset = 20;
  const end = 20 + msgLength;

  while (offset + 4 <= end && offset + 4 <= msg.length) {
    const attrType = msg.readUInt16BE(offset);
    const attrLength = msg.readUInt16BE(offset + 2);
    offset += 4;

    if (offset + attrLength > msg.length) break;

    if (attrType === XOR_MAPPED_ADDRESS && attrLength >= 8) {
      // RFC 5389 Section 15.2:
      // byte 0: reserved, byte 1: family, bytes 2-3: x-port, bytes 4-7: x-addr
      const family = msg[offset + 1];
      if (family !== IPV4_FAMILY) {
        // Only support IPv4 for now
        offset += attrLength;
        // Pad to 4-byte boundary
        offset += (4 - (attrLength % 4)) % 4;
        continue;
      }

      const xPort = msg.readUInt16BE(offset + 2);
      const port = xPort ^ (MAGIC_COOKIE >>> 16);

      const cookieBytes: [number, number, number, number] = [
        (MAGIC_COOKIE >>> 24) & 0xff,
        (MAGIC_COOKIE >>> 16) & 0xff,
        (MAGIC_COOKIE >>> 8) & 0xff,
        MAGIC_COOKIE & 0xff,
      ];
      const ipBytes = [
        (msg[offset + 4] ?? 0) ^ cookieBytes[0],
        (msg[offset + 5] ?? 0) ^ cookieBytes[1],
        (msg[offset + 6] ?? 0) ^ cookieBytes[2],
        (msg[offset + 7] ?? 0) ^ cookieBytes[3],
      ];
      const ip = ipBytes.join(".");

      return { ip, port, family: "IPv4" };
    }

    if (attrType === MAPPED_ADDRESS && attrLength >= 8) {
      // Fallback: plain MAPPED-ADDRESS (some older STUN servers)
      const family = msg[offset + 1];
      if (family === IPV4_FAMILY) {
        const port = msg.readUInt16BE(offset + 2);
        const ip = [
          msg[offset + 4],
          msg[offset + 5],
          msg[offset + 6],
          msg[offset + 7],
        ].join(".");
        return { ip, port, family: "IPv4" };
      }
    }

    // Move to next attribute (padded to 4-byte boundary)
    offset += attrLength;
    offset += (4 - (attrLength % 4)) % 4;
  }

  return null;
}
