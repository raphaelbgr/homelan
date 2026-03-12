import { Loader2 } from "lucide-react";
import type { ConnectionState, TunnelMode } from "@homelan/shared";
import { cn } from "../lib/utils";

interface Props {
  state: ConnectionState;
  loading: boolean;
  mode: TunnelMode;
  onConnect: () => void;
  onDisconnect: () => void;
}

const stateConfig: Record<ConnectionState, { label: string; color: string }> = {
  idle: { label: "Connect", color: "bg-gray-700 hover:bg-gray-600" },
  connecting: { label: "Connecting...", color: "bg-yellow-600" },
  disconnecting: { label: "Disconnecting...", color: "bg-yellow-600" },
  connected: { label: "Disconnect", color: "bg-green-600 hover:bg-green-500" },
  error: { label: "Connect", color: "bg-red-700 hover:bg-red-600" },
};

export function ConnectButton({ state, loading, onConnect, onDisconnect }: Props) {
  const cfg = stateConfig[state];
  const isConnected = state === "connected";
  const isBusy = state === "connecting" || state === "disconnecting" || loading;

  return (
    <button
      onClick={isConnected ? onDisconnect : onConnect}
      disabled={isBusy}
      className={cn(
        "w-full h-16 rounded-xl text-white text-lg font-semibold transition-all duration-200",
        "flex items-center justify-center gap-2",
        "disabled:opacity-70 disabled:cursor-not-allowed",
        cfg.color
      )}
    >
      {isBusy && <Loader2 className="h-5 w-5 animate-spin" />}
      {cfg.label}
    </button>
  );
}
