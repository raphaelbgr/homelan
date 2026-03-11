import { SqliteStore } from "./sqlite.js";
import { MemoryStore } from "./memory.js";

export interface StoredPeer {
  publicKey: string;
  endpoint: string;
  timestampMs: number;
}

export interface PeerStore {
  upsert(peer: StoredPeer): void;
  findByPublicKey(publicKey: string, ttlSeconds: number): StoredPeer | null;
  close(): void;
}

export function createStore(type: "sqlite" | "memory", dbPath: string): PeerStore {
  if (type === "memory") {
    return new MemoryStore();
  }
  // Lazy import to avoid loading better-sqlite3 in serverless environments
  const Database = require("better-sqlite3");
  const db = new Database(dbPath);
  return new SqliteStore(db);
}

export { SqliteStore, MemoryStore };
