import { useState, useCallback } from "react";

const IPC_BASE = "http://localhost:30001";

export type PairingState = "idle" | "pairing" | "success" | "error";

export interface UsePairingResult {
  state: PairingState;
  error: string | null;
  /** Returns true on success, false on error */
  pair(inviteUrl: string): Promise<boolean>;
  reset(): void;
}

export function usePairing(): UsePairingResult {
  const [state, setState] = useState<PairingState>("idle");
  const [error, setError] = useState<string | null>(null);

  const pair = useCallback(async (inviteUrl: string): Promise<boolean> => {
    setState("pairing");
    setError(null);
    try {
      const res = await fetch(`${IPC_BASE}/pair`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteUrl }),
      });
      if (res.ok) {
        setState("success");
        return true;
      } else {
        let message = `Error ${res.status}`;
        try {
          const body = (await res.json()) as { error?: string };
          if (body.error) message = body.error;
        } catch {
          // ignore parse failure
        }
        setError(message);
        setState("error");
        return false;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setState("error");
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setError(null);
  }, []);

  return { state, error, pair, reset };
}
