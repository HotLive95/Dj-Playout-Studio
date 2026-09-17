import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Play,
  Pause,
  Scissors,
  Download,
  Save,
  Wand2,
  FlagTriangleRight,
  Trash2,
  RotateCcw,
  ZoomIn,
} from "lucide-react";
import Waveform from "./Waveform";
import { formatTime } from "../lib/format";
import {
  decodeToBuffer,
  computePeaks,
  detectSilence,
  keepRegionsFrom,
  sliceAndConcat,
  bufferToWav,
  bufferToMp3,
} from "../lib/audioProcessing";

export default function TrackEditor({ track, getUrl, onClose, onSave }) {
  const [status, setStatus] = useState("Loading audio…");
  const [buffer, setBuffer] = useState(null);
  const [peaks, setPeaks] = useState(null);
  const [duration, setDuration] = useState(0);
  const [inPoint, setInPoint] = useState(0);
  const [outPoint, setOutPoint] = useState(0);
  const [cuts, setCuts] = useState([]);
  const [markStart, setMarkStart] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [format, setFormat] = useState("wav");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const audioRef = useRef(null);
  const urlRef = useRef(null);

  useEffect(() => {
    let revoked = false;
    (async () => {
      try {
        const url = await getUrl(track);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.addEventListener("timeupdate", () => {
          const t = audio.currentTime;
          setCurrent(t);
          if (t >= outPointRef.current) {
            audio.pause();
            audio.currentTime = inPointRef.current;
            setPlaying(false);
            return;
          }
          for (const c of cutsRef.current) {
            if (t >= c.start && t < c.end) {
              audio.currentTime = c.end;
              break;
            }
          }
        });
        audio.addEventListener("ended", () => setPlaying(false));
        setStatus("Decoding waveform…");
        const buf = await decodeToBuffer(url);
        if (revoked) return;
        setBuffer(buf);
        setPeaks(computePeaks(buf, 1400));
        setDuration(buf.duration);
        setOutPoint(buf.duration);
        setStatus("");
      } catch (e) {
        setStatus("Could not load this track for editing.");
      }
    })();
    return () => {
      revoked = true;
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  // refs so the audio timeupdate closure sees latest values
  const inPointRef = useRef(0);
  const outPointRef = useRef(0);
  const cutsRef = useRef([]);
  inPointRef.current = inPoint;
  outPointRef.current = outPoint;
  cutsRef.current = cuts;

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      if (a.currentTime < inPoint || a.currentTime >= outPoint) a.currentTime = inPoint;
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seekFrac = (frac) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    a.currentTime = frac * duration;
    setCurrent(a.currentTime);
  };

  const setInHere = () => setInPoint(Math.min(current, outPoint - 0.05));
  const setOutHere = () => setOutPoint(Math.max(current, inPoint + 0.05));

  const markCutStart = () => setMarkStart(current);
  const markCutEnd = () => {
    if (markStart == null) return;
    const s = Math.min(markStart, current);
    const e = Math.max(markStart, current);
    if (e - s > 0.02) setCuts((prev) => [...prev, { start: s, end: e }].sort((a, b) => a.start - b.start));
    setMarkStart(null);
  };
  const removeCut = (i) => setCuts((prev) => prev.filter((_, idx) => idx !== i));

  const autoSilence = () => {
    if (!buffer) return;
    const { leadIn, tailStart } = detectSilence(buffer);
    setInPoint(leadIn);
    setOutPoint(tailStart);
  };

  const resetAll = () => {
    setInPoint(0);
    setOutPoint(duration);
    setCuts([]);
    setMarkStart(null);
  };

  const baseName = track.name.replace(/\.[^.]+$/, "");

  const doExport = async (download) => {
    if (!buffer) return;
    setBusy(true);
    setStatus(`Rendering ${format.toUpperCase()}…`);
    try {
      // let the UI paint the busy state
      await new Promise((r) => setTimeout(r, 30));
      const keep = keepRegionsFrom(inPoint, outPoint, cuts);
      const rendered = sliceAndConcat(buffer, keep);
      const blob = format === "mp3" ? bufferToMp3(rendered) : bufferToWav(rendered);
      const name = `${baseName} (edited).${format}`;
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      } else {
        await onSave(blob, name, format, rendered.duration);
        onClose();
      }
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  const frac = (t) => (duration ? t / duration : 0);

  // ---- Zoom / pan window for micro-editing ----
  const N = peaks ? peaks.length : 0;
  const windowFrac = 1 / zoom;
  const maxStart = Math.max(0, 1 - windowFrac);
  const vStart = Math.min(viewStart, maxStart);
  const vEnd = vStart + windowFrac;
  const visPeaks =
    peaks && zoom > 1
      ? peaks.slice(Math.floor(vStart * N), Math.max(Math.floor(vStart * N) + 1, Math.ceil(vEnd * N)))
      : peaks;
  const toWin = (f) => (f - vStart) / windowFrac; // full frac -> visible-window frac
  const fromWin = (fw) => vStart + fw * windowFrac; // visible-window frac -> full frac

  const editedDuration = keepRegionsFrom(inPoint, outPoint, cuts).reduce(
    (s, r) => s + (r.end - r.start),
    0
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="track-editor-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl hl-panel rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Scissors size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Track Editor</h2>
            <span className="text-[var(--hl-muted)] text-sm truncate max-w-[320px]">
              — {track.name}
            </span>
          </div>
          <button
            data-testid="editor-close"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {status && (
            <div className="text-center text-[var(--hl-muted)] py-6" data-testid="editor-status">
              {status}
            </div>
          )}

          {peaks && (
            <>
              <div className="rounded-xl bg-black/40 border border-[var(--hl-line)] p-3">
                <Waveform
                  peaks={visPeaks}
                  progress={toWin(frac(current))}
                  inPoint={toWin(frac(inPoint))}
                  outPoint={toWin(frac(outPoint))}
                  cuts={cuts.map((c) => ({ start: toWin(frac(c.start)), end: toWin(frac(c.end)) }))}
                  height={120}
                  onSeek={(fw) => seekFrac(fromWin(fw))}
                  onInChange={(fw) => {
                    const t = fromWin(fw) * duration;
                    setInPoint(Math.max(0, Math.min(t, outPoint - 0.05)));
                  }}
                  onOutChange={(fw) => {
                    const t = fromWin(fw) * duration;
                    setOutPoint(Math.min(duration, Math.max(t, inPoint + 0.05)));
                  }}
                />
                <div className="flex items-center justify-between mt-2 text-xs text-[var(--hl-muted)] tabular-nums">
                  <span data-testid="editor-current-time">{formatTime(current)}</span>
                  <span className="text-[var(--hl-amber)] normal-case tracking-normal">
                    Drag the amber handles to set start &amp; end
                  </span>
                  <span>
                    Keep: <span className="text-[var(--hl-fire)]">{formatTime(editedDuration)}</span>{" "}
                    of {formatTime(duration)}
                  </span>
                </div>

                {/* Zoom / pan for micro-editing */}
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--hl-line)]">
                  <ZoomIn size={15} className="text-[var(--hl-muted)] shrink-0" />
                  <span className="text-xs text-[var(--hl-muted)] shrink-0">Zoom</span>
                  <input
                    data-testid="editor-zoom"
                    type="range"
                    min="1"
                    max="30"
                    step="0.5"
                    value={zoom}
                    onChange={(e) => {
                      const z = Number(e.target.value);
                      const w = 1 / z;
                      // keep the current playhead centred in the new window when possible
                      const center = frac(current);
                      setZoom(z);
                      setViewStart(Math.min(Math.max(0, center - w / 2), Math.max(0, 1 - w)));
                    }}
                    className="hl-range w-40 shrink-0"
                  />
                  <span
                    className="text-xs tabular-nums text-[var(--hl-amber)] w-16 shrink-0"
                    data-testid="editor-zoom-readout"
                  >
                    {Math.round(zoom * 100)}%
                  </span>
                  {zoom > 1 && (
                    <>
                      <span className="text-xs text-[var(--hl-muted)] shrink-0">Pan</span>
                      <input
                        data-testid="editor-pan"
                        type="range"
                        min="0"
                        max={maxStart}
                        step="0.001"
                        value={vStart}
                        onChange={(e) => setViewStart(Number(e.target.value))}
                        className="hl-range flex-1 min-w-0"
                      />
                    </>
                  )}
                  <button
                    data-testid="editor-zoom-fit"
                    onClick={() => {
                      setZoom(1);
                      setViewStart(0);
                    }}
                    className="px-2.5 py-1 rounded border border-[var(--hl-line)] text-xs hover:border-[var(--hl-fire)] shrink-0"
                  >
                    Fit
                  </button>
                </div>
              </div>

              {/* transport + trim */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  data-testid="editor-play"
                  onClick={togglePlay}
                  className="h-10 w-10 grid place-items-center rounded-full hl-fire-gradient text-white"
                >
                  {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
                <button
                  data-testid="editor-set-in"
                  onClick={setInHere}
                  className="px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-amber)]"
                >
                  Set In ({formatTime(inPoint)})
                </button>
                <button
                  data-testid="editor-set-out"
                  onClick={setOutHere}
                  className="px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-amber)]"
                >
                  Set Out ({formatTime(outPoint)})
                </button>
                <button
                  data-testid="editor-auto-silence"
                  onClick={autoSilence}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-fire)]"
                >
                  <Wand2 size={15} /> Auto-trim silence
                </button>
                <button
                  data-testid="editor-reset"
                  onClick={resetAll}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm text-[var(--hl-muted)] hover:text-white"
                >
                  <RotateCcw size={15} /> Reset
                </button>
              </div>

              {/* cut region controls */}
              <div className="rounded-xl bg-black/30 border border-[var(--hl-line)] p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                    Cut out sections
                  </span>
                  {markStart == null ? (
                    <button
                      data-testid="editor-mark-cut-start"
                      onClick={markCutStart}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-onair)]"
                    >
                      <FlagTriangleRight size={14} /> Mark cut start
                    </button>
                  ) : (
                    <button
                      data-testid="editor-mark-cut-end"
                      onClick={markCutEnd}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--hl-onair)] text-white text-sm"
                    >
                      <FlagTriangleRight size={14} /> Mark cut end (from {formatTime(markStart)})
                    </button>
                  )}
                </div>
                {cuts.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2" data-testid="editor-cut-list">
                    {cuts.map((c, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1.5 text-xs bg-[rgba(255,23,68,0.12)] border border-[var(--hl-onair)] rounded-full px-2.5 py-1"
                      >
                        {formatTime(c.start)}–{formatTime(c.end)}
                        <button onClick={() => removeCut(i)} data-testid={`editor-remove-cut-${i}`}>
                          <Trash2 size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* export */}
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <span className="text-xs text-[var(--hl-muted)] mr-auto">
                  Export as
                </span>
                <select
                  data-testid="editor-format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value)}
                  className="bg-black/50 border border-[var(--hl-line)] rounded-lg text-sm px-2.5 py-2 outline-none focus:border-[var(--hl-fire)]"
                >
                  <option value="wav">WAV (lossless)</option>
                  <option value="mp3">MP3 (192kbps)</option>
                </select>
                <button
                  data-testid="editor-download"
                  disabled={busy}
                  onClick={() => doExport(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-white disabled:opacity-50"
                >
                  <Download size={15} /> Download
                </button>
                <button
                  data-testid="editor-save"
                  disabled={busy}
                  onClick={() => doExport(false)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg hl-fire-gradient text-white font-600 disabled:opacity-50"
                >
                  <Save size={16} /> {busy ? "Saving…" : "Save to Playlist"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
