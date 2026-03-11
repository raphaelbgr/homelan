import { describe, it, expect, afterEach } from "vitest";
import type { PeerStore, StoredPeer } from "./index.js";

// Shared test factory to run same tests against both backends
function runStoreTests(name: string, getStore: () => PeerStore) {
  describe(`${name}`, () => {
    let store: PeerStore;

    afterEach(() => {
      store.close();
    });

    it("upserts and retrieves a peer by public key", () => {
      store = getStore();
      const peer: StoredPeer = {
        publicKey: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        endpoint: "1.2.3.4:51820",
        timestampMs: Date.now(),
      };
      store.upsert(peer);
      const found = store.findByPublicKey(peer.publicKey, 300);
      expect(found).not.toBeNull();
      expect(found?.publicKey).toBe(peer.publicKey);
      expect(found?.endpoint).toBe(peer.endpoint);
    });

    it("returns null for unknown public keys", () => {
      store = getStore();
      const found = store.findByPublicKey("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", 300);
      expect(found).toBeNull();
    });

    it("returns null for expired entries (beyond TTL)", () => {
      store = getStore();
      const peer: StoredPeer = {
        publicKey: "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC=",
        endpoint: "5.6.7.8:51820",
        timestampMs: Date.now() - 600_000, // 10 minutes ago
      };
      store.upsert(peer);
      const found = store.findByPublicKey(peer.publicKey, 300); // 5 min TTL
      expect(found).toBeNull();
    });

    it("upsert overwrites existing entry", () => {
      store = getStore();
      const publicKey = "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD=";
      store.upsert({ publicKey, endpoint: "1.1.1.1:51820", timestampMs: Date.now() });
      store.upsert({ publicKey, endpoint: "2.2.2.2:51820", timestampMs: Date.now() });
      const found = store.findByPublicKey(publicKey, 300);
      expect(found?.endpoint).toBe("2.2.2.2:51820");
    });
  });
}

// Import stores dynamically to run tests
import { MemoryStore } from "./memory.js";
import Database from "better-sqlite3";
import { SqliteStore } from "./sqlite.js";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";

runStoreTests("MemoryStore", () => new MemoryStore());

runStoreTests("SqliteStore", () => {
  const dbPath = join(tmpdir(), `test-relay-${Date.now()}.db`);
  const db = new Database(dbPath);
  const store = new SqliteStore(db);
  const originalClose = store.close.bind(store);
  store.close = () => {
    originalClose();
    if (existsSync(dbPath)) unlinkSync(dbPath);
  };
  return store;
});
