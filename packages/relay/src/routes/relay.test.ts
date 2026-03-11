import { describe, it, expect, beforeEach, afterEach } from "vitest";
import http from "node:http";
import WebSocket from "ws";
import { createRelayHandler } from "./relay.js";
import type { RelayConfig } from "../config.js";

const testConfig: RelayConfig = {
  port: 3000,
  relaySecret: "test-secret",
  ttlSeconds: 300,
  storageType: "memory",
  dbPath: ":memory:",
  allowedOrigins: "*",
};

/**
 * Opens a plain http.Server with the relay upgrade handler mounted,
 * then connects a WebSocket client to it.
 */
function createTestServer(config: RelayConfig): {
  server: http.Server;
  wsUrl: () => string;
} {
  const server = http.createServer();
  const relayHandler = createRelayHandler(config);
  server.on("upgrade", (req, socket, head) => {
    if (req.url === "/relay") {
      relayHandler(req, socket, head);
    } else {
      socket.destroy();
    }
  });
  return {
    server,
    wsUrl: () => {
      const addr = server.address() as { port: number };
      return `ws://127.0.0.1:${addr.port}/relay`;
    },
  };
}

function connectPeer(
  url: string,
  handshake: Record<string, string>,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.once("open", () => {
      ws.send(JSON.stringify(handshake));
      resolve(ws);
    });
    ws.once("error", reject);
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number }> {
  return new Promise((resolve) => {
    ws.on("close", (code) => resolve({ code }));
  });
}

function waitForMessage(ws: WebSocket): Promise<Buffer> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(data as Buffer));
  });
}

describe("WebSocket relay endpoint", () => {
  let server: http.Server;
  let wsUrl: () => string;

  beforeEach(() => {
    const setup = createTestServer(testConfig);
    server = setup.server;
    wsUrl = setup.wsUrl;
    return new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });

  afterEach(() => {
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("Test 1: closes connection with code 4001 when relaySecret is invalid", async () => {
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const client = new WebSocket(wsUrl());
      client.once("open", () => {
        client.send(
          JSON.stringify({
            publicKey: "peerA",
            relaySecret: "wrong-secret",
            sessionToken: "session-abc",
          }),
        );
        resolve(client);
      });
      client.once("error", reject);
    });

    const { code } = await waitForClose(ws);
    expect(code).toBe(4001);
  });

  it("Test 2: two peers with same sessionToken exchange binary messages", async () => {
    const handshakeA = {
      publicKey: "peerA",
      relaySecret: "test-secret",
      sessionToken: "session-xyz",
    };
    const handshakeB = {
      publicKey: "peerB",
      relaySecret: "test-secret",
      sessionToken: "session-xyz",
    };

    const wsA = await connectPeer(wsUrl(), handshakeA);
    const wsB = await connectPeer(wsUrl(), handshakeB);

    // Give relay time to pair them
    await new Promise((r) => setTimeout(r, 50));

    const msgReceived = waitForMessage(wsB);
    const payload = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    wsA.send(payload);

    const received = await msgReceived;
    expect(Buffer.isBuffer(received) || received instanceof Uint8Array).toBe(
      true,
    );
    expect(Buffer.from(received)).toEqual(payload);

    wsA.close();
    wsB.close();
  });

  it("Test 3: peer A disconnect closes peer B connection", async () => {
    const handshakeA = {
      publicKey: "peerA",
      relaySecret: "test-secret",
      sessionToken: "session-close",
    };
    const handshakeB = {
      publicKey: "peerB",
      relaySecret: "test-secret",
      sessionToken: "session-close",
    };

    const wsA = await connectPeer(wsUrl(), handshakeA);
    const wsB = await connectPeer(wsUrl(), handshakeB);

    // Give relay time to pair
    await new Promise((r) => setTimeout(r, 50));

    const bClose = waitForClose(wsB);
    wsA.close();

    const { code } = await bClose;
    // Relay closes partner: any non-zero code or normal close is acceptable
    expect([1000, 1001, 1005, 1006]).toContain(code);
  });

  it("Test 4: single peer with no partner is closed after 10 seconds", async () => {
    // We override config with a very short timeout for testing purposes.
    // We test by using a sentinel sessionToken and checking the server closes the socket.
    // To keep the test fast, we use a custom config with 100ms timeout.
    const fastTimeoutServer = http.createServer();
    const fastHandler = createRelayHandler(testConfig, { pairingTimeoutMs: 200 });
    fastTimeoutServer.on("upgrade", (req, socket, head) => {
      fastHandler(req, socket, head);
    });

    await new Promise<void>((resolve) =>
      fastTimeoutServer.listen(0, "127.0.0.1", resolve),
    );
    const addr = fastTimeoutServer.address() as { port: number };
    const fastUrl = `ws://127.0.0.1:${addr.port}/relay`;

    const ws = await connectPeer(fastUrl, {
      publicKey: "lonelyPeer",
      relaySecret: "test-secret",
      sessionToken: "session-alone",
    });

    const start = Date.now();
    const { code } = await waitForClose(ws);
    const elapsed = Date.now() - start;

    // Should close within ~500ms (200ms timeout + tolerance)
    expect(elapsed).toBeLessThan(1000);
    expect(code).toBeDefined();

    await new Promise<void>((resolve) =>
      fastTimeoutServer.close(() => resolve()),
    );
  });
});
