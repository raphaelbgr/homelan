import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelayClient, RelayClientError } from "./relayClient.js";

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
