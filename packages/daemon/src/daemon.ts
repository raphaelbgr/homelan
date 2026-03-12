import type {
  ConnectionState,
  LanDevice,
  NatTraversalConfig,
  TunnelMode,
  ConnectionProgress,
} from "@homelan/shared";
import type { IpcStatusResponse } from "@homelan/shared";
import { getKeychain, type KeychainStore } from "./keychain/index.js";
import { StateMachine } from "./state/machine.js";
import { generateKeypair } from "./wireguard/keygen.js";
import { resolveExternalEndpoint } from "./nat/stun.js";
import { RelayClient } from "./nat/relayClient.js";
import { attemptHolePunch } from "./nat/holePunch.js";
import { WireGuardInterface, type WgInterfaceConfig } from "./wireguard/interface.js";
import { createDnsConfigurator, type DnsConfigurator } from "./platform/dns.js";
import { createIPv6Blocker, type IPv6Blocker } from "./platform/ipv6.js";
import { scanLanDevices } from "./platform/arp.js";
import { HistoryLogger } from "./history/logger.js";
import dns from "node:dns/promises";

export type StunResolverFn = typeof resolveExternalEndpoint;
export type RelayClientFactory = (opts: {
  relayUrl: string;
  relaySecret: string;
  publicKey: string;
}) => Pick<RelayClient, "register" | "lookup" | "startAutoRenew" | "pair">;

export type DnsResolverFn = (hostname: string) => Promise<string[]>;
export type HolePunchFn = typeof attemptHolePunch;
export type LanScannerFn = typeof scanLanDevices;

type ProgressListener = (progress: ConnectionProgress) => void;
type ModeListener = (mode: TunnelMode) => void;
type DevicesListener = (devices: LanDevice[]) => void;

/**
 * Daemon orchestrator — wires keychain + state machine together.
 * The IPC server is constructed externally via createIpcServer(daemon).
 */
export class Daemon {
  private _startedAt = 0;
  private _publicKey: string | null = null;
  private _mode: TunnelMode | null = null;
  private _wgConfig: WgInterfaceConfig | null = null;
  private _progressListeners: ProgressListener[] = [];
  private _modeListeners: ModeListener[] = [];
  private _lanDevices: LanDevice[] = [];
  private _discoveryTimer: NodeJS.Timeout | null = null;
  private _deviceListeners: DevicesListener[] = [];
  private _connectedAt: number | null = null;
  private _relayClient: ReturnType<RelayClientFactory> | null = null;

  constructor(
    private readonly keychain: KeychainStore = getKeychain(),
    private readonly stateMachine: StateMachine = new StateMachine(),
    private readonly stunResolver: StunResolverFn = resolveExternalEndpoint,
    private readonly relayClientFactory: RelayClientFactory = (opts) =>
      new RelayClient(opts),
    private readonly holePunchFn: HolePunchFn = attemptHolePunch,
    private readonly wgInterface: WireGuardInterface = new WireGuardInterface("homelan"),
    private readonly dnsConfigurator: DnsConfigurator = createDnsConfigurator(),
    private readonly ipv6Blocker: IPv6Blocker = createIPv6Blocker(),
    private readonly lanScanner: LanScannerFn = scanLanDevices,
    private readonly discoveryIntervalMs: number = 30_000,
    private readonly ddnsHostname: string | undefined = undefined,
    private readonly _historyLogger: HistoryLogger = new HistoryLogger(),
    private readonly dnsResolver: DnsResolverFn = (hostname) => dns.resolve4(hostname)
  ) {}

  async start(): Promise<void> {
    this._startedAt = Date.now();

    // Key management: load existing or generate new
    const storedPrivateKey = await this.keychain.retrieve("homelan/private-key");
    if (storedPrivateKey === null) {
      console.log("[daemon] No key found. Generating new WireGuard keypair...");
      const keypair = await generateKeypair();
      await this.keychain.store("homelan/private-key", keypair.privateKey);
      this._publicKey = keypair.publicKey;
    } else {
      // Derive public key from stored private key using Node.js crypto
      this._publicKey = await derivePublicKeyFromPrivate(storedPrivateKey);
    }
    console.log(`[daemon] Starting on port 30001`);
    console.log(`[daemon] Public key: ${this._publicKey}`);
  }

