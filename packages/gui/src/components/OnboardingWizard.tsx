import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { usePairing } from "../hooks/usePairing";

interface OnboardingWizardProps {
  onComplete: () => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [inviteUrl, setInviteUrl] = useState("");
  const { state, error, pair } = usePairing();

  const handlePair = async () => {
    if (!inviteUrl.trim()) return;
    const success = await pair(inviteUrl.trim());
    if (success) {
      setStep(2);
    }
  };

  return (
    <div className="bg-gray-900 rounded-xl p-6 w-full max-w-sm flex flex-col gap-4">
      {step === 1 ? (
        <>
          <div>
            <h2 className="text-lg font-semibold text-white">Pair with Home Server</h2>
            <p className="text-sm text-gray-400 mt-1">
              Paste your invite link below, or generate a QR code on your home server and scan it
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={inviteUrl}
              onChange={(e) => setInviteUrl(e.target.value)}
              placeholder="homelan://pair?token=..."
              className="w-full bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-blue-500 placeholder-gray-600"
              onKeyDown={(e) => {
                if (e.key === "Enter" && state !== "pairing") void handlePair();
              }}
            />

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button
              onClick={() => void handlePair()}
              disabled={state === "pairing"}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
            >
              {state === "pairing" ? "Pairing..." : "Pair"}
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-col items-center gap-3 py-2">
            <CheckCircle2 className="w-16 h-16 text-green-400" />
            <div className="text-center">
              <h2 className="text-lg font-semibold text-white">Paired Successfully</h2>
              <p className="text-sm text-gray-400 mt-1">
                You&apos;re now connected to your home network.
              </p>
            </div>
          </div>

          <button
            onClick={onComplete}
            className="w-full bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            Get Started
          </button>
        </>
      )}
    </div>
  );
}
