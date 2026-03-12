export interface StunResult {
  ip: string;
  port: number;
  family: "IPv4";
}

export type ConnectionProgress =
  | "discovering_peer"
  | "trying_direct"
  | "trying_relay"
  | "trying_ddns"
  | "connected"
  | "error";

export interface NatTraversalConfig {
  stunServers: string[];
  holePunchTimeoutMs: number;
  relayUrl: string;
  relaySecret: string;
  peerPublicKey: string;
}
