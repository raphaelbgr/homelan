import type { PeerInfo } from "@homelan/shared";
import { execFileSafe, type ShellExecutor } from "../utils/execFile.js";
import { writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface WgInterfaceConfig {
  privateKey: string;
  address: string; // e.g. "10.0.0.1/24"
  listenPort: number;
  peers: Array<{
    publicKey: string;
    endpoint: string;
    allowedIps: string[];
    persistentKeepalive?: number;
  }>;
}

export class WireGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WireGuardError";
  }
}

export class WireGuardInterface {
  private _config: WgInterfaceConfig | null = null;

  constructor(
    private readonly interfaceName: string,
    private readonly executor: ShellExecutor = execFileSafe
  ) {}

  configure(config: WgInterfaceConfig): void {
    this._config = config;
  }

  async up(): Promise<void> {
    if (!this._config) {
      throw new WireGuardError("configure() must be called before up()");
    }
    const configPath = await this.writeConfigFile(this._config);
    await this.executor("wg-quick", ["up", configPath]);
  }

  async down(): Promise<void> {
    await this.executor("wg-quick", ["down", this.interfaceName]);
  }

  async status(): Promise<{ isUp: boolean; peers: PeerInfo[] }> {
    try {
      const { stdout } = await this.executor("wg", [
        "show",
        this.interfaceName,
      ]);
      return this.parseWgShow(stdout);
    } catch {
      return { isUp: false, peers: [] };
    }
  }

  private async writeConfigFile(config: WgInterfaceConfig): Promise<string> {
    const dir = join(tmpdir(), "homelan");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${this.interfaceName}.conf`);
    const content = this.toWgConf(config);
    await writeFile(path, content, { mode: 0o600 });
    return path;
  }

  private toWgConf(config: WgInterfaceConfig): string {
    const lines: string[] = [
      "[Interface]",
      `PrivateKey = ${config.privateKey}`,
      `Address = ${config.address}`,
      `ListenPort = ${config.listenPort}`,
    ];

    for (const peer of config.peers) {
      lines.push("");
      lines.push("[Peer]");
      lines.push(`PublicKey = ${peer.publicKey}`);
      lines.push(`Endpoint = ${peer.endpoint}`);
      lines.push(`AllowedIPs = ${peer.allowedIps.join(", ")}`);
      if (peer.persistentKeepalive !== undefined) {
        lines.push(`PersistentKeepalive = ${peer.persistentKeepalive}`);
      }
    }

    return lines.join("\n") + "\n";
  }

  private parseWgShow(output: string): { isUp: boolean; peers: PeerInfo[] } {
    // If output is empty, the interface is not up
    if (!output.trim()) return { isUp: false, peers: [] };
    // Full peer parsing deferred to Phase 2 — interface is up if there's any output
    return { isUp: true, peers: [] };
  }
}
