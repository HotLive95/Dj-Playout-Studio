import React, { useState } from "react";
import { X, Clock, Power } from "lucide-react";

export default function ScheduleModal({ playlist, onClose, onSave }) {
  const s = playlist.schedule || { enabled: false, start: "09:00", end: "12:00", autoStop: true };
  const [enabled, setEnabled] = useState(s.enabled);
  const [start, setStart] = useState(s.start);
  const [end, setEnd] = useState(s.end);
  const [autoStop, setAutoStop] = useState(s.autoStop !== false);

  const save = () => {
    onSave(playlist.id, { enabled, start, end, autoStop });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="schedule-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Show Schedule</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--hl-muted)]">
            Auto-start <span className="text-[var(--hl-fire)] font-600">{playlist.name}</span> at
            your show time, and stop it when the show ends.
          </p>

          <button
            data-testid="schedule-enabled-toggle"
            onClick={() => setEnabled((v) => !v)}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition ${
              enabled
                ? "border-[var(--hl-fire)] bg-[rgba(255,90,31,0.1)]"
                : "border-[var(--hl-line)]"
            }`}
          >
            <span className="flex items-center gap-2 font-600">
              <Power size={16} className={enabled ? "text-[var(--hl-fire)]" : "text-[var(--hl-muted)]"} />
              Scheduled auto-start
            </span>
            <span className={`text-sm ${enabled ? "text-[var(--hl-fire)]" : "text-[var(--hl-muted)]"}`}>
              {enabled ? "ON" : "OFF"}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                Show start
              </label>
              <input
                data-testid="schedule-start"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                disabled={!enabled}
                className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)] disabled:opacity-40"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                Show end
              </label>
              <input
                data-testid="schedule-end"
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                disabled={!enabled}
                className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)] disabled:opacity-40"
              />
            </div>
          </div>

          <button
            data-testid="schedule-autostop-toggle"
            onClick={() => setAutoStop((v) => !v)}
            disabled={!enabled}
            className={`w-full flex items-center justify-between px-4 py-2.5 rounded-lg border text-sm transition disabled:opacity-40 ${
              autoStop ? "border-[var(--hl-amber)] text-[var(--hl-amber)]" : "border-[var(--hl-line)] text-[var(--hl-muted)]"
            }`}
          >
            Auto-stop at show end
            <span>{autoStop ? "ON" : "OFF"}</span>
          </button>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-white"
            >
              Cancel
            </button>
            <button
              data-testid="schedule-save"
              onClick={save}
              className="px-4 py-2 rounded-lg hl-fire-gradient text-white font-600"
            >
              Save Schedule
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
