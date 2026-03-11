import type { PeerStore, StoredPeer } from "./index.js";

export class MemoryStore implements PeerStore {
  private peers: Map<string, StoredPeer> = new Map();

  upsert(peer: StoredPeer): void {
    this.peers.set(peer.publicKey, peer);
  }

  findByPublicKey(publicKey: string, ttlSeconds: number): StoredPeer | null {
    const peer = this.peers.get(publicKey);
    if (!peer) return null;

    const cutoff = Date.now() - ttlSeconds * 1000;
    if (peer.timestampMs < cutoff) {
      this.peers.delete(publicKey);
      return null;
    }

    return peer;
  }

  close(): void {
    this.peers.clear();
  }
}
