import type { DaemonStatus } from "@homelan/shared";

function formatUptime(seconds: number): string {
  if (!seconds) return "--";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function StatusSection({ status }: { status: DaemonStatus | null }) {
  if (!status) return null;
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      {[
        { label: "State", value: status.state },
        { label: "Latency", value: status.latencyMs != null ? `${status.latencyMs}ms` : "--" },
        { label: "Uptime", value: formatUptime(status.uptimeMs) },
      ].map(({ label, value }) => (
        <div key={label} className="bg-gray-900 rounded-lg p-2">
          <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
          <div className="text-sm font-medium text-white mt-0.5">{value}</div>
        </div>
      ))}
    </div>
  );
}
