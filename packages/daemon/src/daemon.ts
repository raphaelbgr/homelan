import type { ConnectionState, LanDevice } from "@homelan/shared";
import type { IpcStatusResponse } from "@homelan/shared";
import { getKeychain, type KeychainStore } from "./keychain/index.js";
import { StateMachine } from "./state/machine.js";
import { generateKeypair } from "./wireguard/keygen.js";

/**
 * Daemon orchestrator — wires keychain + state machine together.
 * The IPC server is constructed externally via createIpcServer(daemon).
 */
export class Daemon {
  private _startedAt = 0;
  private _publicKey: string | null = null;

  constructor(
    private readonly keychain: KeychainStore = getKeychain(),
    private readonly stateMachine: StateMachine = new StateMachine()
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

  getStatus(): IpcStatusResponse {
    return {
      state: this.stateMachine.state,
      mode: null,
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
