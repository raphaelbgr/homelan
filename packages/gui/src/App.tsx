import { useState, useCallback } from "react";
import type { LanDevice, TunnelMode } from "@homelan/shared";
import { useDaemon } from "./hooks/useDaemon";
import { useSse } from "./hooks/useSse";
import { ConnectButton } from "./components/ConnectButton";
import { ModeToggle } from "./components/ModeToggle";
import { StatusSection } from "./components/StatusSection";
import { DeviceList } from "./components/DeviceList";
import { ErrorBanner } from "./components/ErrorBanner";
import { ProgressLog } from "./components/ProgressLog";

export default function App() {
  const { status, setStatus, error, dismissError, loading, connect, disconnect, switchMode } =
    useDaemon();
  const [devices, setDevices] = useState<LanDevice[]>(status?.lanDevices ?? []);
  const [progressSteps, setProgressSteps] = useState<string[]>([]);

  useSse({
    onStatusChange: useCallback(
      (patch) => {
        setStatus((prev) => (prev ? { ...prev, ...patch } : null));
        if (patch.state === "connecting") setProgressSteps([]);
        if (patch.state === "connected" || patch.state === "idle") {
          // keep steps visible briefly then clear
          setTimeout(() => setProgressSteps([]), 3000);
        }
      },
      [setStatus]
    ),
    onDevicesUpdate: setDevices,
    onProgress: useCallback((step: string) => {
      setProgressSteps((prev) => [...prev, step]);
    }, []),
    onError: useCallback(() => {}, []),
  });

  const currentMode: TunnelMode = status?.mode ?? "lan-only";
  const isConnected = status?.state === "connected";

  const handleConnect = () => connect(currentMode);
  const handleModeChange = (mode: TunnelMode) => {
    if (isConnected) switchMode(mode);
    else setStatus((prev) => prev ? { ...prev, mode } : null);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-base font-semibold text-white">HomeLAN</h1>
        <span className="text-xs text-gray-500">localhost:30001</span>
      </div>

      {/* Error banner */}
      {error && <ErrorBanner error={error} onDismiss={dismissError} />}

      {/* Connect button */}
      <ConnectButton
        state={status?.state ?? "idle"}
        loading={loading}
        mode={currentMode}
        onConnect={handleConnect}
        onDisconnect={disconnect}
      />

      {/* Progress during connect */}
      <ProgressLog steps={progressSteps} />

      {/* Mode toggle */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Mode</p>
        <ModeToggle
          mode={currentMode}
          disabled={!isConnected}
          onChange={handleModeChange}
        />
      </div>

      {/* Status */}
      <StatusSection status={status} />

      {/* Device list */}
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
          LAN Devices ({devices.length})
        </p>
        <DeviceList devices={devices} />
      </div>
    </div>
  );
}
