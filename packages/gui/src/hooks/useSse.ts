import { useEffect } from "react";
import type { DaemonStatus, LanDevice, TunnelMode, ConnectionState } from "@homelan/shared";

const IPC_BASE = "http://localhost:30001";

interface SseHandlers {
  onStatusChange: (patch: Partial<DaemonStatus>) => void;
  onDevicesUpdate: (devices: LanDevice[]) => void;
  onProgress: (step: string) => void;
  onError: (msg: string) => void;
}

export function useSse(handlers: SseHandlers) {
  useEffect(() => {
    let es: EventSource | null = null;

    function connect() {
      es = new EventSource(`${IPC_BASE}/events`);

      es.addEventListener("state_changed", (e) => {
        const state: ConnectionState = JSON.parse((e as MessageEvent).data);
        handlers.onStatusChange({ state });
      });

      es.addEventListener("mode_changed", (e) => {
        const mode: TunnelMode = JSON.parse((e as MessageEvent).data);
        handlers.onStatusChange({ mode });
      });

      es.addEventListener("devices_updated", (e) => {
        const devices: LanDevice[] = JSON.parse((e as MessageEvent).data);
        handlers.onDevicesUpdate(devices);
      });

      es.addEventListener("connection_progress", (e) => {
        const step: string = JSON.parse((e as MessageEvent).data);
        handlers.onProgress(step);
      });

      es.addEventListener("error_event", (e) => {
        const msg: string = JSON.parse((e as MessageEvent).data);
        handlers.onError(msg);
      });

      es.onerror = () => {
        // Daemon not running or connection lost — silent retry via EventSource auto-reconnect
      };
    }

    connect();
    return () => es?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
