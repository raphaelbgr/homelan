import type { LanDevice } from "@homelan/shared";

export function DeviceList({ devices }: { devices: LanDevice[] }) {
  if (devices.length === 0) {
    return <p className="text-gray-600 text-xs text-center py-2">No devices discovered</p>;
  }
  return (
    <div className="space-y-1 max-h-40 overflow-y-auto">
      {devices.map((d) => (
        <div key={d.ip} className="flex items-center gap-2 px-2 py-1 rounded bg-gray-900/50 text-xs">
          <span className="text-blue-400 w-28 shrink-0 font-mono">{d.ip}</span>
          <span className="text-gray-300 flex-1 truncate">{d.hostname ?? d.ip}</span>
          <span className="text-gray-500 shrink-0">{d.deviceType ?? ""}</span>
        </div>
      ))}
    </div>
  );
}
