import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { MemoryStore } from "../store/memory.js";
import type { RelayConfig } from "../config.js";

const testConfig: RelayConfig = {
  port: 3000,
  relaySecret: "test-secret",
  ttlSeconds: 300,
  storageType: "memory",
  dbPath: ":memory:",
  allowedOrigins: "*",
};

const VALID_KEY = "wg+abcdefghijklmnopqrstuvwxyz0123456789ABCD=";

describe("GET /lookup/:publicKey", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("returns 200 with peer data for registered peer", async () => {
    store.upsert({
      publicKey: VALID_KEY,
      endpoint: "5.6.7.8:51820",
      timestampMs: Date.now(),
    });
    const app = createApp(testConfig, store);
    const res = await request(app)
      .get(`/lookup/${encodeURIComponent(VALID_KEY)}`)
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(200);
    expect(res.body.publicKey).toBe(VALID_KEY);
    expect(res.body.endpoint).toBe("5.6.7.8:51820");
    expect(res.body.timestampMs).toBeTypeOf("number");
  });

  it("returns 404 for unknown public key", async () => {
    const app = createApp(testConfig, store);
    const unknownKey = "unkwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwwA=";
    const res = await request(app)
      .get(`/lookup/${encodeURIComponent(unknownKey)}`)
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });

  it("GET /health returns 200 ok", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .get("/health")
      .set("X-Forwarded-Proto", "https");
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
