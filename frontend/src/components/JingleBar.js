import React, { useRef, useState } from "react";
import { Zap, Plus, X, Square, Volume2 } from "lucide-react";

const PAD_COUNT = 6;

export default function JingleBar({ jingles, isElectron, onAssignFile, onAssignDialog, onPlay, onClear, onSetVolume, duckDepth, onSetDuckDepth, duckMs, onSetDuckMs, onStop }) {
  const inputRef = useRef(null);
  const targetIndex = useRef(null);
  const [dragOver, setDragOver] = useState(null);

  const assign = (i) => {
    if (isElectron) {
      onAssignDialog(i);
    } else {
      targetIndex.current = i;
      inputRef.current?.click();
    }
  };

  const isAudio = (f) => f && (/(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name) || (f.type || "").startsWith("audio"));
  const onPadDrop = (e, i) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const f = e.dataTransfer?.files?.[0];
    if (f && isAudio(f)) onAssignFile(i, f);
  };

  return (
    <div
      className="flex items-center gap-2 px-6 py-2 border-t border-[var(--hl-line)] bg-[#0e0e12]"
      data-testid="jingle-bar"
    >
      <input
        ref={inputRef}
        type="file"
        accept=".mp3,.wav,.m4a,audio/*"
        className="hidden"
        data-testid="jingle-file-input"
        onChange={(e) => {
          if (e.target.files?.[0] && targetIndex.current !== null)
            onAssignFile(targetIndex.current, e.target.files[0]);
          targetIndex.current = null;
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 shrink-0">
        <Zap size={16} className="text-[var(--hl-amber)]" />
        <span className="font-display text-xs tracking-[0.2em] text-[var(--hl-muted)]">JINGLES</span>
      </div>

      <div className="flex items-center gap-2 flex-1 overflow-x-auto">
        {Array.from({ length: PAD_COUNT }).map((_, i) => {
          const j = jingles[i];
          return (
            <div
              key={i}
              className={`relative shrink-0 rounded-lg ${dragOver === i ? "ring-2 ring-[var(--hl-fire)] ring-offset-1 ring-offset-[#0e0e12]" : ""}`}
              data-testid={`jingle-pad-drop-${i}`}
              onDragOver={(e) => {
                if (Array.from(e.dataTransfer?.types || []).includes("Files")) {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(i);
                }
              }}
              onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
              onDrop={(e) => onPadDrop(e, i)}
            >
              {j ? (
                <div className="flex flex-col gap-1 rounded-lg border border-[var(--hl-amber)] bg-[rgba(255,171,0,0.1)] pb-1">
                  <button
                    data-testid={`jingle-pad-${i}`}
                    onClick={() => onPlay(i)}
                    className="group flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-t-lg text-[var(--hl-amber)] hover:bg-[rgba(255,171,0,0.15)] transition"
                    title={`Play "${j.name}" (key ${i + 1}) — drag a new file here to replace`}
                  >
                    <span className="grid place-items-center h-5 w-5 rounded bg-[var(--hl-amber)] text-black text-[11px] font-700">
                      {i + 1}
                    </span>
                    <span className="text-sm max-w-[120px] truncate">{j.name}</span>
                  </button>
                  <div className="flex items-center gap-1.5 px-2.5">
                    <Volume2 size={12} className="text-[var(--hl-amber)] shrink-0" />
                    <input
                      data-testid={`jingle-volume-${i}`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={typeof j.volume === "number" ? j.volume : 1}
                      onChange={(e) => onSetVolume(i, Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="hl-jingle-vol w-24"
                      title="Pad volume — dip it under your voice"
                    />
                  </div>
                </div>
              ) : (
                <button
                  data-testid={`jingle-pad-${i}`}
                  onClick={() => assign(i)}
                  className="flex items-center gap-1.5 h-10 px-3 rounded-lg border border-dashed border-[var(--hl-line)] text-[var(--hl-muted)] hover:border-[var(--hl-amber)] hover:text-[var(--hl-amber)] transition"
                  title={`Assign a jingle to pad ${i + 1} — click to browse or drag a file here`}
                >
                  <Plus size={14} /> <span className="text-xs">Pad {i + 1}</span>
                </button>
              )}
              {j && (
                <button
                  data-testid={`jingle-clear-${i}`}
                  onClick={() => onClear(i)}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 grid place-items-center rounded-full bg-[var(--hl-onair)] text-white hover:scale-110 transition"
                  title="Remove this jingle"
                >
                  <X size={10} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex items-center gap-1.5 pr-2 border-r border-[var(--hl-line)]" title="How far the music dips while a jingle plays">
        <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Duck</span>
        <input
          data-testid="jingle-duck-depth"
          type="range"
          min="0"
          max="0.8"
          step="0.05"
          value={typeof duckDepth === "number" ? duckDepth : 0.4}
          onChange={(e) => onSetDuckDepth(Number(e.target.value))}
          className="hl-jingle-vol w-20"
        />
        <span className="text-[10px] tabular-nums text-[var(--hl-amber)] w-8 text-right" data-testid="jingle-duck-depth-label">{Math.round((typeof duckDepth === "number" ? duckDepth : 0.4) * 100)}%</span>
      </div>

      <div className="shrink-0 flex items-center gap-1.5 pr-2 border-r border-[var(--hl-line)]" title="How fast the music dips and recovers around a jingle">
        <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Speed</span>
        <input
          data-testid="jingle-duck-speed"
          type="range"
          min="60"
          max="900"
          step="20"
          value={typeof duckMs === "number" ? duckMs : 220}
          onChange={(e) => onSetDuckMs(Number(e.target.value))}
          className="hl-jingle-vol w-20"
        />
        <span className="text-[10px] tabular-nums text-[var(--hl-amber)] w-12 text-right" data-testid="jingle-duck-speed-label">{((typeof duckMs === "number" ? duckMs : 220) / 1000).toFixed(2)}s</span>
      </div>

      <button
        data-testid="jingle-stop-all"
        onClick={onStop}
        className="shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--hl-line)] text-sm text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:border-[var(--hl-onair)]"
        title="Stop all jingles"
      >
        <Square size={14} /> Stop
      </button>
    </div>
  );
}
