import type { Database } from "better-sqlite3";
import type { PeerStore, StoredPeer } from "./index.js";

export class SqliteStore implements PeerStore {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
    // Initialize schema
    const init = `
      CREATE TABLE IF NOT EXISTS peers (
        public_key TEXT PRIMARY KEY,
        endpoint TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL
      )
    `;
    this.db.prepare(init.trim()).run();
  }

  upsert(peer: StoredPeer): void {
    this.db
      .prepare(
        `INSERT INTO peers (public_key, endpoint, timestamp_ms)
         VALUES (?, ?, ?)
         ON CONFLICT(public_key) DO UPDATE SET
           endpoint = excluded.endpoint,
           timestamp_ms = excluded.timestamp_ms`
      )
      .run(peer.publicKey, peer.endpoint, peer.timestampMs);
  }

  findByPublicKey(publicKey: string, ttlSeconds: number): StoredPeer | null {
    const cutoff = Date.now() - ttlSeconds * 1000;
    const row = this.db
      .prepare(
        `SELECT public_key, endpoint, timestamp_ms
         FROM peers
         WHERE public_key = ? AND timestamp_ms > ?`
      )
      .get(publicKey, cutoff) as { public_key: string; endpoint: string; timestamp_ms: number } | undefined;

    if (!row) return null;

    return {
      publicKey: row.public_key,
      endpoint: row.endpoint,
      timestampMs: row.timestamp_ms,
    };
  }

  close(): void {
    this.db.close();
  }
}
