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

// Valid WireGuard public key (base64, 44 chars)
const VALID_KEY = "wg+abcdefghijklmnopqrstuvwxyz0123456789ABCD=";

describe("POST /register", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("returns 200 with ok and ttlSeconds for valid request", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/register")
      .set("X-Forwarded-Proto", "https")
      .send({
        publicKey: VALID_KEY,
        endpoint: "1.2.3.4:51820",
        timestampMs: Date.now(),
      });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.ttlSeconds).toBe(300);
  });

  it("returns 400 when publicKey is missing", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/register")
      .set("X-Forwarded-Proto", "https")
      .send({ endpoint: "1.2.3.4:51820", timestampMs: Date.now() });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 when publicKey is not 44-char base64", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/register")
      .set("X-Forwarded-Proto", "https")
      .send({
        publicKey: "tooshort",
        endpoint: "1.2.3.4:51820",
        timestampMs: Date.now(),
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_REQUEST");
  });

  it("returns 400 for plain HTTP requests (httpsOnly middleware)", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/register")
      .set("X-Forwarded-Proto", "http")
      .send({
        publicKey: VALID_KEY,
        endpoint: "1.2.3.4:51820",
        timestampMs: Date.now(),
      });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("HTTPS_REQUIRED");
  });
});
