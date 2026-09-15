import React from "react";
import { KeyRound, IdCard } from "lucide-react";

export default function Header({ onAir, nowPlaying, onOpenKeyManager, onOpenLicenseStatus }) {
  return (
    <header
      data-testid="app-header"
      className="flex items-center justify-between px-6 py-3 border-b border-[var(--hl-line)] bg-[var(--hl-panel)]"
    >
      <div className="flex items-center gap-3">
        <img
          src="/logo.jpg"
          alt="Hot Live 95 Detroit A.I. Radio"
          className="h-14 w-auto rounded-lg object-contain"
          data-testid="app-logo"
        />
        <div className="hidden sm:block border-l border-[var(--hl-line)] pl-3">
          <div className="font-display text-base font-600 leading-none tracking-wide">
            DJ <span className="hl-text-fire">PLAYOUT</span> STUDIO
          </div>
          <div className="text-[10px] text-[var(--hl-muted)] tracking-[0.2em] uppercase mt-1">
            Space play · ← → skip · ↑ ↓ vol
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button
          data-testid="open-license-status"
          onClick={onOpenLicenseStatus}
          className="h-9 px-3 grid place-items-center rounded-md border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:border-[var(--hl-fire)] transition"
          title="My License — check your key status"
        >
          <span className="flex items-center gap-1.5 text-xs font-600"><IdCard size={15} /> My License</span>
        </button>
        <button
          data-testid="open-key-manager"
          onClick={onOpenKeyManager}
          className="h-9 w-9 grid place-items-center rounded-md border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:border-[var(--hl-amber)] transition"
          title="Key Manager (admin)"
        >
          <KeyRound size={16} />
        </button>
        {nowPlaying && (
          <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-full bg-black/40 border border-[var(--hl-line)]">
            <div className="flex items-end gap-[3px] h-4">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className="hl-eq-bar"
                  style={{
                    animationDelay: `${i * 0.15}s`,
                    animationPlayState: onAir ? "running" : "paused",
                    height: onAir ? undefined : "25%",
                  }}
                />
              ))}
            </div>
            <span
              className="text-sm text-[var(--hl-text)] max-w-[280px] truncate"
              data-testid="header-now-playing"
            >
              {nowPlaying}
            </span>
          </div>
        )}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            onAir
              ? "border-[var(--hl-onair)] bg-[rgba(255,23,68,0.12)]"
              : "border-[var(--hl-line)] bg-black/40"
          }`}
          data-testid="on-air-indicator"
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              onAir ? "bg-[var(--hl-onair)] hl-onair-dot" : "bg-[#555]"
            }`}
          />
          <span
            className={`font-display text-sm font-600 tracking-widest ${
              onAir ? "text-[var(--hl-onair)]" : "text-[var(--hl-muted)]"
            }`}
          >
            {onAir ? "ON AIR" : "OFF AIR"}
          </span>
        </div>
      </div>
    </header>
  );
}
