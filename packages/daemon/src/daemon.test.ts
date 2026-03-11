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

// ---------------------------------------------------------------------------
// switchMode() tests
// ---------------------------------------------------------------------------

import type { WgInterfaceConfig } from "./wireguard/interface.js";
import type { TunnelMode } from "@homelan/shared";

function makeConnectedDaemon() {
  const keystore = makeTmpKeystore();
  const stateMachine = new StateMachine();

  // Track configure() calls
  const configureCalls: WgInterfaceConfig[] = [];
  const upCalls: number[] = [];

  const mockWgInterface = {
    configure: (cfg: WgInterfaceConfig) => { configureCalls.push(cfg); },
    up: async () => { upCalls.push(1); },
    down: async () => {},
  };

  const dnsSetCalls: Array<{ iface: string; dns: string }> = [];
  const dnsRestoreCalls: string[] = [];

  const mockDns = {
    setDns: async (iface: string, dns: string) => { dnsSetCalls.push({ iface, dns }); },
    restoreDns: async (iface: string) => { dnsRestoreCalls.push(iface); },
  };

  const mockIpv6 = {
    blockIPv6: async () => {},
    restoreIPv6: async () => {},
  };

  const daemon = new Daemon(
    keystore,
    stateMachine,
    undefined, // stunResolver - not used in switchMode
    undefined, // relayClientFactory - not used in switchMode
    undefined, // holePunchFn - not used in switchMode
    mockWgInterface as unknown as import("./wireguard/interface.js").WireGuardInterface,
    mockDns as unknown as import("./platform/dns.js").DnsConfigurator,
    mockIpv6 as unknown as import("./platform/ipv6.js").IPv6Blocker,
  );

  // Manually set daemon to "connected" state with a known wgConfig
  // by forcing the state machine
  stateMachine.transition("connecting");
  stateMachine.transition("connected");

  return { daemon, stateMachine, configureCalls, upCalls, dnsSetCalls, dnsRestoreCalls };
}

