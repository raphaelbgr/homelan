import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("loadConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("throws with clear message when RELAY_SECRET is missing", async () => {
    delete process.env["RELAY_SECRET"];
    const { loadConfig } = await import("./config.js");
    expect(() => loadConfig()).toThrow(/Missing required/);
  });

  it("returns valid config when all required vars are present", async () => {
    process.env["RELAY_SECRET"] = "test-secret";
    process.env["PORT"] = "4000";
    process.env["RELAY_TTL_SECONDS"] = "600";
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.relaySecret).toBe("test-secret");
    expect(config.port).toBe(4000);
    expect(config.ttlSeconds).toBe(600);
  });

  it("uses defaults when optional vars are not set", async () => {
    process.env["RELAY_SECRET"] = "test-secret";
    delete process.env["PORT"];
    delete process.env["RELAY_TTL_SECONDS"];
    delete process.env["RELAY_STORAGE"];
    delete process.env["RELAY_DB_PATH"];
    const { loadConfig } = await import("./config.js");
    const config = loadConfig();
    expect(config.port).toBe(3000);
    expect(config.ttlSeconds).toBe(300);
    expect(config.storageType).toBe("sqlite");
  });
});
