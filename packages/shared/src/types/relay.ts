export interface RegisterRequest {
  publicKey: string; // WireGuard public key (base64, 44 chars)
  endpoint: string; // "ip:port" or "" if behind NAT
  timestampMs: number; // Unix ms for TTL-based expiry
}

export interface RegisterResponse {
  ok: boolean;
  ttlSeconds: number;
}

export interface LookupResponse {
  publicKey: string;
  endpoint: string;
  timestampMs: number;
}

export interface RelayError {
  error: string;
  code: string;
}

export interface InviteResponse {
  inviteUrl: string;
  token: string;
  expiresAt: number; // Unix ms
}

export interface PairRequest {
  token: string;
  clientPublicKey: string; // base64 WireGuard public key (44 chars)
}

export interface PairResponse {
  serverPublicKey: string;
  relayUrl: string;
}
