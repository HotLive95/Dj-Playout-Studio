import React from "react";
import { Headphones, Play, Pause, Square } from "lucide-react";
import { formatTime } from "../lib/format";

export default function CuePanel({
  cueTrack,
  cue,
  onToggle,
  onStop,
  onSeek,
  devices,
  programSink,
  cueSink,
  onProgramSink,
  onCueSink,
}) {
  const pct = cue.duration ? (cue.currentTime / cue.duration) * 100 : 0;
  const hasDevices = devices && devices.length > 0;

  const deviceLabel = (d, i) => d.label || `Output ${i + 1}`;

  return (
    <div
      className="flex flex-wrap md:flex-nowrap items-center gap-2 md:gap-4 px-3 md:px-6 py-2 border-t border-[var(--hl-line)] bg-[#0e0e12]"
      data-testid="cue-panel"
    >
      <div className="flex items-center gap-2 shrink-0">
        <div
          className={`h-8 w-8 grid place-items-center rounded-md ${
            cueTrack ? "bg-[rgba(255,171,0,0.15)] text-[var(--hl-amber)]" : "text-[var(--hl-muted)]"
          }`}
        >
          <Headphones size={17} />
        </div>
        <span className="font-display text-xs tracking-[0.2em] text-[var(--hl-muted)]">CUE</span>
      </div>

      {cueTrack ? (
        <>
          <button
            data-testid="cue-toggle-button"
            onClick={onToggle}
            className="h-8 w-8 grid place-items-center rounded-full bg-[var(--hl-amber)] text-black hover:brightness-110"
            title={cue.isPlaying ? "Pause preview" : "Play preview"}
          >
            {cue.isPlaying ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
          </button>
          <span
            className="text-sm truncate max-w-[220px] text-[var(--hl-amber)]"
            data-testid="cue-track-name"
          >
            {cueTrack.name}
          </span>
          <span className="text-xs text-[var(--hl-muted)] tabular-nums">
            {formatTime(cue.currentTime)}
          </span>
          <div
            className="relative flex-1 h-1.5 rounded-full bg-[#2a2a31] cursor-pointer min-w-[80px]"
            data-testid="cue-seek-bar"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (cue.duration || 0));
            }}
          >
            <div
              className="absolute left-0 top-0 h-full rounded-full bg-[var(--hl-amber)]"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs text-[var(--hl-muted)] tabular-nums">
            {formatTime(cue.duration)}
          </span>
          <button
            data-testid="cue-stop-button"
            onClick={onStop}
            className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:bg-white/10"
            title="Stop preview"
          >
            <Square size={15} />
          </button>
        </>
      ) : (
        <span className="flex-1 text-sm text-[var(--hl-muted)]">
          Pre-listen the next track on your headphones — click the{" "}
          <Headphones size={13} className="inline -mt-0.5" /> on any track.
        </span>
      )}

      {hasDevices && (
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto md:shrink-0">
          <label className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">
            Air out
          </label>
          <select
            data-testid="program-output-select"
            value={programSink}
            onChange={(e) => onProgramSink(e.target.value)}
            className="bg-black/50 border border-[var(--hl-line)] rounded-md text-xs px-2 py-1 outline-none focus:border-[var(--hl-fire)] max-w-[150px]"
          >
            <option value="">Default</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {deviceLabel(d, i)}
              </option>
            ))}
          </select>
          <label className="text-[10px] uppercase tracking-wider text-[var(--hl-amber)]">
            Cue out
          </label>
          <select
            data-testid="cue-output-select"
            value={cueSink}
            onChange={(e) => onCueSink(e.target.value)}
            className="bg-black/50 border border-[var(--hl-line)] rounded-md text-xs px-2 py-1 outline-none focus:border-[var(--hl-amber)] max-w-[150px]"
          >
            <option value="">Default</option>
            {devices.map((d, i) => (
              <option key={d.deviceId || i} value={d.deviceId}>
                {deviceLabel(d, i)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
