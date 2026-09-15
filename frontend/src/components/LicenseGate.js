import React, { useState } from "react";
import { KeyRound, ShieldCheck, Lock } from "lucide-react";

const YEAR = new Date().getFullYear();

export default function LicenseGate({ license, onActivate, onAcceptLegal }) {
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const activated = !!license?.activated;
  const notice = license?.lockedNotice
    ? "This copy was activated on a different computer. Your key is locked to one machine — please re-enter it to activate here."
    : license?.expiredNotice
    ? "This license has expired. Enter a current key to continue."
    : license?.revokedNotice
    ? "This license is no longer active (revoked or removed). Contact your station manager for a new key."
    : "";

  const submitKey = async () => {
    setBusy(true);
    setError("");
    const res = await onActivate(keyInput);
    setBusy(false);
    if (!res?.ok) setError(res?.message || "That activation key isn't valid.");
  };

  return (
    <div className="h-screen w-screen hl-app-bg grid place-items-center p-6" data-testid="license-gate">
      <div className="w-full max-w-lg hl-panel rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--hl-line)]">
          <img src="/logo.jpg" alt="Hot Live 95" className="h-12 w-auto rounded-md object-contain" />
          <div>
            <div className="font-display text-lg font-700">DJ PLAYOUT STUDIO</div>
            <div className="text-[10px] tracking-[0.2em] uppercase text-[var(--hl-muted)]">
              Hot Live 95 Detroit · A.I. Radio
            </div>
          </div>
        </div>

        {!activated ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--hl-fire)]">
              <Lock size={18} />
              <h2 className="font-display text-xl">Activate this app</h2>
            </div>
            <p className="text-sm text-[var(--hl-muted)]">
              This copy is licensed to authorized Hot Live 95 DJs only. Enter the activation key
              you were given to unlock the studio. You only need to do this once on this computer.
            </p>
            {notice && (
              <div
                className="text-sm rounded-lg border border-[var(--hl-onair)] bg-[rgba(255,23,68,0.1)] text-[var(--hl-onair)] px-3 py-2"
                data-testid="license-locked-notice"
              >
                {notice}
              </div>
            )}
            <input
              data-testid="license-key-input"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitKey()}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-4 py-3 text-center tracking-[0.3em] font-display text-lg outline-none focus:border-[var(--hl-fire)] uppercase"
            />
            {error && (
              <div className="text-[var(--hl-onair)] text-sm" data-testid="license-error">
                {error}
              </div>
            )}
            <button
              data-testid="license-activate-button"
              onClick={submitKey}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg hl-fire-gradient text-white font-700 hover:brightness-110 transition disabled:opacity-60"
            >
              <KeyRound size={18} /> {busy ? "Checking…" : "Activate"}
            </button>
            <p className="text-[11px] text-[var(--hl-muted)] text-center">
              Don't have a key? Contact your Hot Live 95 station manager.
            </p>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--hl-fire)]">
              <ShieldCheck size={18} />
              <h2 className="font-display text-xl">License Agreement</h2>
            </div>
            <div
              className="text-sm text-[var(--hl-muted)] space-y-3 max-h-[300px] overflow-y-auto hl-scroll pr-2 leading-relaxed"
              data-testid="legal-text"
            >
              <p className="text-[var(--hl-text)] font-600">
                © {YEAR} Hot Live 95 Detroit — A.I. Radio. All rights reserved.
              </p>
              <p>
                Hot Live 95 DJ Playout Studio (the "Software") is proprietary and licensed, not
                sold, for use solely by DJs and staff authorized by Hot Live 95 Detroit.
              </p>
              <p>
                You may install and use the Software on stations and computers you operate for
                Hot Live 95 broadcasting. You may <span className="text-[var(--hl-text)]">not</span>{" "}
                copy, redistribute, resell, rent, sublicense, reverse-engineer, or share your
                activation key with unauthorized parties.
              </p>
              <p>
                All trademarks, logos, branding, and the "Hot Live 95" name remain the property of
                Hot Live 95 Detroit. Audio content you load remains your own responsibility; you
                are responsible for holding the rights to any material you broadcast.
              </p>
              <p>
                The Software is provided "as is" without warranty of any kind. Continued use
                constitutes acceptance of these terms. Violation may result in license revocation
                and legal action.
              </p>
            </div>
            <label className="flex items-start gap-3 text-sm cursor-pointer select-none">
              <input type="checkbox" id="agree" data-testid="legal-agree-checkbox" className="mt-1 accent-[var(--hl-fire)]" />
              <span>I have read and agree to the Hot Live 95 license agreement.</span>
            </label>
            <button
              data-testid="legal-accept-button"
              onClick={() => {
                const cb = document.getElementById("agree");
                if (cb && cb.checked) onAcceptLegal();
                else setError("Please tick the box to continue.");
              }}
              className="w-full py-3 rounded-lg hl-fire-gradient text-white font-700 hover:brightness-110 transition"
            >
              Agree &amp; Enter Studio
            </button>
            {error && <div className="text-[var(--hl-onair)] text-sm text-center">{error}</div>}
          </div>
        )}

        <div className="px-6 py-3 border-t border-[var(--hl-line)] text-[10px] text-[var(--hl-muted)] tracking-wide text-center">
          HOT LIVE 95 · A.I. RADIO · DETROIT · © {YEAR}
        </div>
      </div>
    </div>
  );
}
