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
  serverPublicKey: "wg+abcdefghijklmnopqrstuvwxyz0123456789ABCD=",
  relayUrl: "https://relay.example.com",
};

describe("POST /invite", () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore();
  });

  it("returns 200 with inviteUrl, token, expiresAt for valid auth", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/invite")
      .set("X-Forwarded-Proto", "https")
      .set("Authorization", "Bearer test-secret")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.inviteUrl).toMatch(/^homelan:\/\/pair\?token=/);
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("returns 401 when Authorization header is missing", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/invite")
      .set("X-Forwarded-Proto", "https")
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("returns 401 when Authorization Bearer token is wrong", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/invite")
      .set("X-Forwarded-Proto", "https")
      .set("Authorization", "Bearer wrong-secret")
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("UNAUTHORIZED");
  });

  it("generates a 64-character hex token (32 bytes)", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/invite")
      .set("X-Forwarded-Proto", "https")
      .set("Authorization", "Bearer test-secret")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("expiresAt is approximately 15 minutes from now", async () => {
    const before = Date.now();
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/invite")
      .set("X-Forwarded-Proto", "https")
      .set("Authorization", "Bearer test-secret")
      .send({});
    const after = Date.now();

    const expectedExpiry = before + 15 * 60 * 1000;
    expect(res.body.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 1000);
    expect(res.body.expiresAt).toBeLessThanOrEqual(after + 15 * 60 * 1000 + 1000);
  });

  it("inviteUrl includes relay query param", async () => {
    const app = createApp(testConfig, store);
    const res = await request(app)
      .post("/invite")
      .set("X-Forwarded-Proto", "https")
      .set("Authorization", "Bearer test-secret")
      .send({});

    expect(res.body.inviteUrl).toContain("relay=");
  });
});
