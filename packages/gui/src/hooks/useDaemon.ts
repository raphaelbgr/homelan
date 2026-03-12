import { useState, useEffect, useCallback } from "react";
import type { DaemonStatus, TunnelMode } from "@homelan/shared";

const IPC_BASE = "http://localhost:30001";

export type DaemonError =
  | "daemon_not_running"
  | "relay_unreachable"
  | "connect_failed"
  | "unknown";

function mapError(err: unknown): DaemonError {
  const msg = String(err);
  if (msg.includes("ECONNREFUSED") || msg.includes("fetch")) return "daemon_not_running";
  if (msg.includes("relay") || msg.includes("unreachable")) return "relay_unreachable";
  if (msg.includes("connect")) return "connect_failed";
  return "unknown";
}

export function useDaemon() {
  const [status, setStatus] = useState<DaemonStatus | null>(null);
  const [error, setError] = useState<DaemonError | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${IPC_BASE}/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DaemonStatus = await res.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      setError(mapError(err));
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const connect = useCallback(async (mode: TunnelMode) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${IPC_BASE}/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${IPC_BASE}/disconnect`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const switchMode = useCallback(async (mode: TunnelMode) => {
    try {
      const res = await fetch(`${IPC_BASE}/switch-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError(mapError(err));
    }
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return { status, setStatus, error, dismissError, loading, connect, disconnect, switchMode };
}
