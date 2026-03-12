import { X } from "lucide-react";
import type { DaemonError } from "../hooks/useDaemon";

const ERROR_MESSAGES: Record<DaemonError, string> = {
  daemon_not_running: "HomeLAN service is not running. Start the daemon first.",
  relay_unreachable: "Relay server is unreachable. Check your internet connection.",
  connect_failed: "Connection failed. The home server may be offline.",
  unknown: "An unexpected error occurred. Please try again.",
};

export function ErrorBanner({ error, onDismiss }: { error: DaemonError; onDismiss: () => void }) {
  return (
    <div className="flex items-center gap-2 bg-red-900/40 border border-red-800 rounded-lg px-3 py-2 text-sm text-red-200">
      <span className="flex-1">{ERROR_MESSAGES[error]}</span>
      <button onClick={onDismiss} className="text-red-400 hover:text-red-200 shrink-0">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
