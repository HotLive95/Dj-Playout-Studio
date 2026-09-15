import React, { useState } from "react";
import { X, SlidersHorizontal } from "lucide-react";

const DEFAULTS = { highpass: 120, lowpass: 12000, drive: 0.2, echo: 0, reverb: 0 };

export default function CustomFxModal({ value, onClose, onSave }) {
  const [fx, setFx] = useState({ ...DEFAULTS, ...(value || {}) });
  const set = (k, v) => setFx((p) => ({ ...p, [k]: v }));

  const Row = ({ k, label, min, max, step, unit }) => (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-[var(--hl-muted)]">{label}</span>
        <span className="tabular-nums">
          {fx[k]}
          {unit}
        </span>
      </div>
      <input
        data-testid={`customfx-${k}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={fx[k]}
        onChange={(e) => set(k, Number(e.target.value))}
        className="hl-range w-full"
      />
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm grid place-items-center p-4"
      data-testid="customfx-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Custom Voice FX</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--hl-muted)]">
            Dial in your own mic sound, then save it as the <b>Custom</b> FX preset.
          </p>
          <Row k="highpass" label="Low cut (highpass)" min={20} max={2000} step={10} unit="Hz" />
          <Row k="lowpass" label="High cut (lowpass)" min={1000} max={18000} step={100} unit="Hz" />
          <Row k="drive" label="Warmth / drive" min={0} max={1} step={0.05} unit="" />
          <Row k="echo" label="Echo" min={0} max={1} step={0.05} unit="" />
          <Row k="reverb" label="Reverb" min={0} max={1} step={0.05} unit="" />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={onClose} className="px-4 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-white">
              Cancel
            </button>
            <button
              data-testid="customfx-save"
              onClick={() => {
                onSave(fx);
                onClose();
              }}
              className="px-4 py-2 rounded-lg hl-fire-gradient text-white font-600"
            >
              Save Preset
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
