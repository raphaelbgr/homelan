import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { FileKeystore } from "./filestore.js";

// All keychain tests use FileKeystore directly (platform-agnostic)
// so they run on CI without native keychain access

describe("FileKeystore", () => {
  let store: FileKeystore;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `homelan-test-${Date.now()}`);
    store = new FileKeystore(testDir);
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("stores and retrieves a value", async () => {
    await store.store("homelan/private-key", "dGVzdC1wcml2YXRlLWtleQ==");
    const result = await store.retrieve("homelan/private-key");
    expect(result).toBe("dGVzdC1wcml2YXRlLWtleQ==");
  });

  it("returns null for nonexistent key (does not throw)", async () => {
    const result = await store.retrieve("nonexistent");
    expect(result).toBeNull();
  });

  it("overwrites an existing key on second store", async () => {
    await store.store("homelan/private-key", "first-value");
    await store.store("homelan/private-key", "second-value");
    const result = await store.retrieve("homelan/private-key");
    expect(result).toBe("second-value");
  });

  it("deletes a key and subsequent retrieve returns null", async () => {
    await store.store("homelan/private-key", "some-value");
    await store.delete("homelan/private-key");
    const result = await store.retrieve("homelan/private-key");
    expect(result).toBeNull();
  });

  it("delete on nonexistent key does not throw", async () => {
    await expect(store.delete("nonexistent")).resolves.not.toThrow();
  });

  it("stores multiple keys independently", async () => {
    await store.store("key-a", "value-a");
    await store.store("key-b", "value-b");
    expect(await store.retrieve("key-a")).toBe("value-a");
    expect(await store.retrieve("key-b")).toBe("value-b");
  });
});
