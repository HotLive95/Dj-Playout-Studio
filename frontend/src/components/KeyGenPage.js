import React from "react";
import { Radio, ExternalLink } from "lucide-react";
import KeyManager from "./KeyManager";

// Standalone key generator (route: /keygen). Opens straight to the Key Manager,
// no activation gate — bookmark it to make DJ keys without launching the studio.
export default function KeyGenPage() {
  return (
    <div className="min-h-screen bg-[var(--hl-bg)] text-[var(--hl-text)] relative" data-testid="keygen-page">
      <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(800px 400px at 50% -10%, rgba(255,90,31,0.18), transparent 60%)" }} />
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--hl-line)]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 grid place-items-center rounded-xl hl-fire-gradient">
            <Radio size={18} className="text-white" />
          </div>
          <div>
            <div className="font-display text-lg tracking-wide leading-none">HOT LIVE 95 — Key Generator</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--hl-muted)]">Admin · Standalone</div>
          </div>
        </div>
        <a href="/" data-testid="keygen-open-app" className="inline-flex items-center gap-1.5 text-xs text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">
          Open the Studio app <ExternalLink size={12} />
        </a>
      </div>
      <div className="relative z-10 grid place-items-center px-4 py-8 text-center">
        <p className="text-sm text-[var(--hl-muted)] max-w-md">
          Generate, email, renew, and revoke DJ activation keys here. Enter the admin passphrase to begin.
        </p>
      </div>
      {/* The Key Manager renders its own full-screen passphrase gate + generator */}
      <KeyManager onClose={() => { window.location.href = "/"; }} />
    </div>
  );
}
