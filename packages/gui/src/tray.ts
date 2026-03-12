import { listen } from "@tauri-apps/api/event";
import type { TunnelMode } from "@homelan/shared";

const IPC_BASE = "http://localhost:30001";

async function ipcPost(path: string, body?: unknown): Promise<void> {
  await fetch(`${IPC_BASE}${path}`, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Register tray event listeners. Call once on app mount.
 * Returns a cleanup function that unregisters all listeners.
 */
export async function registerTrayListeners(): Promise<() => void> {
  const unlistenConnect = await listen("tray-connect", async () => {
    // Read current mode from status before connecting
    try {
      const res = await fetch(`${IPC_BASE}/status`);
      const status = await res.json();
      await ipcPost("/connect", { mode: status.mode ?? "lan-only" });
    } catch {
      // Daemon not running — silently ignore (tray action from hidden window)
    }
  });

  const unlistenDisconnect = await listen("tray-disconnect", async () => {
    try {
      await ipcPost("/disconnect");
    } catch {
      // ignore
    }
  });

  const unlistenMode = await listen<TunnelMode>("tray-switch-mode", async (event) => {
    try {
      await ipcPost("/switch-mode", { mode: event.payload });
    } catch {
      // ignore
    }
  });

  return () => {
    unlistenConnect();
    unlistenDisconnect();
    unlistenMode();
  };
}
