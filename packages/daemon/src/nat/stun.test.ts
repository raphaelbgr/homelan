import { describe, it, expect } from "vitest";
import * as dgram from "node:dgram";
import { resolveExternalEndpoint, StunError } from "./stun.js";

// STUN magic cookie (RFC 5389)
const MAGIC_COOKIE = 0x2112a442;

/**
 * Builds a minimal STUN Binding Response with XOR-MAPPED-ADDRESS for IPv4.
 * RFC 5389 Section 15.2: XOR-MAPPED-ADDRESS
 */
function buildStunBindingResponse(
  transactionId: Buffer,
  ip: string,
  port: number
): Buffer {
  // XOR the port with the top 16 bits of the magic cookie
  const xorPort = port ^ (MAGIC_COOKIE >>> 16);

  // XOR each byte of the IP with the magic cookie bytes
  const ipBytes = ip.split(".").map(Number);
  const cookieBytes = [
    (MAGIC_COOKIE >>> 24) & 0xff,
    (MAGIC_COOKIE >>> 16) & 0xff,
    (MAGIC_COOKIE >>> 8) & 0xff,
    MAGIC_COOKIE & 0xff,
  ];
  const xorIpBytes = ipBytes.map((b, i) => b ^ cookieBytes[i]);

  // XOR-MAPPED-ADDRESS attribute:
  // type (2 bytes) + length (2 bytes) + reserved (1 byte) + family (1 byte) + x-port (2 bytes) + x-addr (4 bytes)
  const attrValue = Buffer.alloc(8);
  attrValue[0] = 0x00; // reserved
  attrValue[1] = 0x01; // family IPv4
  attrValue.writeUInt16BE(xorPort, 2);
  xorIpBytes.forEach((b, i) => {
    attrValue[4 + i] = b;
  });

  // Attribute header: type 0x0020 (XOR-MAPPED-ADDRESS), length 8
  const attrHeader = Buffer.alloc(4);
  attrHeader.writeUInt16BE(0x0020, 0);
  attrHeader.writeUInt16BE(8, 2);

  const attr = Buffer.concat([attrHeader, attrValue]);

  // STUN message header: 20 bytes
  // type (2) + length (2) + magic cookie (4) + transaction ID (12)
  const header = Buffer.alloc(20);
  header.writeUInt16BE(0x0101, 0); // Binding Response
  header.writeUInt16BE(attr.length, 2); // message length (attributes only)
  header.writeUInt32BE(MAGIC_COOKIE, 4); // magic cookie
  transactionId.copy(header, 8); // 12-byte transaction ID

  return Buffer.concat([header, attr]);
}

describe("resolveExternalEndpoint", () => {
  it("returns correct StunResult from a mock STUN server", async () => {
    const expectedIp = "1.2.3.4";
    const expectedPort = 54321;

    await new Promise<void>((resolve, reject) => {
      // Create a mock UDP server
      const server = dgram.createSocket("udp4");

      server.on("message", (msg, rinfo) => {
        // Extract transaction ID from request (bytes 8-19)
        const txId = msg.subarray(8, 20);
        const response = buildStunBindingResponse(txId, expectedIp, expectedPort);
        server.send(response, rinfo.port, rinfo.address, () => {
          server.close();
        });
      });

      server.bind(0, "127.0.0.1", async () => {
        const addr = server.address();
        const port = typeof addr === "string" ? 0 : addr.port;

        try {
          const result = await resolveExternalEndpoint(
            `127.0.0.1:${port}`,
            2000
          );
          expect(result).toEqual({ ip: expectedIp, port: expectedPort, family: "IPv4" });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });

  it("throws StunError on timeout", async () => {
    // Create a UDP server that never responds
    const silentServer = dgram.createSocket("udp4");
    await new Promise<void>((r) => silentServer.bind(0, "127.0.0.1", r));
    const addr = silentServer.address();
    const port = typeof addr === "string" ? 0 : addr.port;

    try {
      await expect(
        resolveExternalEndpoint(`127.0.0.1:${port}`, 300)
      ).rejects.toThrow(StunError);
    } finally {
      silentServer.close();
    }
  });

  it("correctly un-XORs XOR-MAPPED-ADDRESS for IPv4", async () => {
    // Test a different IP to verify XOR math is correct
    const expectedIp = "203.0.113.42";
    const expectedPort = 12345;

    await new Promise<void>((resolve, reject) => {
      const server = dgram.createSocket("udp4");

      server.on("message", (msg, rinfo) => {
        const txId = msg.subarray(8, 20);
        const response = buildStunBindingResponse(txId, expectedIp, expectedPort);
        server.send(response, rinfo.port, rinfo.address, () => {
          server.close();
        });
      });

      server.bind(0, "127.0.0.1", async () => {
        const addr = server.address();
        const port = typeof addr === "string" ? 0 : addr.port;

        try {
          const result = await resolveExternalEndpoint(
            `127.0.0.1:${port}`,
            2000
          );
          expect(result.ip).toBe(expectedIp);
          expect(result.port).toBe(expectedPort);
          expect(result.family).toBe("IPv4");
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });
});
