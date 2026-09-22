import React, { useRef, useState, useEffect } from "react";
import { Zap, Plus, X, Square, Volume2, Radio, ArrowLeftRight, ChevronLeft, ChevronRight, Repeat, Lock, Rewind, Pencil, Check } from "lucide-react";
import Waveform from "./Waveform";

const PAD_COUNT = 6;
const PAGE_COUNT = 2;

// High-end DJ-style crossfader: drag the cap from ON AIR (left) to STANDBY (right).
function Crossfader({ pos, armed, onChange }) {
  const railRef = useRef(null);
  const dragRef = useRef(false);
  const PAD = 13;
  const update = (clientX) => {
    const el = railRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const usable = Math.max(1, r.width - PAD * 2);
    let p = (clientX - r.left - PAD) / usable;
    p = Math.max(0, Math.min(1, p));
    onChange(p);
  };
  const onDown = (e) => {
    if (!armed) return;
    dragRef.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    update(e.clientX);
  };
  const onMove = (e) => {
    if (dragRef.current) update(e.clientX);
  };
  const onUp = (e) => {
    dragRef.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const ledColor = pos < 0.5 ? "var(--hl-fire)" : "var(--hl-cue)";
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="flex items-center justify-between w-[150px] px-0.5">
        <span className="text-[9px] font-700 tracking-wider text-[var(--hl-fire)]">AIR</span>
        <span className="text-[9px] font-700 tracking-wider text-[var(--hl-cue)]">CUE</span>
      </div>
      <div
        ref={railRef}
        data-testid="crossfader-rail"
        className={`hl-xfader-rail w-[150px] ${armed ? "" : "hl-xfader-disabled"}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="slider"
        aria-label="Standby crossfader"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos * 100)}
      >
        <div className="hl-xfader-slot" />
        <div className="hl-xfader-tick" />
        <div
          className="hl-xfader-cap"
          data-testid="crossfader-cap"
          style={{ left: `calc(${PAD}px + ${pos} * (100% - ${PAD * 2}px))` }}
        >
          <span
            className="hl-xfader-led"
            style={{ background: ledColor, boxShadow: `0 0 6px ${ledColor}` }}
          />
        </div>
      </div>
    </div>
  );
}

// Live beat/phase meter — air marker (top, fire) and standby marker (bottom, cyan)
// sweep across each beat; when they line up vertically the tracks are on the beat.
function BeatMeter({ getBeat, armed }) {
  const [b, setB] = useState({});
  useEffect(() => {
    let run = true;
    let raf;
    const loop = () => {
      if (!run) return;
      const info = getBeat && getBeat();
      if (info) setB(info);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      run = false;
      cancelAnimationFrame(raf);
    };
  }, [getBeat]);
  const have = armed && b.airBpm && b.sbBpm && b.airPhase != null && b.sbPhase != null;
  let d = 1;
  if (have) {
    d = Math.abs(b.airPhase - b.sbPhase) % 1;
    d = Math.min(d, 1 - d);
  }
  const locked = have && d < 0.05;
  return (
    <div className="flex flex-col items-center gap-0.5" data-testid="beat-meter">
      <span
        className={`text-[9px] font-700 tracking-wider ${
          locked ? "text-[var(--hl-cue)]" : "text-[var(--hl-muted)]"
        }`}
        data-testid="beat-meter-state"
      >
        {locked ? "ON BEAT" : "BEAT"}
      </span>
      <div
        className={`relative w-14 h-6 rounded bg-black/50 border overflow-hidden ${
          locked ? "border-[var(--hl-cue)]" : "border-[var(--hl-line)]"
        }`}
      >
        {have ? (
          <>
            <span
              className="absolute top-0 h-1/2 w-[3px] rounded-full bg-[var(--hl-fire)]"
              style={{ left: `${b.airPhase * 100}%`, transform: "translateX(-50%)" }}
            />
            <span
              className="absolute bottom-0 h-1/2 w-[3px] rounded-full bg-[var(--hl-cue)]"
              style={{ left: `${b.sbPhase * 100}%`, transform: "translateX(-50%)" }}
            />
            <span className="absolute left-1/2 top-0 h-full w-px bg-white/10" />
          </>
        ) : (
          <span className="absolute inset-0 grid place-items-center text-[9px] text-[var(--hl-muted)] opacity-50">
            – –
          </span>
        )}
      </div>
    </div>
  );
}

export default function JingleBar({ jingles, isElectron, padPage = 0, onSetPadPage, onAssignFile, onAssignDialog, onAssignTrack, onPlay, onClear, onRename, onColor, onSetVolume, duckDepth, onSetDuckDepth, duckMs, onSetDuckMs, standbyTrack, faderPos, onFader, onTake, onClearStandby, faderCurve, onSetFaderCurve, onSync, onNudge, onairBpm, standbyBpm, syncRate, syncLock, onToggleSyncLock, getBeat, rollDiv, onSetRollDiv, rollingPads, onToggleRoll, autoCueNext, onToggleAutoCueNext, onOneTapMix, airPeaks, airProgress, standbyPeaks, standbyHarmonic, onStop }) {
  const inputRef = useRef(null);
  const targetIndex = useRef(null);
  const [dragOver, setDragOver] = useState(null);
  const [editPad, setEditPad] = useState(null);

  const PAD_COLORS = [
    { name: "amber", v: "#ffab00" },
    { name: "fire", v: "#ff5a1f" },
    { name: "cyan", v: "#2ee5c4" },
    { name: "blue", v: "#3aa0ff" },
    { name: "green", v: "#7CFF9B" },
    { name: "pink", v: "#ff5a8a" },
    { name: "violet", v: "#9b6bff" },
    { name: "white", v: "#e5e5e5" },
  ];

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
    const trackId = e.dataTransfer?.getData("application/x-hl-track");
    if (f && isAudio(f)) onAssignFile(i, f);
    else if (trackId && onAssignTrack) onAssignTrack(i, trackId);
  };

  return (
    <div
      className="flex flex-wrap md:flex-nowrap items-center gap-2 px-3 md:px-6 py-2 border-t border-[var(--hl-line)] bg-[#0e0e12]"
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
        <div
          className="flex items-center rounded-md border border-[var(--hl-line)] overflow-hidden"
          data-testid="pad-page-switcher"
          title="Pad bank page — 12 pads across 2 pages"
        >
          <button
            data-testid="pad-page-prev"
            onClick={() => onSetPadPage && onSetPadPage((padPage + PAGE_COUNT - 1) % PAGE_COUNT)}
            className="h-6 w-6 grid place-items-center text-[var(--hl-muted)] hover:text-[var(--hl-amber)]"
            title="Previous pad page"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="px-1.5 text-[10px] font-700 tabular-nums text-[var(--hl-amber)]" data-testid="pad-page-label">
            {padPage + 1}/{PAGE_COUNT}
          </span>
          <button
            data-testid="pad-page-next"
            onClick={() => onSetPadPage && onSetPadPage((padPage + 1) % PAGE_COUNT)}
            className="h-6 w-6 grid place-items-center text-[var(--hl-muted)] hover:text-[var(--hl-amber)]"
            title="Next pad page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <div
          className="hidden md:flex items-center rounded-md border border-[var(--hl-line)] overflow-hidden"
          title="Loop-roll division (beat-synced stutter length)"
          data-testid="roll-div-selector"
        >
          {[
            { v: 1, l: "1" },
            { v: 0.5, l: "½" },
            { v: 0.25, l: "¼" },
            { v: 0.125, l: "⅛" },
          ].map((o) => (
            <button
              key={o.v}
              data-testid={`roll-div-${o.l}`}
              onClick={() => onSetRollDiv(o.v)}
              className={`h-6 w-6 text-[11px] font-700 transition ${
                (rollDiv ?? 0.25) === o.v
                  ? "bg-[var(--hl-amber)] text-black"
                  : "text-[var(--hl-muted)] hover:text-[var(--hl-amber)]"
              }`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5 w-full md:flex md:items-center md:gap-2 md:flex-1 md:min-w-0 md:w-auto md:overflow-x-auto">
        {Array.from({ length: PAD_COUNT }).map((_, idx) => {
          const i = padPage * PAD_COUNT + idx;
          const j = jingles[i];
          return (
            <div
              key={i}
              className={`relative shrink-0 rounded-lg ${dragOver === i ? "ring-2 ring-[var(--hl-fire)] ring-offset-1 ring-offset-[#0e0e12]" : ""}`}
              data-testid={`jingle-pad-drop-${i}`}
              onDragOver={(e) => {
                const types = Array.from(e.dataTransfer?.types || []);
                if (types.includes("Files") || types.includes("application/x-hl-track")) {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragOver(i);
                }
              }}
              onDragLeave={() => setDragOver((d) => (d === i ? null : d))}
              onDrop={(e) => onPadDrop(e, i)}
            >
              {j ? (
                <div
                  className="flex flex-col gap-1 rounded-lg border pb-1"
                  style={{ borderColor: j.color || "var(--hl-amber)", background: "rgba(255,255,255,0.04)" }}
                >
                  <button
                    data-testid={`jingle-pad-${i}`}
                    onClick={() => onPlay(i)}
                    className="group flex items-center gap-2 h-9 pl-2.5 pr-3 rounded-t-lg hover:bg-white/5 transition"
                    style={{ color: j.color || "var(--hl-amber)" }}
                    title={`Play "${j.label || j.name}" (key ${((i % 6) + 1)}) — drag a new file here to replace`}
                  >
                    <span
                      className="grid place-items-center h-5 w-5 rounded text-black text-[11px] font-700"
                      style={{ background: j.color || "var(--hl-amber)" }}
                    >
                      {i + 1}
                    </span>
                    <span className="text-sm max-w-[120px] truncate">{j.label || j.name}</span>
                  </button>
                  <div className="flex items-center gap-1.5 px-2.5">
                    <Volume2 size={12} className="shrink-0" style={{ color: j.color || "var(--hl-amber)" }} />
                    <input
                      data-testid={`jingle-volume-${i}`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={typeof j.volume === "number" ? j.volume : 1}
                      onChange={(e) => onSetVolume(i, Number(e.target.value))}
                      onClick={(e) => e.stopPropagation()}
                      className="hl-jingle-vol w-16"
                      title="Pad volume — dip it under your voice"
                    />
                    <button
                      data-testid={`jingle-edit-${i}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditPad((p) => (p === i ? null : i));
                      }}
                      className="h-5 w-5 grid place-items-center rounded shrink-0 hover:bg-white/10"
                      style={{ color: j.color || "var(--hl-amber)" }}
                      title="Rename & colour this pad"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      data-testid={`jingle-roll-${i}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleRoll(i);
                      }}
                      className={`h-5 w-5 grid place-items-center rounded shrink-0 transition ${
                        rollingPads?.includes(i)
                          ? "bg-[var(--hl-fire)] text-white hl-roll-active"
                          : "hover:bg-white/10"
                      }`}
                      style={rollingPads?.includes(i) ? {} : { color: j.color || "var(--hl-amber)" }}
                      title="Beat-synced loop roll — retriggers this pad in time with the track"
                    >
                      <Rewind size={12} />
                    </button>
                  </div>
                  {editPad === i && (
                    <div
                      data-testid={`jingle-edit-panel-${i}`}
                      className="px-2.5 pt-1 pb-0.5 space-y-1.5 border-t border-white/10 mt-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-1">
                        <input
                          data-testid={`jingle-label-input-${i}`}
                          value={j.label || ""}
                          onChange={(e) => onRename(i, e.target.value)}
                          placeholder={j.name}
                          className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded px-2 py-1 text-[11px] outline-none focus:border-[var(--hl-amber)]"
                        />
                        <button
                          data-testid={`jingle-edit-done-${i}`}
                          onClick={() => setEditPad(null)}
                          className="h-6 w-6 grid place-items-center rounded text-[var(--hl-cue)] hover:bg-white/10"
                          title="Done"
                        >
                          <Check size={13} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        {PAD_COLORS.map((c) => (
                          <button
                            key={c.name}
                            data-testid={`jingle-color-${i}-${c.name}`}
                            onClick={() => onColor(i, c.v)}
                            className={`h-4 w-4 rounded-full border ${
                              (j.color || "#ffab00") === c.v ? "ring-2 ring-white/70" : "border-black/40"
                            }`}
                            style={{ background: c.v }}
                            title={c.name}
                          />
                        ))}
                      </div>
                    </div>
                  )}
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

      {/* ---- Standby deck + crossfader (blend the "in cue" track on air) ---- */}
      <div
        className="shrink-0 flex items-center gap-2 pl-1 pr-3 border-l border-r border-[var(--hl-line)]"
        data-testid="standby-deck"
      >
        <div className="flex flex-col justify-center w-[124px] min-w-[124px]">
          <div className="flex items-center gap-1.5">
            <Radio size={13} className={standbyTrack ? "text-[var(--hl-cue)]" : "text-[var(--hl-muted)]"} />
            <span className="font-display text-[10px] tracking-[0.2em] text-[var(--hl-muted)]">
              STANDBY
            </span>
          </div>
          {standbyTrack ? (
            <>
              <div className="flex items-center gap-1 mt-0.5">
                <span
                  className="text-xs truncate text-[var(--hl-cue)] max-w-[100px]"
                  data-testid="standby-track-name"
                  title={standbyTrack.name}
                >
                  {standbyTrack.title || standbyTrack.name}
                </span>
                <button
                  data-testid="standby-clear"
                  onClick={onClearStandby}
                  className="h-4 w-4 shrink-0 grid place-items-center rounded-full text-[var(--hl-muted)] hover:text-[var(--hl-onair)]"
                  title="Clear the standby deck"
                >
                  <X size={11} />
                </button>
              </div>
              <div className="text-[10px] tabular-nums text-[var(--hl-muted)] mt-0.5" data-testid="standby-bpm">
                <span className="text-[var(--hl-fire)]">{onairBpm ? Math.round(onairBpm) : "--"}</span>
                <span className="mx-1">→</span>
                <span className="text-[var(--hl-cue)]">{standbyBpm ? Math.round(standbyBpm) : "--"}</span>
                <span className="ml-0.5">BPM</span>
                {syncRate && Math.abs(syncRate - 1) > 0.001 && (
                  <span className="ml-1 text-[var(--hl-cue)]" data-testid="standby-sync-rate">
                    ×{syncRate.toFixed(2)}
                  </span>
                )}
              </div>
              {standbyHarmonic != null && (
                <div
                  className={`text-[10px] font-700 tracking-wide mt-0.5 ${
                    standbyHarmonic ? "text-[#7CFF9B]" : "text-[var(--hl-amber)]"
                  }`}
                  data-testid="standby-harmonic"
                >
                  {standbyHarmonic ? "♪ HARMONIC ✓" : "♪ CLASH"}
                </div>
              )}
            </>
          ) : (
            <span className="text-[11px] text-[var(--hl-muted)] italic mt-0.5" data-testid="standby-empty">
              Arm a track with{" "}
              <Radio size={10} className="inline -mt-0.5 text-[var(--hl-cue)]" />
            </span>
          )}
        </div>

        <div className="hidden lg:flex flex-col gap-0.5 w-[116px]" data-testid="deck-waveforms">
          <div
            className="relative h-5 rounded bg-black/40 overflow-hidden border border-[var(--hl-line)]"
            title="On-air waveform"
          >
            {airPeaks ? (
              <Waveform peaks={airPeaks} progress={airProgress || 0} height={20} interactive={false} compact />
            ) : (
              <span className="absolute inset-0 grid place-items-center text-[8px] text-[var(--hl-muted)] opacity-40">
                on air
              </span>
            )}
            <span className="absolute left-1 top-0 text-[8px] font-700 text-[var(--hl-fire)] pointer-events-none">
              AIR
            </span>
          </div>
          <div
            className="relative h-5 rounded bg-black/40 overflow-hidden border border-[var(--hl-line)]"
            title="Standby waveform — eyeball the drop before you fade"
          >
            {standbyPeaks ? (
              <Waveform peaks={standbyPeaks} progress={0} height={20} interactive={false} compact />
            ) : (
              <span className="absolute inset-0 grid place-items-center text-[8px] text-[var(--hl-muted)] opacity-40">
                standby
              </span>
            )}
            <span className="absolute left-1 top-0 text-[8px] font-700 text-[var(--hl-cue)] pointer-events-none">
              CUE
            </span>
          </div>
        </div>

        <Crossfader pos={faderPos || 0} armed={!!standbyTrack} onChange={onFader} />

        <BeatMeter getBeat={getBeat} armed={!!standbyTrack} />

        {/* Sync / nudge / curve controls */}
        <div className="flex flex-col items-stretch gap-1">
          <div className="flex items-center gap-1">
            <button
              data-testid="standby-nudge-back"
              onClick={() => onNudge(-1)}
              disabled={!standbyTrack}
              className="h-6 w-6 grid place-items-center rounded border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-cue)] hover:border-[var(--hl-cue)] disabled:opacity-30"
              title="Nudge the standby track back (drag it onto the beat)"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              data-testid="standby-sync"
              onClick={onSync}
              disabled={!standbyTrack}
              className="h-6 px-2 flex items-center gap-1 rounded border border-[var(--hl-cue)] text-[var(--hl-cue)] text-[10px] font-700 tracking-wider hover:bg-[rgba(46,229,196,0.12)] disabled:opacity-30 disabled:border-[var(--hl-line)] disabled:text-[var(--hl-muted)]"
              title="Tempo-match the standby track to what's on air"
            >
              <Repeat size={12} /> SYNC
            </button>
            <button
              data-testid="standby-nudge-fwd"
              onClick={() => onNudge(1)}
              disabled={!standbyTrack}
              className="h-6 w-6 grid place-items-center rounded border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-cue)] hover:border-[var(--hl-cue)] disabled:opacity-30"
              title="Nudge the standby track forward (drag it onto the beat)"
            >
              <ChevronRight size={14} />
            </button>
            <button
              data-testid="standby-sync-lock"
              onClick={onToggleSyncLock}
              className={`h-6 w-6 grid place-items-center rounded border transition ${
                syncLock
                  ? "bg-[var(--hl-cue)] text-black border-[var(--hl-cue)]"
                  : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-cue)] hover:border-[var(--hl-cue)]"
              }`}
              title="Sync Lock — auto tempo-match every track the moment it's armed"
            >
              <Lock size={12} />
            </button>
          </div>
          <div className="flex items-center rounded-md border border-[var(--hl-line)] overflow-hidden">
            <button
              data-testid="fader-curve-smooth"
              onClick={() => onSetFaderCurve("smooth")}
              className={`flex-1 h-5 text-[9px] font-700 tracking-wider transition ${
                faderCurve !== "sharp"
                  ? "bg-[var(--hl-cue)] text-black"
                  : "text-[var(--hl-muted)] hover:text-white"
              }`}
              title="Smooth (equal-power) crossfade curve"
            >
              SMOOTH
            </button>
            <button
              data-testid="fader-curve-sharp"
              onClick={() => onSetFaderCurve("sharp")}
              className={`flex-1 h-5 text-[9px] font-700 tracking-wider transition ${
                faderCurve === "sharp"
                  ? "bg-[var(--hl-cue)] text-black"
                  : "text-[var(--hl-muted)] hover:text-white"
              }`}
              title="Sharp (fast cut) crossfade curve"
            >
              SHARP
            </button>
          </div>
          <button
            data-testid="auto-cue-next-toggle"
            onClick={onToggleAutoCueNext}
            className={`flex items-center justify-center gap-1 h-5 rounded-md border text-[9px] font-700 tracking-wider transition ${
              autoCueNext
                ? "bg-[var(--hl-amber)] text-black border-[var(--hl-amber)]"
                : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:border-[var(--hl-amber)]"
            }`}
            title="Auto-Cue Next — after each take, auto-arm the next playlist track to standby"
          >
            <Repeat size={11} /> AUTO-CUE
          </button>
        </div>

        <button
          data-testid="standby-take"
          onClick={onTake}
          disabled={!standbyTrack}
          className="shrink-0 flex flex-col items-center justify-center gap-0.5 h-11 px-3 rounded-lg border border-[var(--hl-cue)] text-[var(--hl-cue)] hover:bg-[rgba(46,229,196,0.12)] disabled:opacity-30 disabled:border-[var(--hl-line)] disabled:text-[var(--hl-muted)] transition"
          title="TAKE (\\) — smoothly crossfade the standby track on air"
        >
          <ArrowLeftRight size={15} />
          <span className="text-[9px] font-700 tracking-widest">TAKE</span>
        </button>
        <button
          data-testid="one-tap-mix"
          onClick={onOneTapMix}
          className="shrink-0 flex flex-col items-center justify-center gap-0.5 h-11 px-2.5 rounded-lg border border-[var(--hl-fire)] text-[var(--hl-fire)] hover:bg-[rgba(255,90,31,0.14)] transition"
          title="One-Tap Mix (M) — arm the next track, auto-sync, and take on the next beat"
        >
          <Zap size={15} />
          <span className="text-[9px] font-700 tracking-widest">1-TAP</span>
        </button>
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
