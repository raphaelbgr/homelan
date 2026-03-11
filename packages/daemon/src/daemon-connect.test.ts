/**
 * Daemon connect/disconnect tests — uses vi.fn() mocks for all injected
 * dependencies (stun, relayClient, holePunch, wgInterface).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NatTraversalConfig, TunnelMode, ConnectionProgress } from "@homelan/shared";
import { Daemon } from "./daemon.js";
import { FileKeystore } from "./keychain/filestore.js";
import { StateMachine } from "./state/machine.js";
import os from "node:os";
import path from "node:path";
import type { HolePunchResult } from "./nat/holePunch.js";
import type { WgInterfaceConfig } from "./wireguard/interface.js";
import type { LookupResponse } from "@homelan/shared";

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
  });

  function makeDaemon(): Daemon {
    return new Daemon(
      keystore,
      stateMachine,
      mockStunResolver,
      mockRelayClientFactory,
      mockHolePunchFn,
      mockWgInterface as never
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
});
