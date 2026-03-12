import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { MemoryStore } from "../store/memory.js";
import type { RelayConfig } from "../config.js";
import type { InviteStore } from "./invite.js";

const testConfig: RelayConfig = {
  port: 3000,
  relaySecret: "test-secret",
  ttlSeconds: 300,
  storageType: "memory",
  dbPath: ":memory:",
  allowedOrigins: "*",
  serverPublicKey: "wg+abcdefghijklmnopqrstuvwxyz0123456789ABCD=",
  relayUrl: "https://relay.example.com",
};

// Valid WireGuard public key (base64, 44 chars)
const VALID_CLIENT_KEY = "cl+abcdefghijklmnopqrstuvwxyz0123456789ABCD=";

describe("POST /pair", () => {
  let store: MemoryStore;
  let inviteStore: InviteStore;

  beforeEach(() => {
    store = new MemoryStore();
    inviteStore = new Map();
  });

  it("returns 200 with serverPublicKey and relayUrl for valid token", async () => {
    // Pre-seed a valid invite token
    const token = "a".repeat(64);
    inviteStore.set(token, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      serverPublicKey: testConfig.serverPublicKey,
    });

    const app = createApp(testConfig, store, inviteStore);
    const res = await request(app)
      .post("/pair")
      .set("X-Forwarded-Proto", "https")
      .send({ token, clientPublicKey: VALID_CLIENT_KEY });

    expect(res.status).toBe(200);
    expect(res.body.serverPublicKey).toBe(testConfig.serverPublicKey);
    expect(res.body.relayUrl).toBe(testConfig.relayUrl);
  });

  it("deletes token after use (single-use enforcement)", async () => {
    const token = "b".repeat(64);
    inviteStore.set(token, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      serverPublicKey: testConfig.serverPublicKey,
    });

    const app = createApp(testConfig, store, inviteStore);

    // First use should succeed
    await request(app)
      .post("/pair")
      .set("X-Forwarded-Proto", "https")
      .send({ token, clientPublicKey: VALID_CLIENT_KEY });

    // Second use should fail
    const res2 = await request(app)
      .post("/pair")
      .set("X-Forwarded-Proto", "https")
      .send({ token, clientPublicKey: VALID_CLIENT_KEY });

    expect(res2.status).toBe(401);
    expect(res2.body.code).toBe("INVALID_TOKEN");
  });

  it("returns 401 for non-existent token", async () => {
    const app = createApp(testConfig, store, inviteStore);
    const res = await request(app)
      .post("/pair")
      .set("X-Forwarded-Proto", "https")
      .send({ token: "c".repeat(64), clientPublicKey: VALID_CLIENT_KEY });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("returns 401 for expired token", async () => {
    const token = "d".repeat(64);
    inviteStore.set(token, {
      expiresAt: Date.now() - 1000, // expired 1 second ago
      serverPublicKey: testConfig.serverPublicKey,
    });

    const app = createApp(testConfig, store, inviteStore);
    const res = await request(app)
      .post("/pair")
      .set("X-Forwarded-Proto", "https")
      .send({ token, clientPublicKey: VALID_CLIENT_KEY });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });

  it("returns 400 for invalid clientPublicKey format", async () => {
    const token = "e".repeat(64);
    inviteStore.set(token, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      serverPublicKey: testConfig.serverPublicKey,
    });

    const app = createApp(testConfig, store, inviteStore);
    const res = await request(app)
      .post("/pair")
      .set("X-Forwarded-Proto", "https")
      .send({ token, clientPublicKey: "tooshort" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });

  it("stores client public key in peer store after pairing", async () => {
    const token = "f".repeat(64);
    inviteStore.set(token, {
      expiresAt: Date.now() + 15 * 60 * 1000,
      serverPublicKey: testConfig.serverPublicKey,
    });

    const app = createApp(testConfig, store, inviteStore);
    await request(app)
      .post("/pair")
      .set("X-Forwarded-Proto", "https")
      .send({ token, clientPublicKey: VALID_CLIENT_KEY });

    // Client key should now be in the peer store
    const peer = store.findByPublicKey(VALID_CLIENT_KEY, 3600);
    expect(peer).not.toBeNull();
    expect(peer?.publicKey).toBe(VALID_CLIENT_KEY);
  });
});