describe("Daemon.switchMode()", () => {
  it("throws 'Not connected' when state is not connected", async () => {
    const keystore = makeTmpKeystore();
    const stateMachine = new StateMachine();
    const daemon = new Daemon(keystore, stateMachine);
    await expect(daemon.switchMode("full-gateway")).rejects.toThrow("Not connected");
  });

  it("is a no-op when mode is already the requested mode", async () => {
    const { daemon, configureCalls } = makeConnectedDaemon();
    // Set internal mode by injecting via a private field test helper —
    // we manually call setModeForTest to simulate post-connect state
    (daemon as unknown as { _mode: TunnelMode })._mode = "lan-only";
    (daemon as unknown as { _wgConfig: WgInterfaceConfig | null })._wgConfig = {
      privateKey: "test-key",
      address: "10.0.0.2/24",
      listenPort: 51820,
      peers: [{ publicKey: "peer-key", endpoint: "1.2.3.4:51820", allowedIps: ["10.0.0.0/24", "192.168.7.0/24"] }],
    };
    await daemon.switchMode("lan-only"); // same mode
    expect(configureCalls).toHaveLength(0); // no reconfiguration
  });

  it("switches from lan-only to full-gateway: reconfigures AllowedIPs and calls setDns", async () => {
    const { daemon, configureCalls, upCalls, dnsSetCalls } = makeConnectedDaemon();
    (daemon as unknown as { _mode: TunnelMode })._mode = "lan-only";
    (daemon as unknown as { _wgConfig: WgInterfaceConfig | null })._wgConfig = {
      privateKey: "test-key",
      address: "10.0.0.2/24",
      listenPort: 51820,
      peers: [{ publicKey: "peer-key", endpoint: "1.2.3.4:51820", allowedIps: ["10.0.0.0/24", "192.168.7.0/24"] }],
    };

    await daemon.switchMode("full-gateway");

    expect(configureCalls).toHaveLength(1);
    expect(configureCalls[0]!.peers[0]!.allowedIps).toEqual(["0.0.0.0/0", "::/0"]);
    expect(upCalls).toHaveLength(1);
    expect(dnsSetCalls).toHaveLength(1);
    expect(dnsSetCalls[0]).toEqual({ iface: "homelan", dns: "192.168.7.1" });
    expect((daemon as unknown as { _mode: TunnelMode })._mode).toBe("full-gateway");
  });

  it("switches from full-gateway to lan-only: reconfigures AllowedIPs and calls restoreDns", async () => {
    const { daemon, configureCalls, upCalls, dnsRestoreCalls } = makeConnectedDaemon();
    (daemon as unknown as { _mode: TunnelMode })._mode = "full-gateway";
    (daemon as unknown as { _wgConfig: WgInterfaceConfig | null })._wgConfig = {
      privateKey: "test-key",
      address: "10.0.0.2/24",
      listenPort: 51820,
      peers: [{ publicKey: "peer-key", endpoint: "1.2.3.4:51820", allowedIps: ["0.0.0.0/0", "::/0"] }],
    };

    await daemon.switchMode("lan-only");

    expect(configureCalls).toHaveLength(1);
    expect(configureCalls[0]!.peers[0]!.allowedIps).toEqual(["10.0.0.0/24", "192.168.7.0/24"]);
    expect(upCalls).toHaveLength(1);
    expect(dnsRestoreCalls).toHaveLength(1);
    expect(dnsRestoreCalls[0]).toBe("homelan");
    expect((daemon as unknown as { _mode: TunnelMode })._mode).toBe("lan-only");
  });

  it("emits mode_changed event via onModeChange listener", async () => {
    const { daemon } = makeConnectedDaemon();
    (daemon as unknown as { _mode: TunnelMode })._mode = "lan-only";
    (daemon as unknown as { _wgConfig: WgInterfaceConfig | null })._wgConfig = {
      privateKey: "test-key",
      address: "10.0.0.2/24",
      listenPort: 51820,
      peers: [{ publicKey: "peer-key", endpoint: "1.2.3.4:51820", allowedIps: ["10.0.0.0/24", "192.168.7.0/24"] }],
    };

    const modeEvents: TunnelMode[] = [];
    daemon.onModeChange((mode) => modeEvents.push(mode));

    await daemon.switchMode("full-gateway");

    expect(modeEvents).toHaveLength(1);
    expect(modeEvents[0]).toBe("full-gateway");
  });

  it("onModeChange returns an unsubscribe function", async () => {
    const { daemon } = makeConnectedDaemon();
    (daemon as unknown as { _mode: TunnelMode })._mode = "lan-only";
    (daemon as unknown as { _wgConfig: WgInterfaceConfig | null })._wgConfig = {
      privateKey: "test-key",
      address: "10.0.0.2/24",
      listenPort: 51820,
      peers: [{ publicKey: "peer-key", endpoint: "1.2.3.4:51820", allowedIps: ["10.0.0.0/24", "192.168.7.0/24"] }],
    };

    const modeEvents: TunnelMode[] = [];
    const unsub = daemon.onModeChange((mode) => modeEvents.push(mode));
    unsub();

    await daemon.switchMode("full-gateway");
    expect(modeEvents).toHaveLength(0);
  });

  it("updates _mode after switchMode completes", async () => {
    const { daemon } = makeConnectedDaemon();
    (daemon as unknown as { _mode: TunnelMode })._mode = "lan-only";
    (daemon as unknown as { _wgConfig: WgInterfaceConfig | null })._wgConfig = {
      privateKey: "test-key",
      address: "10.0.0.2/24",
      listenPort: 51820,
      peers: [{ publicKey: "peer-key", endpoint: "1.2.3.4:51820", allowedIps: ["10.0.0.0/24", "192.168.7.0/24"] }],
    };

    await daemon.switchMode("full-gateway");
    expect(daemon.getStatus().mode).toBe("full-gateway");
  });
});

// ---------------------------------------------------------------------------
// Device discovery tests
// ---------------------------------------------------------------------------

import type { LanDevice } from "@homelan/shared";

