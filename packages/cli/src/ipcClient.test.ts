import { describe, it, expect, vi, beforeEach } from "vitest";
import { IpcClient, IpcClientError } from "./ipcClient.js";

describe("IpcClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("Test 1: get() returns parsed JSON on 200", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, uptimeMs: 1234 }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new IpcClient();
    const result = await client.get<{ ok: boolean; uptimeMs: number }>("/health");

    expect(result).toEqual({ ok: true, uptimeMs: 1234 });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:30001/health",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("Test 2: post() sends correct Content-Type and body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, message: "connecting" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new IpcClient();
    const result = await client.post<{ ok: boolean; message: string }>("/connect", {
      mode: "lan-only",
    });

    expect(result).toEqual({ ok: true, message: "connecting" });
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:30001/connect",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ mode: "lan-only" }),
      })
    );
  });

  it("Test 3: isRunning() returns false when ECONNREFUSED", async () => {
    const connRefusedError = new Error("connect ECONNREFUSED 127.0.0.1:30001");
    (connRefusedError as NodeJS.ErrnoException).cause = { code: "ECONNREFUSED" };
    const mockFetch = vi.fn().mockRejectedValue(connRefusedError);
    vi.stubGlobal("fetch", mockFetch);

    const client = new IpcClient();
    const running = await client.isRunning();

    expect(running).toBe(false);
  });

  it("Test 4: get() throws IpcClientError with statusCode=404 on 404 response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: "not found" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const client = new IpcClient();

    await expect(client.get("/nonexistent")).rejects.toThrow(IpcClientError);
    await expect(client.get("/nonexistent")).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