  /**
   * Establishes a WireGuard tunnel using the provided NAT traversal config.
   * State transitions: idle → connecting → connected (or error on failure).
   *
   * Flow:
   * 1. STUN — discover external endpoint
   * 2. Relay register + lookup — discover peer endpoint
   * 3. Hole punch — attempt direct P2P connection
   * 4. If hole punch fails — fall back to relay proxy endpoint
   * 5. Configure + bring up WireGuard interface
   */
  async connect(
    config: NatTraversalConfig & { mode: TunnelMode }
  ): Promise<void> {
    if (this.stateMachine.state !== "idle") {
      throw new Error("Already connecting or connected");
    }

    this.stateMachine.transition("connecting");

    try {
      // 1. STUN — discover external endpoint
      const stunServer = config.stunServers[0];
      if (!stunServer) {
        throw new Error("No STUN servers configured");
      }
      const stunResult = await this.stunResolver(stunServer);
      const myPort = stunResult.port;
      const myEndpoint = `${stunResult.ip}:${stunResult.port}`;

      // 2. Register with relay, discover peer
      const relayClient = this.relayClientFactory({
        relayUrl: config.relayUrl,
        relaySecret: config.relaySecret,
        publicKey: this._publicKey ?? "",
      });
      this._relayClient = relayClient;

      this.emitProgress("discovering_peer");
      await relayClient.register(myEndpoint);
      const peerInfo = await relayClient.lookup(config.peerPublicKey);
      const peerEndpoint = peerInfo.endpoint;

      // 3. Attempt hole punch
      this.emitProgress("trying_direct");
      const holePunchResult = await this.holePunchFn(
        myPort,
        peerEndpoint,
        config.holePunchTimeoutMs
      );

      // 4. Determine WireGuard endpoint — direct, relay, or DDNS fallback
      let wgEndpoint: string;
      let fallbackMethod: "direct" | "relay" | "ddns" | "hardcoded";
      if (holePunchResult.success) {
        wgEndpoint = peerEndpoint;
        fallbackMethod = "direct";
      } else {
        this.emitProgress("trying_relay");
        // Try DDNS fallback after relay fails (before hardcoded IP)
        if (this.ddnsHostname) {
          try {
            this.emitProgress("trying_ddns");
            const ips = await this.dnsResolver(this.ddnsHostname);
            const ddnsIp = ips[0];
            if (ddnsIp) {
              // Use DDNS-resolved IP — extract port from peer endpoint
              const peerPort = peerEndpoint.split(":").pop() ?? "51820";
              wgEndpoint = `${ddnsIp}:${peerPort}`;
              fallbackMethod = "ddns";
            } else {
              wgEndpoint = relayUrlToWgEndpoint(config.relayUrl);
              fallbackMethod = "relay";
            }
          } catch {
            // DDNS resolution failed — fall back to relay
            wgEndpoint = relayUrlToWgEndpoint(config.relayUrl);
            fallbackMethod = "relay";
          }
        } else {
          // Parse relay URL to extract host:port for use as WireGuard peer endpoint
          // The relay proxies WireGuard UDP frames on a dedicated port
          wgEndpoint = relayUrlToWgEndpoint(config.relayUrl);
          fallbackMethod = "relay";
        }
      }

      // 5. Configure and bring up WireGuard interface
      const privateKey = await this.keychain.retrieve("homelan/private-key");
      if (!privateKey) {
        throw new Error("Private key not found in keychain");
      }

      const wgConfig: WgInterfaceConfig = {
        privateKey,
        address: "10.0.0.2/24",
        listenPort: myPort,
        peers: [
          {
            publicKey: config.peerPublicKey,
            endpoint: wgEndpoint,
            allowedIps: ["10.0.0.0/24", "192.168.7.0/24"],
            persistentKeepalive: 25,
          },
        ],
      };

      this.wgInterface.configure(wgConfig);
      this._wgConfig = wgConfig;
      await this.wgInterface.up();

      // Apply DNS and IPv6 rules after WireGuard is up.
      // If these fail, log a warning but keep the tunnel running — routing works even without enforcement.
      try {
        await this.ipv6Blocker.blockIPv6("homelan");
        if (config.mode === "full-gateway") {
          await this.dnsConfigurator.setDns("homelan", "192.168.7.1");
        }
        // lan-only: keep existing DNS, no change
      } catch (policyErr) {
        console.warn("[daemon] DNS/IPv6 policy apply failed (tunnel still up):", policyErr);
      }

      this._mode = config.mode;
      this._connectedAt = Date.now();
      this.stateMachine.transition("connected");
      this.emitProgress("connected");

      // Log connect event to history
      try {
        this._historyLogger.append({
          timestamp: new Date().toISOString(),
          action: "connect",
          mode: config.mode,
          peer_endpoint: wgEndpoint,
          fallback_method: fallbackMethod,
        });
      } catch {
        // History logging is best-effort — never block the connection
      }

      this.startDeviceDiscovery();
    } catch (err) {
      // On failure, try to transition to error state
      try {
        this.stateMachine.transition("error");
        // Log error to history
        try {
          this._historyLogger.append({
            timestamp: new Date().toISOString(),
            action: "error",
            error: err instanceof Error ? err.message : String(err),
          });
        } catch {
          // best-effort
        }
      } catch {
        // State machine may already be in error or invalid state — ignore
      }
      throw err;
    }
  }