const FIXTURE_DEVICES: LanDevice[] = [
  { ip: "192.168.7.102", hostname: "mac-mini.local", deviceType: "Mac Mini" },
  { ip: "192.168.7.152", hostname: "Amazon-FireTV-123.local", deviceType: "Fire TV" },
];

describe("Daemon device discovery", () => {
  it("getLanDevices() returns empty array initially", () => {
    const keystore = makeTmpKeystore();
    const stateMachine = new StateMachine();
    const daemon = new Daemon(keystore, stateMachine);
    expect(daemon.getLanDevices()).toEqual([]);
  });

  it("startDeviceDiscovery() with mock scanner populates getLanDevices()", async () => {
    const keystore = makeTmpKeystore();
    const stateMachine = new StateMachine();

    let resolveFirstScan: () => void;
    const firstScanDone = new Promise<void>((res) => { resolveFirstScan = res; });

    const mockScanner = async () => {
      const devices = [...FIXTURE_DEVICES];
      resolveFirstScan!();
      return devices;
    };

    const daemon = new Daemon(
      keystore,
      stateMachine,
      undefined, undefined, undefined, undefined, undefined, undefined,
      mockScanner,
      100_000 // long interval — won't fire again in test
    );

    daemon.startDeviceDiscovery();
    await firstScanDone;

    expect(daemon.getLanDevices()).toEqual(FIXTURE_DEVICES);
  });

  it("stopDeviceDiscovery() clears device list and stops timer", async () => {
    const keystore = makeTmpKeystore();
    const stateMachine = new StateMachine();

    let resolveFirstScan: () => void;
    const firstScanDone = new Promise<void>((res) => { resolveFirstScan = res; });

    const mockScanner = async () => {
      resolveFirstScan!();
      return [...FIXTURE_DEVICES];
    };

    const daemon = new Daemon(
      keystore,
      stateMachine,
      undefined, undefined, undefined, undefined, undefined, undefined,
      mockScanner,
      100_000
    );

    daemon.startDeviceDiscovery();
    await firstScanDone;

    expect(daemon.getLanDevices()).toHaveLength(2);

    daemon.stopDeviceDiscovery();
    expect(daemon.getLanDevices()).toEqual([]);
  });

  it("device listener fires when device list changes between scans", async () => {
    const keystore = makeTmpKeystore();
    const stateMachine = new StateMachine();
    const events: LanDevice[][] = [];

    const mockScanner = async () => [...FIXTURE_DEVICES];

    const daemon = new Daemon(
      keystore,
      stateMachine,
      undefined, undefined, undefined, undefined, undefined, undefined,
      mockScanner,
      0 // interval 0 — runs immediately but then only on setInterval
    );

    daemon.onDevicesUpdate((devices) => events.push(devices));

    // Start discovery — initial scan fires immediately (async)
    daemon.startDeviceDiscovery();

    // Wait for the async scan to complete
    await new Promise<void>((res) => setTimeout(res, 50));

    expect(events).toHaveLength(1);
    expect(events[0]).toEqual(FIXTURE_DEVICES);

    daemon.stopDeviceDiscovery();
  });

  it("device listener does NOT fire when list is unchanged between scans", async () => {
    const keystore = makeTmpKeystore();
    const stateMachine = new StateMachine();
    const events: LanDevice[][] = [];
    let callCount = 0;

    const mockScanner = async () => {
      callCount++;
      return [...FIXTURE_DEVICES]; // always same result
    };

    const daemon = new Daemon(
      keystore,
      stateMachine,
      undefined, undefined, undefined, undefined, undefined, undefined,
      mockScanner,
      10 // 10ms interval — will fire a few times
    );

    daemon.onDevicesUpdate((devices) => events.push(devices));
    daemon.startDeviceDiscovery();

    // Wait long enough for multiple scans
    await new Promise<void>((res) => setTimeout(res, 80));
    daemon.stopDeviceDiscovery();

    // Multiple scans ran but listener should only fire once (first change)
    expect(callCount).toBeGreaterThanOrEqual(2);
    expect(events).toHaveLength(1); // only first scan triggers event
  });
});
