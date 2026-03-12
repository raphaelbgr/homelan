const STEP_LABELS: Record<string, string> = {
  discovering_peer: "Discovering peer...",
  trying_direct: "Testing direct connection...",
  trying_relay: "Using relay...",
  connected: "Connected",
};

export function ProgressLog({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-1">
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2 text-xs text-gray-400">
          <span className="text-green-500">&#10003;</span>
          <span>{STEP_LABELS[step] ?? step}</span>
        </div>
      ))}
    </div>
  );
}