  /**
   * Tears down the WireGuard tunnel.
   * State transitions: connected → disconnecting → idle.
   */
  async disconnect(): Promise<void> {
    if (this.stateMachine.state !== "connected") {
      throw new Error("Not connected");
    }

    this.stateMachine.transition("disconnecting");
    await this.wgInterface.down();

    // Restore DNS and IPv6 rules regardless of mode (safe no-op if not applied).
    try {
      await this.ipv6Blocker.restoreIPv6("homelan");
      await this.dnsConfigurator.restoreDns("homelan");
    } catch (policyErr) {
      console.warn("[daemon] DNS/IPv6 policy restore failed:", policyErr);
    }

    // Log disconnect event with duration
    const durationMs = this._connectedAt !== null ? Date.now() - this._connectedAt : undefined;
    try {
      this._historyLogger.append({
        timestamp: new Date().toISOString(),
        action: "disconnect",
        ...(this._mode !== null ? { mode: this._mode } : {}),
        ...(durationMs !== undefined ? { duration_ms: durationMs } : {}),
      });
    } catch {
      // best-effort
    }

    this._mode = null;
    this._wgConfig = null;
    this._connectedAt = null;
    this.stopDeviceDiscovery();
    this.stateMachine.transition("idle");
  }

  /**
   * Switches tunnel mode (Full Gateway ↔ LAN-Only) without tearing down the WireGuard tunnel.
   * Reconfigures AllowedIPs and DNS settings live.
   */
  async switchMode(newMode: TunnelMode): Promise<void> {
    if (this.stateMachine.state !== "connected") {
      throw new Error("Not connected — cannot switch mode while not connected");
    }

    // No-op if already in the requested mode
    if (this._mode === newMode) {
      return;
    }

    if (!this._wgConfig) {
      throw new Error("WireGuard config not available — cannot switch mode");
    }

    // Determine new AllowedIPs based on mode
    const newAllowedIps =
      newMode === "full-gateway"
        ? ["0.0.0.0/0", "::/0"]
        : ["10.0.0.0/24", "192.168.7.0/24"];

    // Reconfigure WireGuard with updated AllowedIPs
    const updatedConfig: WgInterfaceConfig = {
      ...this._wgConfig,
      peers: this._wgConfig.peers.map((peer) => ({
        ...peer,
        allowedIps: newAllowedIps,
      })),
    };

    this.wgInterface.configure(updatedConfig);
    this._wgConfig = updatedConfig;
    await this.wgInterface.up();

    // Update DNS based on new mode
    try {
      if (newMode === "full-gateway") {
        await this.dnsConfigurator.setDns("homelan", "192.168.7.1");
      } else {
        await this.dnsConfigurator.restoreDns("homelan");
      }
    } catch (policyErr) {
      console.warn("[daemon] DNS policy update failed during mode switch (tunnel still up):", policyErr);
    }

    this._mode = newMode;
    this.emitModeChange(newMode);

    // Log mode switch to history
    try {
      this._historyLogger.append({
        timestamp: new Date().toISOString(),
        action: "mode_switch",
        mode: newMode,
      });
    } catch {
      // best-effort
    }
  }

  /**
   * Register a listener for mode change events.
   * Returns an unsubscribe function.
   */
  onModeChange(fn: ModeListener): () => void {
    this._modeListeners.push(fn);
    return () => {
      this._modeListeners = this._modeListeners.filter((l) => l !== fn);
    };
  }

  private emitModeChange(mode: TunnelMode): void {
    for (const fn of this._modeListeners) {
      fn(mode);
    }
  }

  /**
   * Register a listener for connection progress events.
   * Returns an unsubscribe function.
   */
  onProgress(fn: ProgressListener): () => void {
    this._progressListeners.push(fn);
    return () => {
      this._progressListeners = this._progressListeners.filter((l) => l !== fn);
    };
  }

  private emitProgress(progress: ConnectionProgress): void {
    for (const fn of this._progressListeners) {
      fn(progress);
    }
  }

  /**
   * Start polling for LAN devices via ARP table scanning.
   * Runs an immediate scan, then repeats on discoveryIntervalMs.
   * Emits device listeners when the list changes.
   */
  startDeviceDiscovery(): void {
    if (this._discoveryTimer) return; // already running

    const scan = async () => {
      const newDevices = await this.lanScanner();
      const changed = JSON.stringify(newDevices) !== JSON.stringify(this._lanDevices);
      this._lanDevices = newDevices;
      if (changed) {
        for (const fn of this._deviceListeners) fn(newDevices);
      }
    };

    // Run immediately, then on interval
    void scan();
    this._discoveryTimer = setInterval(() => void scan(), this.discoveryIntervalMs);
  }

