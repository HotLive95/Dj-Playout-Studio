import React, { useState, useRef, useEffect } from "react";
import { Sunrise, X } from "lucide-react";

export const WakeTimer = ({ scheduledLabel, onSet, onCancel }) => {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState("06:00");
  const ref = useRef(null);
  const active = !!scheduledLabel;

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
        data-testid="wake-timer-button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-600 border transition ${
          active
            ? "border-[var(--hl-fire)] text-[var(--hl-fire)] bg-[rgba(255,90,31,0.1)]"
            : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:border-[var(--hl-fire)]"
        }`}
        title="Wake — auto-start playout at a set time"
      >
        <Sunrise size={15} />
        {active ? (
          <span data-testid="wake-timer-label" className="tabular-nums">
            {scheduledLabel}
          </span>
        ) : (
          "Wake"
        )}
      </button>
      {open && (
        <div
          data-testid="wake-timer-menu"
          className="absolute bottom-full right-0 mb-2 w-56 rounded-lg border border-[var(--hl-line)] bg-[var(--hl-panel)] shadow-2xl p-2 z-50"
        >
          <div className="px-1 py-1 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">
            Auto-start playout at
          </div>
          <div className="flex items-center gap-2 px-1 py-1">
            <input
              data-testid="wake-time-input"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="flex-1 bg-black/50 border border-[var(--hl-line)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--hl-fire)]"
            />
            <button
              data-testid="wake-set"
              onClick={() => {
                if (time) {
                  onSet(time);
                  setOpen(false);
                }
              }}
              className="px-3 py-1.5 rounded hl-fire-gradient text-white text-xs font-700"
            >
              Set
            </button>
          </div>
          <p className="px-1 pt-1 text-[10px] text-[var(--hl-muted)] leading-relaxed">
            Fades your show up gently at the set time — great for morning launches.
          </p>
          {active && (
            <button
              data-testid="wake-cancel"
              onClick={() => {
                onCancel();
                setOpen(false);
              }}
              className="w-full flex items-center gap-1.5 justify-center mt-1.5 px-2 py-1.5 rounded text-xs font-600 text-[var(--hl-onair)] border border-[var(--hl-onair)] hover:bg-[rgba(255,23,68,0.12)]"
            >
              <X size={13} /> Cancel wake
            </button>
          )}
        </div>
      )}
    </div>
  );
};
