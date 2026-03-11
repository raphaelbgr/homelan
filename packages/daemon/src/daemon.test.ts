/**
 * Daemon orchestrator tests.
 * Uses FileKeystore as the canonical test double (no real OS keychain).
 * Tests key generation, key retrieval, getStatus() schema, and state delegation.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Daemon } from "./daemon.js";
import { FileKeystore } from "./keychain/filestore.js";
import { StateMachine } from "./state/machine.js";
import os from "node:os";
import path from "node:path";

function makeTmpKeystore(): FileKeystore {
  // Use a unique temp dir per test to avoid cross-test pollution
  // FileKeystore constructor takes a dir, stores keys.json inside it
  const tmpDir = path.join(os.tmpdir(), `homelan-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  return new FileKeystore(tmpDir);
}

describe("Daemon", () => {
  let keystore: FileKeystore;
  let stateMachine: StateMachine;
  let daemon: Daemon;

  beforeEach(() => {
    keystore = makeTmpKeystore();
    stateMachine = new StateMachine();
    daemon = new Daemon(keystore, stateMachine);
  });

  describe("start() — key management", () => {
    it("generates a new keypair when no key is stored", async () => {
      await daemon.start();
      expect(daemon.publicKey).not.toBeNull();
      expect(typeof daemon.publicKey).toBe("string");
      // WireGuard public key is 44 base64 chars
      expect(daemon.publicKey).toMatch(/^[A-Za-z0-9+/]{43}=$/);
    });

    it("stores the private key in keychain on first start", async () => {
      await daemon.start();
      const stored = await keystore.retrieve("homelan/private-key");
      expect(stored).not.toBeNull();
      expect(typeof stored).toBe("string");
      expect(stored!.length).toBe(44);
    });

    it("derives public key from stored private key on subsequent starts", async () => {
      await daemon.start();
      const firstPublicKey = daemon.publicKey;

      // Start a second daemon instance with same keystore
      const daemon2 = new Daemon(keystore, new StateMachine());
      await daemon2.start();

      expect(daemon2.publicKey).toBe(firstPublicKey);
    });

    it("does not overwrite existing private key on restart", async () => {
      await daemon.start();
      const storedAfterFirst = await keystore.retrieve("homelan/private-key");

      const daemon2 = new Daemon(keystore, new StateMachine());
      await daemon2.start();
      const storedAfterSecond = await keystore.retrieve("homelan/private-key");

      expect(storedAfterFirst).toBe(storedAfterSecond);
    });
  });

  describe("getStatus()", () => {
    it("returns all required DaemonStatus fields", async () => {
      await daemon.start();
      const status = daemon.getStatus();

      expect(status).toHaveProperty("state");
      expect(status).toHaveProperty("mode");
      expect(status).toHaveProperty("latencyMs");
      expect(status).toHaveProperty("throughputBytesPerSec");
      expect(status).toHaveProperty("hostInfo");
      expect(status).toHaveProperty("connectedPeers");
      expect(status).toHaveProperty("lanDevices");
      expect(status).toHaveProperty("uptimeMs");
    });

    it("returns state: idle and mode: null initially", async () => {
      await daemon.start();
      const status = daemon.getStatus();
      expect(status.state).toBe("idle");
      expect(status.mode).toBeNull();
    });

    it("returns empty arrays for connectedPeers and lanDevices", async () => {
      await daemon.start();
      const status = daemon.getStatus();
      expect(Array.isArray(status.connectedPeers)).toBe(true);
      expect(status.connectedPeers).toHaveLength(0);
      expect(Array.isArray(status.lanDevices)).toBe(true);
      expect(status.lanDevices).toHaveLength(0);
    });

    it("returns null for nullable fields in Phase 1", async () => {
      await daemon.start();
      const status = daemon.getStatus();
      expect(status.latencyMs).toBeNull();
      expect(status.throughputBytesPerSec).toBeNull();
      expect(status.hostInfo).toBeNull();
    });

    it("uptimeMs increases over time", async () => {
      await daemon.start();
      const first = daemon.getStatus().uptimeMs;
      await new Promise<void>((r) => setTimeout(r, 50));
      const second = daemon.getStatus().uptimeMs;
      expect(second).toBeGreaterThan(first);
    });
  });

  describe("state delegation", () => {
    it("state returns idle initially", async () => {
      await daemon.start();
      expect(daemon.state).toBe("idle");
    });

    it("onStateChange listener is notified when state machine transitions", async () => {
      await daemon.start();
      const events: Array<{ next: string; prev: string }> = [];
      daemon.onStateChange((next, prev) => {
        events.push({ next, prev });
      });
      stateMachine.transition("connecting");
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({ next: "connecting", prev: "idle" });
    });

    it("onStateChange unsubscribe stops further notifications", async () => {
      await daemon.start();
      const events: string[] = [];
      const unsubscribe = daemon.onStateChange((next) => events.push(next));
      stateMachine.transition("connecting");
      unsubscribe();
      stateMachine.transition("connected");
      expect(events).toHaveLength(1);
      expect(events[0]).toBe("connecting");
    });
  });

  describe("getLanDevices()", () => {
    it("returns empty array in Phase 1", async () => {
      await daemon.start();
      expect(daemon.getLanDevices()).toEqual([]);
    });
  });
});