  /**
   * Stop device discovery polling and clear device list.
   */
  stopDeviceDiscovery(): void {
    if (this._discoveryTimer) {
      clearInterval(this._discoveryTimer);
      this._discoveryTimer = null;
    }
    this._lanDevices = [];
  }

  /**
   * Register a listener for device list update events.
   * Returns an unsubscribe function.
   */
  onDevicesUpdate(fn: DevicesListener): () => void {
    this._deviceListeners.push(fn);
    return () => {
      this._deviceListeners = this._deviceListeners.filter((l) => l !== fn);
    };
  }

  getStatus(): IpcStatusResponse {
    return {
      state: this.stateMachine.state,
      mode: this._mode,
      latencyMs: null,
      throughputBytesPerSec: null,
      hostInfo: null,
      connectedPeers: [],
      lanDevices: this._lanDevices,
      uptimeMs: this.uptimeMs,
    };
  }

  getLanDevices(): LanDevice[] {
    return this._lanDevices;
  }

  get state(): ConnectionState {
    return this.stateMachine.state;
  }

  get uptimeMs(): number {
    return this._startedAt ? Date.now() - this._startedAt : 0;
  }

  get publicKey(): string | null {
    return this._publicKey;
  }

  get historyLogger(): HistoryLogger {
    return this._historyLogger;
  }

  /**
   * Exchange a pairing invite URL for the server's public key.
   * Stores the server public key in the keychain after successful pairing.
   */
  async pair(inviteUrl: string): Promise<void> {
    // Use the relay client from last connect, or create a temporary one
    const relayClient = this._relayClient ?? this.relayClientFactory({
      relayUrl: "",
      relaySecret: process.env["RELAY_SECRET"] ?? "",
      publicKey: this._publicKey ?? "",
    });

    const pairResponse = await relayClient.pair(inviteUrl);
    await this.keychain.store("homelan/server-public-key", pairResponse.serverPublicKey);
    await this.keychain.store("homelan/relay-url", pairResponse.relayUrl);
  }

  onStateChange(
    fn: (next: ConnectionState, prev: ConnectionState) => void
  ): () => void {
    return this.stateMachine.onTransition(fn);
  }
}

/**
 * Parse the relay URL and return a host:port string suitable for use as a
 * WireGuard peer endpoint. The relay proxies WireGuard UDP frames.
 *
 * Defaults to port 51820 (standard WireGuard port) if no port is in the URL.
 */
function relayUrlToWgEndpoint(relayUrl: string): string {
  try {
    const url = new URL(relayUrl);
    const host = url.hostname;
    const port = url.port
      ? parseInt(url.port, 10)
      : url.protocol === "https:"
      ? 443
      : 80;
    return `${host}:${port}`;
  } catch {
    // Fallback: strip protocol and use as-is
    const stripped = relayUrl.replace(/^https?:\/\//, "");
    const colonIdx = stripped.lastIndexOf(":");
    if (colonIdx !== -1) {
      return stripped.split("/")[0] ?? stripped;
    }
    return `${stripped}:51820`;
  }
}

/**
 * Derive public key from private key using Node.js built-in crypto (X25519).
 * Avoids storing the public key separately — derives it on demand.
 * No wg binary required.
 */
async function derivePublicKeyFromPrivate(privateKeyBase64: string): Promise<string> {
  const { createPrivateKey, createPublicKey } = await import("node:crypto");

  // Reconstruct X25519 private key object from raw 32-byte base64
  const rawPrivBytes = Buffer.from(privateKeyBase64, "base64");

  // Build PKCS8 DER structure for X25519 private key
  // PKCS8 header for X25519 + 32-byte raw key (with inner OCTET STRING wrapper)
  // Version (0), AlgorithmIdentifier (OID 1.3.101.110), PrivateKey (OCTET STRING wrapping raw key)
  const pkcs8Header = Buffer.from(
    "302e020100300506032b656e04220420",
    "hex"
  );
  const pkcs8Der = Buffer.concat([pkcs8Header, rawPrivBytes]);

  const privKeyObj = createPrivateKey({ key: pkcs8Der, format: "der", type: "pkcs8" });
  const pubKeyObj = createPublicKey(privKeyObj);

  const pubDer = pubKeyObj.export({ type: "spki", format: "der" });
  const pubBytes = Buffer.from(pubDer).subarray(-32);
  return pubBytes.toString("base64");
}
