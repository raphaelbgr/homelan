/**
 * Daemon connect/disconnect tests — uses vi.fn() mocks for all injected
 * dependencies (stun, relayClient, holePunch, wgInterface, dnsConfigurator, ipv6Blocker).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NatTraversalConfig, TunnelMode, ConnectionProgress } from "@homelan/shared";
import { Daemon } from "./daemon.js";
import { FileKeystore } from "./keychain/filestore.js";
import { StateMachine } from "./state/machine.js";
import os from "node:os";
import path from "node:path";
import type { HolePunchResult } from "./nat/holePunch.js";
import type { WgInterfaceConfig } from "./wireguard/interface.js";
import type { LookupResponse } from "@homelan/shared";
import type { DnsConfigurator } from "./platform/dns.js";
import type { IPv6Blocker } from "./platform/ipv6.js";

function makeTmpKeystore(): FileKeystore {
  const tmpDir = path.join(
    os.tmpdir(),
    `homelan-connect-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  return new FileKeystore(tmpDir);
}

const BASE_CONFIG: NatTraversalConfig & { mode: TunnelMode } = {
  stunServers: ["stun.example.com:3478"],
  holePunchTimeoutMs: 4000,
  relayUrl: "https://relay.example.com",
  relaySecret: "secret",
  peerPublicKey: "peerPubKey==",
  mode: "lan-only",
};

// Mock StunResult
const MOCK_STUN_RESULT = { ip: "1.2.3.4", port: 51820, family: "IPv4" as const };

// Mock LookupResponse
const MOCK_LOOKUP_RESPONSE: LookupResponse = {
  publicKey: "peerPubKey==",
  endpoint: "5.6.7.8:51820",
  registeredAt: Date.now(),
  expiresAt: Date.now() + 300_000,
};

describe("Daemon.connect() / Daemon.disconnect()", () => {
  let keystore: FileKeystore;
  let stateMachine: StateMachine;

  // Mock injectable functions
  let mockStunResolver: ReturnType<typeof vi.fn>;
  let mockRelayClientFactory: ReturnType<typeof vi.fn>;
  let mockRegister: ReturnType<typeof vi.fn>;
  let mockLookup: ReturnType<typeof vi.fn>;
  let mockHolePunchFn: ReturnType<typeof vi.fn>;
  let mockWgInterface: {
    configure: ReturnType<typeof vi.fn>;
    up: ReturnType<typeof vi.fn>;
    down: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
  let mockDnsConfigurator: DnsConfigurator;
  let mockIPv6Blocker: IPv6Blocker;

  beforeEach(() => {
    keystore = makeTmpKeystore();
    stateMachine = new StateMachine();

    mockStunResolver = vi.fn().mockResolvedValue(MOCK_STUN_RESULT);

    mockRegister = vi.fn().mockResolvedValue(undefined);
    mockLookup = vi.fn().mockResolvedValue(MOCK_LOOKUP_RESPONSE);
    mockRelayClientFactory = vi.fn().mockReturnValue({
      register: mockRegister,
      lookup: mockLookup,
      startAutoRenew: vi.fn().mockReturnValue(() => {}),
    });

    mockHolePunchFn = vi.fn().mockResolvedValue({
      success: true,
      confirmedEndpoint: "5.6.7.8:51820",
    } satisfies HolePunchResult);

    mockWgInterface = {
      configure: vi.fn(),
      up: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ isUp: false, peers: [] }),
    };

    mockDnsConfigurator = {
      setDns: vi.fn().mockResolvedValue(undefined),
      restoreDns: vi.fn().mockResolvedValue(undefined),
    };

    mockIPv6Blocker = {
      blockIPv6: vi.fn().mockResolvedValue(undefined),
      restoreIPv6: vi.fn().mockResolvedValue(undefined),
    };
  });

  function makeDaemon(): Daemon {
    return new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never,
      mockDnsConfigurator,
      mockIPv6Blocker
    );
  }

  it("Test 1: connect() transitions idle→connecting→connected on success", async () => {
    const daemon = makeDaemon();
    await daemon.start();

    const states: string[] = [daemon.state];
    daemon.onStateChange((next) => states.push(next));

    await daemon.connect(BASE_CONFIG);

    expect(states).toEqual(["idle", "connecting", "connected"]);
    expect(daemon.state).toBe("connected");
  });

  it("Test 2: connect() uses relay endpoint when hole punch fails (relay fallback)", async () => {
    mockHolePunchFn.mockResolvedValue({
      success: false,
      confirmedEndpoint: null,
    } satisfies HolePunchResult);

    const daemon = makeDaemon();
    await daemon.start();

    const progressEvents: ConnectionProgress[] = [];
    daemon.onProgress((p) => progressEvents.push(p));

    await daemon.connect(BASE_CONFIG);

    // Should still connect via relay
    expect(daemon.state).toBe("connected");
    expect(progressEvents).toContain("trying_relay");

    // wgInterface.configure should have been called
    expect(mockWgInterface.configure).toHaveBeenCalled();
    // The configured endpoint should be the relay host:port (not the peer's direct endpoint)
    const configArg = mockWgInterface.configure.mock.calls[0][0] as WgInterfaceConfig;
    // Relay URL host is "relay.example.com" — not the direct peer endpoint
    expect(configArg.peers[0].endpoint).not.toBe("5.6.7.8:51820");
  });

  it("Test 3: disconnect() transitions connected→disconnecting→idle, wgInterface.down() called", async () => {
    const daemon = makeDaemon();
    await daemon.start();
    await daemon.connect(BASE_CONFIG);

    const states: string[] = [];
    daemon.onStateChange((next) => states.push(next));

    await daemon.disconnect();

    expect(states).toEqual(["disconnecting", "idle"]);
    expect(daemon.state).toBe("idle");
    expect(mockWgInterface.down).toHaveBeenCalledOnce();
  });

  it("Test 4: connect() emits discovering_peer, trying_direct, connected progress events", async () => {
    const daemon = makeDaemon();
    await daemon.start();

    const progressEvents: ConnectionProgress[] = [];
    daemon.onProgress((p) => progressEvents.push(p));

    await daemon.connect(BASE_CONFIG);

    expect(progressEvents).toContain("discovering_peer");
    expect(progressEvents).toContain("trying_direct");
    expect(progressEvents).toContain("connected");
  });

  it("Test 5: connect() throws if not idle", async () => {
    const daemon = makeDaemon();
    await daemon.start();

    // Put state machine in connecting state manually
    stateMachine.transition("connecting");

    await expect(daemon.connect(BASE_CONFIG)).rejects.toThrow(
      /already connecting or connected/i
    );
  });

  it("Test 6: full-gateway connect() calls setDns and blockIPv6", async () => {
    const daemon = makeDaemon();
    await daemon.start();

    await daemon.connect({ ...BASE_CONFIG, mode: "full-gateway" });

    expect(mockIPv6Blocker.blockIPv6).toHaveBeenCalledWith("homelan");
    expect(mockDnsConfigurator.setDns).toHaveBeenCalledWith("homelan", "192.168.7.1");
  });

  it("Test 7: lan-only connect() calls blockIPv6 but NOT setDns", async () => {
    const daemon = makeDaemon();
    await daemon.start();

    await daemon.connect({ ...BASE_CONFIG, mode: "lan-only" });

    expect(mockIPv6Blocker.blockIPv6).toHaveBeenCalledWith("homelan");
    expect(mockDnsConfigurator.setDns).not.toHaveBeenCalled();
  });

  it("Test 8: disconnect() calls restoreIPv6 and restoreDns", async () => {
    const daemon = makeDaemon();
    await daemon.start();
    await daemon.connect(BASE_CONFIG);

    await daemon.disconnect();

    expect(mockIPv6Blocker.restoreIPv6).toHaveBeenCalledWith("homelan");
    expect(mockDnsConfigurator.restoreDns).toHaveBeenCalledWith("homelan");
  });

  it("disconnect() throws when state is not connected", async () => {
    const daemon = makeDaemon();
    await daemon.start();
    // State is idle — disconnect should throw
    await expect(daemon.disconnect()).rejects.toThrow(/not connected/i);
  });

  it("pair() stores serverPublicKey and relayUrl in keychain", async () => {
    const mockPair = vi.fn().mockResolvedValue({
      serverPublicKey: "serverPubKey==",
      relayUrl: "https://relay.example.com",
    });
    mockRelayClientFactory.mockReturnValue({
      register: mockRegister,
      lookup: mockLookup,
      startAutoRenew: vi.fn().mockReturnValue(() => {}),
      pair: mockPair,
    });

    const daemon = makeDaemon();
    await daemon.start();

    await daemon.pair("homelan://pair?token=abc&relay=https%3A%2F%2Frelay.example.com");

    // Verify keychain was called with correct values
    const storedServerKey = await keystore.retrieve("homelan/server-public-key");
    expect(storedServerKey).toBe("serverPubKey==");
    const storedRelayUrl = await keystore.retrieve("homelan/relay-url");
    expect(storedRelayUrl).toBe("https://relay.example.com");
  });

  it("pair() propagates RelayClient error on invalid inviteUrl", async () => {
    const { RelayClientError } = await import("./nat/relayClient.js");
    const mockPair = vi.fn().mockRejectedValue(
      new RelayClientError("Invalid invite URL: bad-url", "INVALID_INVITE_URL")
    );
    mockRelayClientFactory.mockReturnValue({
      register: mockRegister,
      lookup: mockLookup,
      startAutoRenew: vi.fn().mockReturnValue(() => {}),
      pair: mockPair,
    });

    const daemon = makeDaemon();
    await daemon.start();

    await expect(daemon.pair("bad-url")).rejects.toThrow(/invalid invite url/i);
  });
});

// ---------------------------------------------------------------------------
// DDNS fallback tests
// ---------------------------------------------------------------------------

import { HistoryLogger } from "./history/logger.js";
import type { HistoryEntry } from "./history/logger.js";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";

function makeTmpHistoryPath(): string {
  return path.join(
    os.tmpdir(),
    `homelan-daemon-history-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`
  );
}

describe("Daemon.connect() — DDNS fallback", () => {
  let keystore: FileKeystore;
  let stateMachine: StateMachine;
  let mockStunResolver: ReturnType<typeof vi.fn>;
  let mockRelayClientFactory: ReturnType<typeof vi.fn>;
  let mockRegister: ReturnType<typeof vi.fn>;
  let mockLookup: ReturnType<typeof vi.fn>;
  let mockHolePunchFn: ReturnType<typeof vi.fn>;
  let mockWgInterface: {
    configure: ReturnType<typeof vi.fn>;
    up: ReturnType<typeof vi.fn>;
    down: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
  let mockDnsConfigurator: DnsConfigurator;
  let mockIPv6Blocker: IPv6Blocker;

  beforeEach(() => {
    keystore = makeTmpKeystore();
    stateMachine = new StateMachine();

    mockStunResolver = vi.fn().mockResolvedValue(MOCK_STUN_RESULT);

    mockRegister = vi.fn().mockResolvedValue(undefined);
    mockLookup = vi.fn().mockResolvedValue(MOCK_LOOKUP_RESPONSE);
    mockRelayClientFactory = vi.fn().mockReturnValue({
      register: mockRegister,
      lookup: mockLookup,
      startAutoRenew: vi.fn().mockReturnValue(() => {}),
    });

    // Hole punch fails by default for DDNS tests
    mockHolePunchFn = vi.fn().mockResolvedValue({
      success: false,
      confirmedEndpoint: null,
    } satisfies HolePunchResult);

    mockWgInterface = {
      configure: vi.fn(),
      up: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ isUp: false, peers: [] }),
    };

    mockDnsConfigurator = {
      setDns: vi.fn().mockResolvedValue(undefined),
      restoreDns: vi.fn().mockResolvedValue(undefined),
    };

    mockIPv6Blocker = {
      blockIPv6: vi.fn().mockResolvedValue(undefined),
      restoreIPv6: vi.fn().mockResolvedValue(undefined),
    };
  });

  it("emits trying_ddns progress step when DDNS hostname is configured and relay fallback is used", async () => {
    const mockDnsResolver = vi.fn().mockResolvedValue(["10.0.0.1"]);

    const daemon = new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never,
      mockDnsConfigurator,
      mockIPv6Blocker,
      undefined, // lanScanner
      30_000,    // discoveryIntervalMs
      "home.example.dyndns.org", // ddnsHostname
      undefined, // historyLogger
      mockDnsResolver
    );
    await daemon.start();

    const progressEvents: ConnectionProgress[] = [];
    daemon.onProgress((p) => progressEvents.push(p));

    await daemon.connect(BASE_CONFIG);

    expect(progressEvents).toContain("trying_ddns");
    expect(mockDnsResolver).toHaveBeenCalledWith("home.example.dyndns.org");
  });

  it("does NOT emit trying_ddns when no ddnsHostname configured", async () => {
    // Hole punch fails, but still connects via relay (no DDNS)
    const daemon = new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never,
      mockDnsConfigurator,
      mockIPv6Blocker,
    );
    await daemon.start();

    const progressEvents: ConnectionProgress[] = [];
    daemon.onProgress((p) => progressEvents.push(p));

    await daemon.connect(BASE_CONFIG);

    expect(progressEvents).not.toContain("trying_ddns");
  });

  it("falls back to relay when DDNS resolution returns empty array", async () => {
    const mockDnsResolver = vi.fn().mockResolvedValue([]); // empty array

    const daemon = new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never,
      mockDnsConfigurator,
      mockIPv6Blocker,
      undefined,
      30_000,
      "home.dyndns.org",
      undefined,
      mockDnsResolver
    );
    await daemon.start();
    await daemon.connect(BASE_CONFIG);

    // Should connect via relay — the endpoint should be derived from relayUrl, not DDNS
    const cfg = mockWgInterface.configure.mock.calls[0]![0] as WgInterfaceConfig;
    expect(cfg.peers[0]!.endpoint).toContain("relay.example.com");
  });

  it("skips DDNS entirely when ddnsHostname is empty string", async () => {
    const mockDnsResolver = vi.fn();

    const daemon = new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never,
      mockDnsConfigurator,
      mockIPv6Blocker,
      undefined,
      30_000,
      "",  // empty string ddnsHostname — falsy
      undefined,
      mockDnsResolver
    );
    await daemon.start();

    const progressEvents: ConnectionProgress[] = [];
    daemon.onProgress((p) => progressEvents.push(p));

    await daemon.connect(BASE_CONFIG);

    // DDNS resolver should not be called
    expect(mockDnsResolver).not.toHaveBeenCalled();
    expect(progressEvents).not.toContain("trying_ddns");
  });

  it("uses DDNS-resolved IP as WireGuard peer endpoint when configured", async () => {
    const ddnsIp = "203.0.113.42";
    const mockDnsResolver = vi.fn().mockResolvedValue([ddnsIp]);

    const daemon = new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never,
      mockDnsConfigurator,
      mockIPv6Blocker,
      undefined,
      30_000,
      "home.dyndns.org",
      undefined,
      mockDnsResolver
    );
    await daemon.start();

    await daemon.connect(BASE_CONFIG);

    // WG should be configured with an endpoint containing the DDNS-resolved IP
    const cfg = mockWgInterface.configure.mock.calls[0]![0] as WgInterfaceConfig;
    expect(cfg.peers[0]!.endpoint).toContain(ddnsIp);
  });
});

// ---------------------------------------------------------------------------
// History logging tests
// ---------------------------------------------------------------------------

describe("Daemon history logging", () => {
  let keystore: FileKeystore;
  let stateMachine: StateMachine;
  let mockStunResolver: ReturnType<typeof vi.fn>;
  let mockRelayClientFactory: ReturnType<typeof vi.fn>;
  let mockHolePunchFn: ReturnType<typeof vi.fn>;
  let mockWgInterface: {
    configure: ReturnType<typeof vi.fn>;
    up: ReturnType<typeof vi.fn>;
    down: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
  let mockDnsConfigurator: DnsConfigurator;
  let mockIPv6Blocker: IPv6Blocker;
  let historyPath: string;
  let historyLogger: HistoryLogger;

  beforeEach(() => {
    keystore = makeTmpKeystore();
    stateMachine = new StateMachine();
    historyPath = makeTmpHistoryPath();
    historyLogger = new HistoryLogger(historyPath);

    mockStunResolver = vi.fn().mockResolvedValue(MOCK_STUN_RESULT);
    mockRelayClientFactory = vi.fn().mockReturnValue({
      register: vi.fn().mockResolvedValue(undefined),
      lookup: vi.fn().mockResolvedValue(MOCK_LOOKUP_RESPONSE),
      startAutoRenew: vi.fn().mockReturnValue(() => {}),
    });
    mockHolePunchFn = vi.fn().mockResolvedValue({
      success: true,
      confirmedEndpoint: "5.6.7.8:51820",
    } satisfies HolePunchResult);
    mockWgInterface = {
      configure: vi.fn(),
      up: vi.fn().mockResolvedValue(undefined),
      down: vi.fn().mockResolvedValue(undefined),
      status: vi.fn().mockResolvedValue({ isUp: false, peers: [] }),
    };
    mockDnsConfigurator = {
      setDns: vi.fn().mockResolvedValue(undefined),
      restoreDns: vi.fn().mockResolvedValue(undefined),
    };
    mockIPv6Blocker = {
      blockIPv6: vi.fn().mockResolvedValue(undefined),
      restoreIPv6: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    try { fs.unlinkSync(historyPath); } catch { /* ignore */ }
  });

  function makeDaemonWithHistory(): Daemon {
    return new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never,
      mockDnsConfigurator,
      mockIPv6Blocker,
      undefined,
      30_000,
      undefined, // no ddnsHostname
      historyLogger
    );
  }

  it("logs a connect entry on successful connection", async () => {
    const daemon = makeDaemonWithHistory();
    await daemon.start();
    await daemon.connect(BASE_CONFIG);

    const entries = historyLogger.getEntries();
    const connectEntry = entries.find((e) => e.action === "connect");
    expect(connectEntry).toBeDefined();
    expect(connectEntry!.mode).toBe("lan-only");
    expect(connectEntry!.timestamp).toMatch(/^\d{4}-/); // ISO date
  });

  it("logs a disconnect entry after disconnecting with duration_ms", async () => {
    const daemon = makeDaemonWithHistory();
    await daemon.start();
    await daemon.connect(BASE_CONFIG);
    await new Promise<void>((r) => setTimeout(r, 10));
    await daemon.disconnect();

    const entries = historyLogger.getEntries();
    const disconnectEntry = entries.find((e) => e.action === "disconnect");
    expect(disconnectEntry).toBeDefined();
    expect(typeof disconnectEntry!.duration_ms).toBe("number");
    expect(disconnectEntry!.duration_ms).toBeGreaterThanOrEqual(0);
  });

  it("logs a mode_switch entry on switchMode()", async () => {
    const daemon = makeDaemonWithHistory();
    await daemon.start();
    await daemon.connect(BASE_CONFIG);
    // Force _wgConfig is set from connect
    (daemon as unknown as { _wgConfig: WgInterfaceConfig | null })._wgConfig = {
      privateKey: "test-key",
      address: "10.0.0.2/24",
      listenPort: 51820,
      peers: [{ publicKey: "peer", endpoint: "1.2.3.4:51820", allowedIps: ["10.0.0.0/24"] }],
    };
    await daemon.switchMode("full-gateway");

    const entries = historyLogger.getEntries();
    const switchEntry = entries.find((e) => e.action === "mode_switch");
    expect(switchEntry).toBeDefined();
    expect(switchEntry!.mode).toBe("full-gateway");
  });

  it("daemon.historyLogger getter returns the logger instance", () => {
    const daemon = makeDaemonWithHistory();
    expect(daemon.historyLogger).toBe(historyLogger);
  });

  it("disconnect() when _connectedAt is null — no duration_ms in history", async () => {
    const daemon = makeDaemonWithHistory();
    await daemon.start();
    await daemon.connect(BASE_CONFIG);

    // Force _connectedAt to null to simulate edge case
    (daemon as unknown as { _connectedAt: number | null })._connectedAt = null;

    await daemon.disconnect();

    const entries = historyLogger.getEntries();
    const disconnectEntry = entries.find((e) => e.action === "disconnect");
    expect(disconnectEntry).toBeDefined();
    // duration_ms should be absent (undefined) when _connectedAt is null
    expect(disconnectEntry!.duration_ms).toBeUndefined();
  });
});
