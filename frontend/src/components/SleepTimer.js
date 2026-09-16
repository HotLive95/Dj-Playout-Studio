import React, { useState, useRef, useEffect } from "react";
import { Moon, X } from "lucide-react";

const OPTIONS = [15, 30, 45, 60, 90, 120];

const fmt = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${m}:${p(ss)}`;
};

export const SleepTimer = ({ remainingMs, onStart, onCancel }) => {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef(null);
  const active = remainingMs > 0;

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        data-testid="sleep-timer-button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-600 border transition ${
          active
            ? "border-[var(--hl-amber)] text-[var(--hl-amber)] bg-[rgba(255,171,0,0.1)]"
            : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:border-[var(--hl-amber)]"
        }`}
        title="Sleep timer — fade out and stop after a set time"
      >
        <Moon size={15} />
        {active ? (
          <span data-testid="sleep-timer-remaining" className="tabular-nums">
            {fmt(remainingMs)}
          </span>
        ) : (
          "Sleep"
        )}
      </button>
      {open && (
        <div
          data-testid="sleep-timer-menu"
          className="absolute bottom-full right-0 mb-2 w-44 rounded-lg border border-[var(--hl-line)] bg-[var(--hl-panel)] shadow-2xl p-1.5 z-50"
        >
          <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">
            Fade out &amp; stop in
          </div>
          {OPTIONS.map((m) => (
            <button
              key={m}
              data-testid={`sleep-option-${m}`}
              onClick={() => {
                onStart(m);
                setOpen(false);
              }}
              className="w-full text-left px-2 py-1.5 rounded text-sm hover:bg-white/10 text-[var(--hl-text)]"
            >
              {m >= 60 ? `${m / 60} hour${m > 60 ? "s" : ""}` : `${m} min`}
            </button>
          ))}
          <div className="flex items-center gap-2 px-1 pt-1.5 mt-1 border-t border-[var(--hl-line)]">
            <input
              data-testid="sleep-custom-input"
              type="number"
              min="1"
              max="600"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="min"
              className="w-16 bg-black/50 border border-[var(--hl-line)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--hl-amber)]"
            />
            <button
              data-testid="sleep-custom-set"
              onClick={() => {
                const n = parseInt(custom, 10);
                if (n > 0) {
                  onStart(n);
                  setCustom("");
                  setOpen(false);
                }
              }}
              className="flex-1 px-2.5 py-1.5 rounded bg-[var(--hl-amber)] text-black text-xs font-700"
            >
              Set custom
            </button>
          </div>
          {active && (
            <button
              data-testid="sleep-cancel"
              onClick={() => {
                onCancel();
                setOpen(false);
              }}
              className="w-full flex items-center gap-1.5 justify-center mt-1 px-2 py-1.5 rounded text-xs font-600 text-[var(--hl-onair)] border border-[var(--hl-onair)] hover:bg-[rgba(255,23,68,0.12)]"
            >
              <X size={13} /> Cancel timer
            </button>
          )}
        </div>
      )}
    </div>
  );
};
