import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelayClient, RelayClientError } from "./relayClient.js";
import type { PairResponse } from "@homelan/shared";

const BASE_URL = "https://relay.example.com";
const RELAY_SECRET = "test-secret-key";
const PUBLIC_KEY = "dGVzdC1wdWJsaWMta2V5LWJhc2U2NC1mb3JtYXQ="; // 44-char base64

describe("RelayClient", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("register()", () => {
    it("sends correct POST body and Authorization header", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ttlSeconds: 60 }),
      } as Response;
      fetchSpy.mockResolvedValue(mockResponse);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      const endpoint = "203.0.113.1:51820";
      await client.register(endpoint);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toBe(`${BASE_URL}/register`);
      expect(init.method).toBe("POST");

      // Verify Authorization header
      const headers = new Headers(init.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${RELAY_SECRET}`);
      expect(headers.get("Content-Type")).toBe("application/json");

      // Verify body
      const body = JSON.parse(init.body as string) as {
        publicKey: string;
        endpoint: string;
        timestampMs: number;
      };
      expect(body.publicKey).toBe(PUBLIC_KEY);
      expect(body.endpoint).toBe(endpoint);
      expect(typeof body.timestampMs).toBe("number");
      expect(body.timestampMs).toBeGreaterThan(0);
    });

    it("throws RelayClientError on non-200 response", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: "Internal Server Error", code: "SERVER_ERROR" }),
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      await expect(client.register("1.2.3.4:51820")).rejects.toThrow(RelayClientError);
    });
  });

  describe("lookup()", () => {
    it("returns LookupResponse on 200", async () => {
      const peerKey = "cGVlci1wdWJsaWMta2V5LWJhc2U2NC1mb3JtYXQ=";
      const expectedResponse = {
        publicKey: peerKey,
        endpoint: "198.51.100.5:51820",
        timestampMs: Date.now(),
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => expectedResponse,
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      const result = await client.lookup(peerKey);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${BASE_URL}/lookup/${peerKey}`);

      expect(result).toEqual(expectedResponse);
    });

    it("throws RelayClientError with code NOT_FOUND on 404", async () => {
      const peerKey = "bm90LWZvdW5kLXBlZXIta2V5LWZvcm1hdA==";

      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Peer not found", code: "NOT_FOUND" }),
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      let thrownError: RelayClientError | undefined;
      try {
        await client.lookup(peerKey);
      } catch (err) {
        if (err instanceof RelayClientError) {
          thrownError = err;
        }
      }

      expect(thrownError).toBeInstanceOf(RelayClientError);
      expect(thrownError?.code).toBe("NOT_FOUND");
    });
  });

  describe("pair()", () => {
    const MOCK_SERVER_PUBLIC_KEY = "c2VydmVyUHVibGljS2V5QmFzZTY0Rm9ybWF0QT0=";
    const RELAY_URL = "https://relay.example.com";
    const INVITE_URL = `homelan://pair?token=abc123&relay=${encodeURIComponent(RELAY_URL)}`;

    it("POSTs to relay /pair with token and clientPublicKey", async () => {
      const mockPairResponse: PairResponse = {
        serverPublicKey: MOCK_SERVER_PUBLIC_KEY,
        relayUrl: RELAY_URL,
      };

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPairResponse,
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      const result = await client.pair(INVITE_URL);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

      // Should POST to relay extracted from invite URL's relay param
      expect(url).toContain("/pair");
      expect(url).toContain("relay.example.com");
      expect(init.method).toBe("POST");

      const body = JSON.parse(init.body as string) as { token: string; clientPublicKey: string };
      expect(body.token).toBe("abc123");
      expect(body.clientPublicKey).toBe(PUBLIC_KEY);

      expect(result.serverPublicKey).toBe(MOCK_SERVER_PUBLIC_KEY);
      expect(result.relayUrl).toBe(RELAY_URL);
    });

    it("throws RelayClientError on invalid invite URL format", async () => {
      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      await expect(client.pair("not-a-valid-url")).rejects.toThrow(RelayClientError);
    });

    it("throws RelayClientError on 401 response", async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Unauthorized", code: "UNAUTHORIZED" }),
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      await expect(client.pair(INVITE_URL)).rejects.toThrow(RelayClientError);
    });

    it("throws RelayClientError when token is missing from invite URL", async () => {
      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      // No token in URL
      const badUrl = `homelan://pair?relay=${encodeURIComponent(RELAY_URL)}`;
      await expect(client.pair(badUrl)).rejects.toThrow(RelayClientError);
    });

    it("throws INVALID_INVITE_URL when relay= parameter is empty string", async () => {
      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      const url = "homelan://pair?token=abc123&relay=";
      let thrown: RelayClientError | undefined;
      try { await client.pair(url); } catch (e) { if (e instanceof RelayClientError) thrown = e; }
      expect(thrown).toBeInstanceOf(RelayClientError);
      expect(thrown?.code).toBe("INVALID_INVITE_URL");
    });

    it("throws INVALID_INVITE_URL when relay parameter is missing entirely", async () => {
      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      const url = "homelan://pair?token=abc123";
      let thrown: RelayClientError | undefined;
      try { await client.pair(url); } catch (e) { if (e instanceof RelayClientError) thrown = e; }
      expect(thrown).toBeInstanceOf(RelayClientError);
      expect(thrown?.code).toBe("INVALID_INVITE_URL");
    });

    it("throws INVALID_INVITE_URL when token= parameter is empty string", async () => {
      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      const url = `homelan://pair?token=&relay=${encodeURIComponent(RELAY_URL)}`;
      let thrown: RelayClientError | undefined;
      try { await client.pair(url); } catch (e) { if (e instanceof RelayClientError) thrown = e; }
      expect(thrown).toBeInstanceOf(RelayClientError);
      expect(thrown?.code).toBe("INVALID_INVITE_URL");
    });

    it("throws when fetch rejects (network error)", async () => {
      fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      await expect(client.pair(INVITE_URL)).rejects.toThrow(TypeError);
    });

    it("throws INVALID_PAIR_RESPONSE when response JSON missing serverPublicKey", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ relayUrl: RELAY_URL }),
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      let thrown: RelayClientError | undefined;
      try { await client.pair(INVITE_URL); } catch (e) { if (e instanceof RelayClientError) thrown = e; }
      expect(thrown).toBeInstanceOf(RelayClientError);
      expect(thrown?.code).toBe("INVALID_PAIR_RESPONSE");
    });

    it("throws INVALID_PAIR_RESPONSE when response JSON missing relayUrl", async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ serverPublicKey: MOCK_SERVER_PUBLIC_KEY }),
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      let thrown: RelayClientError | undefined;
      try { await client.pair(INVITE_URL); } catch (e) { if (e instanceof RelayClientError) thrown = e; }
      expect(thrown).toBeInstanceOf(RelayClientError);
      expect(thrown?.code).toBe("INVALID_PAIR_RESPONSE");
    });

    it("works with non-homelan:// scheme URL as long as it is parseable", async () => {
      // URL constructor accepts any scheme — pair() validates token/relay params, not scheme
      const httpInvite = `https://example.com/pair?token=abc123&relay=${encodeURIComponent(RELAY_URL)}`;

      const mockPairResponse: PairResponse = {
        serverPublicKey: MOCK_SERVER_PUBLIC_KEY,
        relayUrl: RELAY_URL,
      };
      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockPairResponse,
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      const result = await client.pair(httpInvite);
      expect(result.serverPublicKey).toBe(MOCK_SERVER_PUBLIC_KEY);
      expect(result.relayUrl).toBe(RELAY_URL);
    });
  });

  describe("startAutoRenew()", () => {
    it("calls register() at correct interval (half TTL)", async () => {
      vi.useFakeTimers();

      fetchSpy.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, ttlSeconds: 60 }),
      } as Response);

      const client = new RelayClient({
        relayUrl: BASE_URL,
        relaySecret: RELAY_SECRET,
        publicKey: PUBLIC_KEY,
      });

      // Register once manually first
      await client.register("1.2.3.4:51820");
      fetchSpy.mockClear();

      const ttlSeconds = 60;
      const stop = client.startAutoRenew(ttlSeconds);

      // Should not have called register yet
      expect(fetchSpy).not.toHaveBeenCalled();

      // Advance by half the TTL (30 seconds)
      await vi.advanceTimersByTimeAsync(ttlSeconds / 2 * 1000);
      expect(fetchSpy).toHaveBeenCalledOnce();

      // Advance another half TTL
      await vi.advanceTimersByTimeAsync(ttlSeconds / 2 * 1000);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      // Stop and verify no more calls
      stop();
      await vi.advanceTimersByTimeAsync(ttlSeconds * 1000);
      expect(fetchSpy).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });
});
