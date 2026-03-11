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

export type StunResolverFn = typeof resolveExternalEndpoint;
export type RelayClientFactory = (opts: {
  relayUrl: string;
  relaySecret: string;
  publicKey: string;
}) => Pick<RelayClient, "register" | "lookup" | "startAutoRenew">;
export type HolePunchFn = typeof attemptHolePunch;

type ProgressListener = (progress: ConnectionProgress) => void;

/**
 * Daemon orchestrator — wires keychain + state machine together.
 * The IPC server is constructed externally via createIpcServer(daemon).
 */
export class Daemon {
  private _startedAt = 0;
  private _publicKey: string | null = null;
  private _mode: TunnelMode | null = null;
  private _progressListeners: ProgressListener[] = [];

  constructor(
    private readonly keychain: KeychainStore = getKeychain(),
    private readonly stateMachine: StateMachine = new StateMachine(),
    private readonly stunResolver: StunResolverFn = resolveExternalEndpoint,
    private readonly relayClientFactory: RelayClientFactory = (opts) =>
      new RelayClient(opts),
    private readonly holePunchFn: HolePunchFn = attemptHolePunch,
    private readonly wgInterface: WireGuardInterface = new WireGuardInterface("homelan"),
    private readonly dnsConfigurator: DnsConfigurator = createDnsConfigurator(),
    private readonly ipv6Blocker: IPv6Blocker = createIPv6Blocker()
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

      // 4. Determine WireGuard endpoint — direct or relay fallback
      let wgEndpoint: string;
      if (holePunchResult.success) {
        wgEndpoint = peerEndpoint;
      } else {
        this.emitProgress("trying_relay");
        // Parse relay URL to extract host:port for use as WireGuard peer endpoint
        // The relay proxies WireGuard UDP frames on a dedicated port
        wgEndpoint = relayUrlToWgEndpoint(config.relayUrl);
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
      this.stateMachine.transition("connected");
      this.emitProgress("connected");
    } catch (err) {
      // On failure, try to transition to error state
      try {
        this.stateMachine.transition("error");
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

    this._mode = null;
    this.stateMachine.transition("idle");
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

  getStatus(): IpcStatusResponse {
    return {
      state: this.stateMachine.state,
      mode: this._mode,
      latencyMs: null,
      throughputBytesPerSec: null,
      hostInfo: null,
      connectedPeers: [],
      lanDevices: [],
      uptimeMs: this.uptimeMs,
    };
  }

  getLanDevices(): LanDevice[] {
    return [];
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
