/**
 * holePunch.ts tests — UDP hole punching.
 * Uses in-process dgram sockets to avoid real network I/O.
 */
import { describe, it, expect } from "vitest";
import * as dgram from "node:dgram";
import { attemptHolePunch } from "./holePunch.js";

/**
 * Binds a UDP socket on an OS-assigned port and returns the port + a close function.
 */
function bindEphemeralSocket(): Promise<{ port: number; socket: dgram.Socket }> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket("udp4");
    socket.bind(0, "127.0.0.1", () => {
      const port = (socket.address() as { port: number }).port;
      resolve({ port, socket });
    });
    socket.on("error", reject);
  });
}

describe("attemptHolePunch", () => {
  it("returns success: true when remote echoes back a UDP packet", async () => {
    // Set up echo server — echoes every UDP packet back to sender
    const { port: echoPort, socket: echoSocket } = await bindEphemeralSocket();
    echoSocket.on("message", (msg, rinfo) => {
      echoSocket.send(msg, rinfo.port, rinfo.address);
    });

    // Set up local socket to use as the "local port" for hole punching
    const { port: localPort, socket: localSocket } = await bindEphemeralSocket();
    // Close local socket so holePunch can bind the same port
    await new Promise<void>((resolve) => localSocket.close(() => resolve()));

    try {
      const result = await attemptHolePunch(
        localPort,
        `127.0.0.1:${echoPort}`,
        3000
      );
      expect(result.success).toBe(true);
      expect(result.confirmedEndpoint).toBe(`127.0.0.1:${echoPort}`);
    } finally {
      echoSocket.close();
    }
  }, 5000);

  it("returns success: false when no remote socket is listening (timeout)", async () => {
    // Choose a port that is very unlikely to be in use
    const unusedPort = 19876;

    // Get an ephemeral local port
    const { port: localPort, socket: localSocket } = await bindEphemeralSocket();
    await new Promise<void>((resolve) => localSocket.close(() => resolve()));

    const result = await attemptHolePunch(
      localPort,
      `127.0.0.1:${unusedPort}`,
      200 // short timeout for test speed
    );
    expect(result.success).toBe(false);
    expect(result.confirmedEndpoint).toBeNull();
  }, 2000);
});
