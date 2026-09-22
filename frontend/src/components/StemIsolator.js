import React, { useEffect, useRef, useState } from "react";
import {
  Layers,
  X,
  Play,
  Pause,
  RotateCcw,
  Repeat,
  Volume2,
  VolumeX,
  Headphones,
  Loader2,
  Download,
  Zap,
  Music2,
  Circle,
  Square,
  Radio,
} from "lucide-react";
import { decodeToBuffer, audioCtx, bufferToWav } from "../lib/audioProcessing";
import { STEMS, buildStemGraph, renderStem } from "../lib/stemIsolator";
import { formatTime } from "../lib/format";
import { downloadBlob } from "../lib/playlistExport";

const PAD_COUNT = 6;

// Live DSP stem isolator: load a track, then mute/solo/level Vocals, Music,
// Bass and Drums in real time. Send any isolated stem to a jingle pad, or
// render it out to a file. Fully offline.
export default function StemIsolator({ playlists = [], tracks = {}, jingles = [], getUrl, onAssignStemToPad, onSendMixToDeck, onClose }) {
  const trackList = [];
  const seen = new Set();
  playlists.forEach((p) =>
    (p.trackIds || []).forEach((id) => {
      if (tracks[id] && !seen.has(id)) {
        seen.add(id);
        trackList.push(tracks[id]);
      }
    })
  );

  const [srcTrackId, setSrcTrackId] = useState(trackList[0]?.id || "");
  const [srcName, setSrcName] = useState(trackList[0]?.title || trackList[0]?.name || "");
  const [buffer, setBuffer] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [loop, setLoop] = useState(false);
  const [levels, setLevels] = useState({ vocals: 1, music: 1, bass: 1, drums: 1 });
  const [mutes, setMutes] = useState({ vocals: false, music: false, bass: false, drums: false });
  const [soloId, setSoloId] = useState(null);
  const [busyStem, setBusyStem] = useState("");
  const [padTarget, setPadTarget] = useState({});
  const [flash, setFlash] = useState("");
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const [recBusy, setRecBusy] = useState(false);
  const [lastMix, setLastMix] = useState(null);
  const recDestRef = useRef(null);
  const recorderRef = useRef(null);
  const recChunksRef = useRef([]);
  const recTimerRef = useRef(null);

  const ctxRef = useRef(null);
  const srcNodeRef = useRef(null);
  const graphRef = useRef(null);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);
  const rafRef = useRef(0);
  const loopRef = useRef(loop);
  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const effGain = (id) => {
    if (soloId) return id === soloId ? levels[id] : 0;
    return mutes[id] ? 0 : levels[id];
  };

  // Push current mixer state into the live graph.
  const applyGains = () => {
    const g = graphRef.current?.gains;
    const ctx = ctxRef.current;
    if (!g || !ctx) return;
    STEMS.forEach(({ id }) => {
      g[id].gain.setTargetAtTime(Math.max(0, effGain(id)), ctx.currentTime, 0.02);
    });
  };
  useEffect(applyGains, [levels, mutes, soloId]); // eslint-disable-line react-hooks/exhaustive-deps

  const teardown = () => {
    cancelAnimationFrame(rafRef.current);
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    try {
      recorderRef.current && recorderRef.current.state !== "inactive" && recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    recDestRef.current = null;
    try {
      srcNodeRef.current && srcNodeRef.current.stop();
    } catch {
      /* ignore */
    }
    srcNodeRef.current = null;
    if (ctxRef.current && ctxRef.current.state !== "closed") {
      try {
        ctxRef.current.close();
      } catch {
        /* ignore */
      }
    }
    ctxRef.current = null;
    graphRef.current = null;
  };
  useEffect(() => () => teardown(), []);

  const loadSource = async (track, file) => {
    setLoading(true);
    setError("");
    stop();
    try {
      let url;
      if (file) {
        url = URL.createObjectURL(file);
        setSrcName(file.name);
      } else {
        url = await getUrl(track);
        setSrcName(track.title || track.name);
      }
      if (!url) throw new Error("missing");
      const buf = await decodeToBuffer(url);
      if (file) URL.revokeObjectURL(url);
      setBuffer(buf);
      offsetRef.current = 0;
      setPos(0);
    } catch {
      setError("Couldn't read that track's audio on this device. Try another track or upload a file.");
      setBuffer(null);
    }
    setLoading(false);
  };

  const startAt = (offset) => {
    const buf = buffer;
    if (!buf) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!ctxRef.current || ctxRef.current.state === "closed") {
      ctxRef.current = new AC();
    }
    const ctx = ctxRef.current;
    if (ctx.state === "suspended") ctx.resume();
    try {
      srcNodeRef.current && srcNodeRef.current.stop();
    } catch {
      /* ignore */
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const graph = buildStemGraph(ctx, src);
    graph.master.connect(ctx.destination);
    if (recDestRef.current) graph.master.connect(recDestRef.current);
    graphRef.current = graph;
    srcNodeRef.current = src;
    STEMS.forEach(({ id }) => {
      graph.gains[id].gain.value = Math.max(0, effGain(id));
    });
    src.onended = () => {
      if (loopRef.current && playing) {
        offsetRef.current = 0;
        startAt(0);
      } else if (offsetRef.current + (ctx.currentTime - startedAtRef.current) >= buf.duration - 0.05) {
        setPlaying(false);
        offsetRef.current = 0;
        setPos(0);
        cancelAnimationFrame(rafRef.current);
      }
    };
    src.start(0, Math.max(0, Math.min(offset, buf.duration - 0.02)));
    startedAtRef.current = ctx.currentTime;
    offsetRef.current = offset;
    tick();
  };

  const tick = () => {
    const ctx = ctxRef.current;
    const buf = buffer;
    if (!ctx || !buf) return;
    const p = offsetRef.current + (ctx.currentTime - startedAtRef.current);
    setPos(Math.min(p, buf.duration));
    rafRef.current = requestAnimationFrame(tick);
  };

  const play = () => {
    if (!buffer) return;
    setPlaying(true);
    startAt(offsetRef.current || 0);
  };
  const pause = () => {
    const ctx = ctxRef.current;
    if (ctx) offsetRef.current = offsetRef.current + (ctx.currentTime - startedAtRef.current);
    cancelAnimationFrame(rafRef.current);
    try {
      srcNodeRef.current && srcNodeRef.current.stop();
    } catch {
      /* ignore */
    }
    srcNodeRef.current = null;
    setPlaying(false);
  };
  function stop() {
    cancelAnimationFrame(rafRef.current);
    try {
      srcNodeRef.current && srcNodeRef.current.stop();
    } catch {
      /* ignore */
    }
    srcNodeRef.current = null;
    offsetRef.current = 0;
    setPos(0);
    setPlaying(false);
  }
  const togglePlay = () => (playing ? pause() : play());
  const restart = () => {
    offsetRef.current = 0;
    setPos(0);
    if (playing) startAt(0);
  };
  const seek = (t) => {
    offsetRef.current = t;
    setPos(t);
    if (playing) startAt(t);
  };

  const toggleMute = (id) => setMutes((m) => ({ ...m, [id]: !m[id] }));
  const toggleSolo = (id) => setSoloId((s) => (s === id ? null : id));
  const setLevel = (id, v) => setLevels((l) => ({ ...l, [id]: v }));

  const sendToPad = async (stemId) => {
    if (!buffer) return;
    const idx = padTarget[stemId] != null ? padTarget[stemId] : jingles.findIndex((j) => !j);
    const pad = idx >= 0 && idx < PAD_COUNT ? idx : 0;
    setBusyStem(`pad-${stemId}`);
    try {
      const blob = await renderStem(buffer, stemId, { format: "wav" });
      const label = STEMS.find((s) => s.id === stemId)?.label || stemId;
      await onAssignStemToPad(pad, blob, `${label} · ${srcName}`);
      setFlash(`${label} sent to Pad ${pad + 1}`);
      setTimeout(() => setFlash(""), 2500);
    } catch {
      setFlash("Couldn't build that stem — try a shorter track.");
      setTimeout(() => setFlash(""), 3000);
    }
    setBusyStem("");
  };

  const exportStem = async (stemId, format) => {
    if (!buffer) return;
    setBusyStem(`exp-${stemId}`);
    try {
      const blob = await renderStem(buffer, stemId, { format });
      const label = STEMS.find((s) => s.id === stemId)?.label || stemId;
      const safe = (srcName || "track").replace(/[^a-z0-9\-_ ]/gi, "").trim() || "track";
      downloadBlob(blob, `${safe} - ${label}.${format}`);
    } catch {
      setFlash("Export failed — try a shorter track.");
      setTimeout(() => setFlash(""), 3000);
    }
    setBusyStem("");
  };

  // Record the LIVE isolated mix (with your fader/mute/solo moves) to a WAV.
  const startRecord = () => {
    if (!buffer) return;
    if (!playing) play();
    const ctx = ctxRef.current;
    if (!ctx) return;
    const dest = ctx.createMediaStreamDestination();
    recDestRef.current = dest;
    if (graphRef.current) graphRef.current.master.connect(dest);
    const mime =
      window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
    recChunksRef.current = [];
    const rec = new MediaRecorder(dest.stream, { mimeType: mime });
    rec.ondataavailable = (e) => e.data && e.data.size && recChunksRef.current.push(e.data);
    rec.onstop = async () => {
      setRecBusy(true);
      try {
        const webm = new Blob(recChunksRef.current, { type: rec.mimeType || "audio/webm" });
        const buf = await audioCtx().decodeAudioData((await webm.arrayBuffer()).slice(0));
        const wav = bufferToWav(buf);
        const safe = (srcName || "stem-mix").replace(/[^a-z0-9\-_ ]/gi, "").trim() || "stem-mix";
        downloadBlob(wav, `${safe} - Stem Mix.wav`);
        setLastMix({ blob: wav, name: `${srcName || "Stem"} · Mix` });
        setFlash("Stem mix saved");
        setTimeout(() => setFlash(""), 2500);
      } catch {
        setFlash("Couldn't save the mix recording.");
        setTimeout(() => setFlash(""), 3000);
      }
      setRecBusy(false);
    };
    rec.start();
    recorderRef.current = rec;
    setRecording(true);
    setRecSec(0);
    const t0 = Date.now();
    recTimerRef.current = setInterval(() => setRecSec((Date.now() - t0) / 1000), 250);
  };
  const stopRecord = () => {
    if (recTimerRef.current) clearInterval(recTimerRef.current);
    recTimerRef.current = null;
    try {
      recorderRef.current && recorderRef.current.state !== "inactive" && recorderRef.current.stop();
    } catch {
      /* ignore */
    }
    recorderRef.current = null;
    recDestRef.current = null;
    setRecording(false);
  };
  const toggleRecord = () => (recording ? stopRecord() : startRecord());

  const dur = buffer?.duration || 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4"
      data-testid="stem-isolator-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg hl-panel rounded-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[var(--hl-cue)]" />
            <h2 className="font-display text-lg">Stem Isolator</h2>
          </div>
          <button
            data-testid="stem-close"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Source picker */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-muted)]">
              <Music2 size={14} className="text-[var(--hl-amber)]" /> Source track
            </div>
            <div className="flex items-center gap-2">
              <select
                data-testid="stem-source-select"
                value={srcTrackId}
                disabled={recording}
                onChange={(e) => {
                  const t = tracks[e.target.value];
                  setSrcTrackId(e.target.value);
                  if (t) loadSource(t);
                }}
                className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-cue)]"
              >
                <option value="">Choose a track…</option>
                {trackList.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title || t.name}
                  </option>
                ))}
              </select>
              <label
                data-testid="stem-upload-label"
                className="shrink-0 h-9 px-3 grid place-items-center rounded-lg border border-[var(--hl-line)] text-xs text-[var(--hl-muted)] hover:border-[var(--hl-cue)] hover:text-[var(--hl-cue)] cursor-pointer"
                title="Upload a file to split"
              >
                Upload
                <input
                  data-testid="stem-upload-input"
                  type="file"
                  accept=".mp3,.wav,.m4a,audio/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setSrcTrackId("");
                      loadSource(null, e.target.files[0]);
                    }
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            {srcTrackId === "" && !buffer && trackList[0] && (
              <button
                data-testid="stem-load-first"
                onClick={() => {
                  setSrcTrackId(trackList[0].id);
                  loadSource(trackList[0]);
                }}
                className="text-xs text-[var(--hl-cue)]"
              >
                Load “{trackList[0].title || trackList[0].name}”
              </button>
            )}
          </div>

          {error && (
            <div className="text-sm text-[var(--hl-onair)]" data-testid="stem-error">
              {error}
            </div>
          )}
          {flash && (
            <div className="text-sm text-[var(--hl-cue)] text-center" data-testid="stem-flash">
              {flash}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-[var(--hl-muted)]" data-testid="stem-loading">
              <Loader2 size={18} className="animate-spin" /> Loading track…
            </div>
          ) : buffer ? (
            <>
              {/* Transport */}
              <div className="rounded-xl border border-[var(--hl-line)] p-3 space-y-2" data-testid="stem-transport">
                <div className="flex items-center gap-3">
                  <button
                    data-testid="stem-play"
                    onClick={togglePlay}
                    className="h-11 w-11 grid place-items-center rounded-full hl-fire-gradient text-white shrink-0"
                  >
                    {playing ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
                  </button>
                  <button
                    data-testid="stem-restart"
                    onClick={restart}
                    className="h-9 w-9 grid place-items-center rounded-lg border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-white"
                    title="Restart"
                  >
                    <RotateCcw size={16} />
                  </button>
                  <button
                    data-testid="stem-loop"
                    onClick={() => setLoop((v) => !v)}
                    className={`h-9 w-9 grid place-items-center rounded-lg border transition ${
                      loop
                        ? "border-[var(--hl-cue)] text-[var(--hl-cue)] bg-[rgba(46,229,196,0.12)]"
                        : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-white"
                    }`}
                    title="Loop"
                  >
                    <Repeat size={16} />
                  </button>
                  <button
                    data-testid="stem-record-mix"
                    onClick={toggleRecord}
                    disabled={recBusy}
                    className={`h-9 px-3 flex items-center gap-1.5 rounded-lg border text-xs font-700 transition disabled:opacity-50 ${
                      recording
                        ? "border-[var(--hl-onair)] text-[var(--hl-onair)] bg-[rgba(255,23,68,0.12)]"
                        : "border-[var(--hl-onair)] text-[var(--hl-onair)] hover:bg-[rgba(255,23,68,0.1)]"
                    }`}
                    title="Record the live isolated mix (with your fader moves) to a WAV file"
                  >
                    {recBusy ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : recording ? (
                      <Square size={12} className="fill-current" />
                    ) : (
                      <Circle size={12} className="fill-current" />
                    )}
                    {recBusy ? "Saving…" : recording ? formatTime(recSec) : "REC MIX"}
                  </button>
                  <span className="ml-auto text-xs tabular-nums text-[var(--hl-muted)]" data-testid="stem-time">
                    {formatTime(pos)} / {formatTime(dur)}
                  </span>
                </div>
                <input
                  data-testid="stem-seek"
                  type="range"
                  min="0"
                  max={dur || 1}
                  step="0.1"
                  value={pos}
                  onChange={(e) => seek(Number(e.target.value))}
                  className="hl-range w-full"
                />
                {lastMix && (
                  <button
                    data-testid="stem-send-deck"
                    onClick={() => onSendMixToDeck && onSendMixToDeck(lastMix.blob, lastMix.name)}
                    className="w-full h-9 flex items-center justify-center gap-2 rounded-lg border border-[var(--hl-cue)] text-[var(--hl-cue)] text-xs font-700 hover:bg-[rgba(46,229,196,0.12)] transition"
                    title="Arm the last recorded stem mix on the standby deck for a live drop"
                  >
                    <Radio size={14} /> Send mix to standby deck
                  </button>
                )}
              </div>

              {/* Stem channels */}
              <div className="space-y-2" data-testid="stem-channels">
                {STEMS.map(({ id, label, color }) => (
                  <div
                    key={id}
                    data-testid={`stem-row-${id}`}
                    className="rounded-xl border border-[var(--hl-line)] p-2.5"
                    style={{ borderLeft: `3px solid ${color}` }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-600 w-16 shrink-0" style={{ color }}>
                        {label}
                      </span>
                      <button
                        data-testid={`stem-mute-${id}`}
                        onClick={() => toggleMute(id)}
                        className={`h-7 w-7 grid place-items-center rounded-md border ${
                          mutes[id]
                            ? "border-[var(--hl-onair)] text-[var(--hl-onair)] bg-[rgba(255,23,68,0.12)]"
                            : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-white"
                        }`}
                        title={mutes[id] ? "Un-mute" : "Mute"}
                      >
                        {mutes[id] ? <VolumeX size={14} /> : <Volume2 size={14} />}
                      </button>
                      <button
                        data-testid={`stem-solo-${id}`}
                        onClick={() => toggleSolo(id)}
                        className={`h-7 px-2 grid place-items-center rounded-md border text-[10px] font-700 tracking-wider ${
                          soloId === id
                            ? "border-[var(--hl-cue)] text-black bg-[var(--hl-cue)]"
                            : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-cue)]"
                        }`}
                        title="Solo (isolate this stem)"
                      >
                        SOLO
                      </button>
                      <input
                        data-testid={`stem-level-${id}`}
                        type="range"
                        min="0"
                        max="1.5"
                        step="0.01"
                        value={levels[id]}
                        onChange={(e) => setLevel(id, Number(e.target.value))}
                        className="hl-range flex-1"
                      />
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <select
                        data-testid={`stem-pad-select-${id}`}
                        value={padTarget[id] != null ? padTarget[id] : ""}
                        onChange={(e) =>
                          setPadTarget((p) => ({ ...p, [id]: e.target.value === "" ? null : Number(e.target.value) }))
                        }
                        className="h-7 bg-black/50 border border-[var(--hl-line)] rounded-md px-1.5 text-[11px] outline-none focus:border-[var(--hl-cue)]"
                      >
                        <option value="">Auto pad</option>
                        {Array.from({ length: PAD_COUNT }).map((_, i) => (
                          <option key={i} value={i}>
                            Pad {i + 1}
                          </option>
                        ))}
                      </select>
                      <button
                        data-testid={`stem-send-pad-${id}`}
                        onClick={() => sendToPad(id)}
                        disabled={busyStem === `pad-${id}`}
                        className="h-7 px-2.5 flex items-center gap-1 rounded-md border border-[var(--hl-amber)] text-[var(--hl-amber)] text-[11px] font-600 hover:bg-[rgba(255,171,0,0.12)] disabled:opacity-50"
                        title="Render this isolated stem onto a jingle pad"
                      >
                        {busyStem === `pad-${id}` ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                        Send to pad
                      </button>
                      <button
                        data-testid={`stem-export-wav-${id}`}
                        onClick={() => exportStem(id, "wav")}
                        disabled={busyStem === `exp-${id}`}
                        className="h-7 px-2.5 flex items-center gap-1 rounded-md border border-[var(--hl-line)] text-[var(--hl-muted)] text-[11px] hover:text-white hover:border-white disabled:opacity-50"
                        title="Download this stem as WAV"
                      >
                        {busyStem === `exp-${id}` ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                        WAV
                      </button>
                      <button
                        data-testid={`stem-export-mp3-${id}`}
                        onClick={() => exportStem(id, "mp3")}
                        disabled={busyStem === `exp-${id}`}
                        className="h-7 px-2.5 flex items-center gap-1 rounded-md border border-[var(--hl-line)] text-[var(--hl-muted)] text-[11px] hover:text-white hover:border-white disabled:opacity-50"
                        title="Download this stem as MP3"
                      >
                        <Download size={12} /> MP3
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-start gap-2 text-[11px] text-[var(--hl-muted)]">
                <Headphones size={13} className="mt-0.5 shrink-0 text-[var(--hl-cue)]" />
                Real-time DSP isolation (mid/side + multiband). Approximate, instant and offline — great
                for live acappella / instrumental drops. Solo a stem, then “Send to pad” to trigger it live.
              </div>
            </>
          ) : (
            <div className="text-center text-[var(--hl-muted)] text-sm py-8" data-testid="stem-empty">
              Choose a track above to split it into Vocals, Music, Bass &amp; Drums.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
