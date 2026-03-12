// Required devDependencies (not yet in package.json):
//   @testing-library/react
//   @testing-library/jest-dom
//   jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePairing } from "./usePairing";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch(response: Partial<Response>) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(response);
}

function mockFetchReject(error: Error) {
  (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(error);
}

describe("usePairing", () => {
  it("starts in idle state with no error", () => {
    const { result } = renderHook(() => usePairing());
    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();
  });

  it("pair() returns true on successful fetch (200)", async () => {
    mockFetch({ ok: true, status: 200 });

    const { result } = renderHook(() => usePairing());
    let success: boolean;

    await act(async () => {
      success = await result.current.pair("homelan://pair?token=abc");
    });

    expect(success!).toBe(true);
  });

  it("pair() returns false on failed fetch (non-200)", async () => {
    mockFetch({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: "Invalid token" }),
    });

    const { result } = renderHook(() => usePairing());
    let success: boolean;

    await act(async () => {
      success = await result.current.pair("homelan://pair?token=bad");
    });

    expect(success!).toBe(false);
  });

  it("pair() returns false on network error (fetch throws)", async () => {
    mockFetchReject(new Error("Failed to fetch"));

    const { result } = renderHook(() => usePairing());
    let success: boolean;

    await act(async () => {
      success = await result.current.pair("homelan://pair?token=abc");
    });

    expect(success!).toBe(false);
  });

  it("transitions idle → pairing → success on successful pair", async () => {
    let resolveFetch!: (value: Partial<Response>) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );

    const { result } = renderHook(() => usePairing());
    expect(result.current.state).toBe("idle");

    let pairPromise: Promise<boolean>;
    act(() => {
      pairPromise = result.current.pair("homelan://pair?token=abc");
    });

    // After calling pair but before fetch resolves, state should be "pairing"
    expect(result.current.state).toBe("pairing");

    await act(async () => {
      resolveFetch({ ok: true, status: 200 });
      await pairPromise!;
    });

    expect(result.current.state).toBe("success");
  });

  it("transitions idle → pairing → error on failure", async () => {
    let rejectFetch!: (reason: Error) => void;
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectFetch = reject;
      })
    );

    const { result } = renderHook(() => usePairing());
    expect(result.current.state).toBe("idle");

    let pairPromise: Promise<boolean>;
    act(() => {
      pairPromise = result.current.pair("homelan://pair?token=abc");
    });

    expect(result.current.state).toBe("pairing");

    await act(async () => {
      rejectFetch(new Error("Connection refused"));
      await pairPromise!;
    });

    expect(result.current.state).toBe("error");
  });

  it("captures error message from response body", async () => {
    mockFetch({
      ok: false,
      status: 422,
      json: () => Promise.resolve({ error: "Token expired" }),
    });

    const { result } = renderHook(() => usePairing());

    await act(async () => {
      await result.current.pair("homelan://pair?token=expired");
    });

    expect(result.current.error).toBe("Token expired");
  });

  it("falls back to status code when response body parse fails", async () => {
    mockFetch({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    });

    const { result } = renderHook(() => usePairing());

    await act(async () => {
      await result.current.pair("homelan://pair?token=abc");
    });

    expect(result.current.error).toBe("Error 500");
  });

  it("captures network error message", async () => {
    mockFetchReject(new Error("Failed to fetch"));

    const { result } = renderHook(() => usePairing());

    await act(async () => {
      await result.current.pair("homelan://pair?token=abc");
    });

    expect(result.current.error).toBe("Failed to fetch");
  });

  it("pair() with empty URL still attempts fetch", async () => {
    mockFetch({ ok: true, status: 200 });

    const { result } = renderHook(() => usePairing());

    await act(async () => {
      await result.current.pair("");
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:30001/pair",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ inviteUrl: "" }),
      })
    );
  });

  it("reset() returns state to idle and clears error", async () => {
    mockFetchReject(new Error("fail"));

    const { result } = renderHook(() => usePairing());

    await act(async () => {
      await result.current.pair("homelan://pair?token=abc");
    });

    expect(result.current.state).toBe("error");
    expect(result.current.error).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBeNull();
  });
});
