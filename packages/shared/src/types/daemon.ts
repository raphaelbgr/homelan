export type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "error";

export type TunnelMode = "full-gateway" | "lan-only";

export interface WireguardKeypair {
  publicKey: string; // base64 — safe to expose
  // privateKey intentionally omitted — never leaves daemon
}

export interface PeerInfo {
  publicKey: string;
  endpoint: string;
  allowedIps: string[];
  lastHandshakeMs: number | null;
}

export interface LanDevice {
  ip: string;
  hostname: string | null;
  deviceType: string | null; // e.g. "Mac Mini", "Fire TV", null if unknown
}

export interface HostInfo {
  hostname: string;
  subnet: string; // e.g. "192.168.7.0/24"
  tunnelIp: string | null;
}

export interface DaemonStatus {
  state: ConnectionState;
  mode: TunnelMode | null;
  latencyMs: number | null;
  throughputBytesPerSec: number | null;
  hostInfo: HostInfo | null;
  connectedPeers: PeerInfo[];
  lanDevices: LanDevice[];
  uptimeMs: number;
}
