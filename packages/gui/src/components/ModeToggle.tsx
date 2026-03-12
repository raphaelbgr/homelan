import type { TunnelMode } from "@homelan/shared";
import { cn } from "../lib/utils";

interface Props {
  mode: TunnelMode;
  disabled: boolean;
  onChange: (mode: TunnelMode) => void;
}

const options: { value: TunnelMode; label: string; desc: string }[] = [
  { value: "lan-only", label: "LAN Only", desc: "Access home network, keep your own internet" },
  { value: "full-gateway", label: "Full Gateway", desc: "Route all traffic through home network" },
];

export function ModeToggle({ mode, disabled, onChange }: Props) {
  return (
    <div className={cn("space-y-1", disabled && "opacity-50 pointer-events-none")}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "w-full text-left px-3 py-2 rounded-lg border transition-colors",
            mode === opt.value
              ? "border-blue-500 bg-blue-500/10 text-white"
              : "border-gray-700 text-gray-400 hover:border-gray-600"
          )}
        >
          <div className="text-sm font-medium">{opt.label}</div>
          <div className="text-xs opacity-70">{opt.desc}</div>
        </button>
      ))}
    </div>
  );
}
