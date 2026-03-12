import type { LookupResponse, PairResponse } from "@homelan/shared";

export type { LookupResponse };

export class RelayClientError extends Error {
  readonly code: string;

  constructor(message: string, code: string = "RELAY_ERROR") {
    super(message);
    this.name = "RelayClientError";
    this.code = code;
  }
}

export interface RelayClientOptions {
  relayUrl: string;
  relaySecret: string;
  publicKey: string;
}

export class RelayClient {
  private readonly relayUrl: string;
  private readonly relaySecret: string;
  private readonly publicKey: string;
  private lastEndpoint: string = "";

  constructor({ relayUrl, relaySecret, publicKey }: RelayClientOptions) {
    this.relayUrl = relayUrl.replace(/\/$/, ""); // strip trailing slash
    this.relaySecret = relaySecret;
    this.publicKey = publicKey;
  }

  /**
   * POST /register — registers this daemon's public key and external endpoint.
   * Throws RelayClientError on non-200 responses.
   */
  async register(endpoint: string): Promise<void> {
    this.lastEndpoint = endpoint;

    const body = JSON.stringify({
      publicKey: this.publicKey,
      endpoint,
      timestampMs: Date.now(),
    });

    const response = await fetch(`${this.relayUrl}/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.relaySecret}`,
      },
      body,
    });

    if (!response.ok) {
      let code = "REGISTER_FAILED";
      try {
        const json = (await response.json()) as { code?: string };
        if (json.code) code = json.code;
      } catch {
        // ignore JSON parse errors
      }
      throw new RelayClientError(
        `Register failed with HTTP ${response.status}`,
        code
      );
    }
  }

  /**
   * GET /lookup/:peerPublicKey — returns the peer's registered endpoint.
   * Throws RelayClientError with code "NOT_FOUND" on 404.
   */
  async lookup(peerPublicKey: string): Promise<LookupResponse> {
    const response = await fetch(
      `${this.relayUrl}/lookup/${peerPublicKey}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        throw new RelayClientError(
          `Peer not found: ${peerPublicKey}`,
          "NOT_FOUND"
        );
      }
      let code = "LOOKUP_FAILED";
      try {
        const json = (await response.json()) as { code?: string };
        if (json.code) code = json.code;
      } catch {
        // ignore
      }
      throw new RelayClientError(
        `Lookup failed with HTTP ${response.status}`,
        code
      );
    }

    return response.json() as Promise<LookupResponse>;
  }

  /**
   * POST /pair — exchange a pairing invite token for the server's public key.
   * Accepts an invite URL in the format: homelan://pair?token=<token>&relay=<relayUrl>
   * Returns PairResponse { serverPublicKey, relayUrl }.
   * Throws RelayClientError on non-200 or invalid URL.
   */
  async pair(inviteUrl: string): Promise<PairResponse> {
    let token: string;
    let targetRelayUrl: string;

    try {
      // URL constructor works with custom schemes like homelan://
      const url = new URL(inviteUrl);
      token = url.searchParams.get("token") ?? "";
      targetRelayUrl = url.searchParams.get("relay") ?? "";
    } catch {
      throw new RelayClientError(
        `Invalid invite URL: ${inviteUrl}`,
        "INVALID_INVITE_URL"
      );
    }

    if (!token) {
      throw new RelayClientError(
        "Invite URL missing token parameter",
        "INVALID_INVITE_URL"
      );
    }

    if (!targetRelayUrl) {
      throw new RelayClientError(
        "Invite URL missing relay parameter",
        "INVALID_INVITE_URL"
      );
    }

    const cleanRelayUrl = targetRelayUrl.replace(/\/$/, "");
    const body = JSON.stringify({
      token,
      clientPublicKey: this.publicKey,
    });

    const response = await fetch(`${cleanRelayUrl}/pair`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.relaySecret}`,
      },
      body,
    });

    if (!response.ok) {
      let code = "PAIR_FAILED";
      try {
        const json = (await response.json()) as { code?: string };
        if (json.code) code = json.code;
      } catch {
        // ignore JSON parse errors
      }
      throw new RelayClientError(
        `Pair failed with HTTP ${response.status}`,
        code
      );
    }

    const result = (await response.json()) as Partial<PairResponse>;

    if (!result.serverPublicKey || !result.relayUrl) {
      throw new RelayClientError(
        "Pair response missing required fields",
        "INVALID_PAIR_RESPONSE"
      );
    }

    return result as PairResponse;
  }

  /**
   * Starts auto-renewal at ttlSeconds/2 intervals.
   * Re-uses the last registered endpoint.
   * Errors from auto-renew are logged but do not throw (daemon keeps running).
   *
   * @returns A stop function that cancels the interval.
   */
  startAutoRenew(ttlSeconds: number): () => void {
    const intervalMs = (ttlSeconds / 2) * 1000;

    const interval = setInterval(() => {
      this.register(this.lastEndpoint).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[RelayClient] Auto-renew failed: ${message}`);
      });
    }, intervalMs);

    return () => {
      clearInterval(interval);
    };
  }
}
