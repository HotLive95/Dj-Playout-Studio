import React, { useRef, useState, useEffect } from "react";
import { Mic, Square, Play, Pause, Save, X, Circle, Music2, Headphones, AlertTriangle } from "lucide-react";
import { formatTime } from "../lib/format";
import { audioCtx, bufferToWav } from "../lib/audioProcessing";

// Voice-over booth: record a mic take while an optional music BED plays in your
// headphones. Route the mic to headphones too so you hear yourself + the bed as
// you record. Optionally mix the bed into the saved file. The bed advances to
// the next track (looping the source) if your take runs longer than the track.
export default function VoiceRecorder({
  existingTracks,
  defaultIndex,
  playlists = [],
  tracks = {},
  jingles = [],
  getUrl,
  onClose,
  onSave,
}) {
  const [status, setStatus] = useState("idle"); // idle | recording | recorded | error
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState(
    `Voice Track ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  );
  const [insertIndex, setInsertIndex] = useState(defaultIndex ?? existingTracks.length);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  // --- Music bed + monitoring settings ---
  const [bedType, setBedType] = useState("none"); // none | playlist | jingle | upload
  const [bedPlaylistId, setBedPlaylistId] = useState(playlists[0]?.id || "");
  const [bedStartIndex, setBedStartIndex] = useState(0);
  const [bedJingleIndex, setBedJingleIndex] = useState(
    jingles.findIndex((j) => !!j) >= 0 ? jingles.findIndex((j) => !!j) : 0
  );
  const [bedFile, setBedFile] = useState(null);
  const [bedVolume, setBedVolume] = useState(0.5);
  const [micMonitor, setMicMonitor] = useState(false);
  const [micMonitorVol, setMicMonitorVol] = useState(0.8);
  const [mixBed, setMixBed] = useState(false);
  const [bedNowPlaying, setBedNowPlaying] = useState("");

  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const previewRef = useRef(null);
  const timerRef = useRef(null);

  const ctxRef = useRef(null);
  const micSrcRef = useRef(null);
  const micMonRef = useRef(null);
  const mixDestRef = useRef(null);
  const bedElRef = useRef(null);
  const bedSrcRef = useRef(null);
  const bedGainRef = useRef(null);
  const bedItemsRef = useRef([]);
  const bedPosRef = useRef(0);
  const bedFileUrlRef = useRef(null);

  useEffect(() => {
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-update monitor / bed gains while recording.
  useEffect(() => {
    if (micMonRef.current) micMonRef.current.gain.value = micMonitor ? micMonitorVol : 0;
  }, [micMonitor, micMonitorVol]);
  useEffect(() => {
    if (bedGainRef.current) bedGainRef.current.gain.value = bedVolume;
  }, [bedVolume]);

  const teardown = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (previewRef.current) previewRef.current.pause();
    if (bedElRef.current) {
      bedElRef.current.pause();
      bedElRef.current.onended = null;
    }
    if (bedFileUrlRef.current) {
      URL.revokeObjectURL(bedFileUrlRef.current);
      bedFileUrlRef.current = null;
    }
    try {
      if (ctxRef.current && ctxRef.current.state !== "closed") ctxRef.current.close();
    } catch {
      /* ignore */
    }
    ctxRef.current = null;
  };

  const buildBedItems = () => {
    if (bedType === "playlist") {
      const pl = playlists.find((p) => p.id === bedPlaylistId);
      if (!pl) return [];
      return pl.trackIds
        .slice(bedStartIndex)
        .map((id) => tracks[id])
        .filter(Boolean)
        .map((t) => ({ kind: "track", item: t, label: t.title || t.name }));
    }
    if (bedType === "jingle") {
      const j = jingles[bedJingleIndex];
      return j ? [{ kind: "track", item: j, label: j.name }] : [];
    }
    if (bedType === "upload" && bedFile) {
      return [{ kind: "file", item: bedFile, label: bedFile.name }];
    }
    return [];
  };

  const loadBedAt = async (pos) => {
    const items = bedItemsRef.current;
    const el = bedElRef.current;
    if (!items.length || !el) return;
    const n = items.length;
    const idx = ((pos % n) + n) % n;
    bedPosRef.current = idx;
    const it = items[idx];
    let url;
    if (it.kind === "file") {
      if (bedFileUrlRef.current) URL.revokeObjectURL(bedFileUrlRef.current);
      bedFileUrlRef.current = URL.createObjectURL(it.item);
      url = bedFileUrlRef.current;
    } else {
      url = await getUrl(it.item);
    }
    if (!url) return;
    setBedNowPlaying(it.label);
    el.src = url;
    try {
      el.currentTime = 0;
      await el.play();
    } catch {
      /* ignore */
    }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const micSrc = ctx.createMediaStreamSource(stream);
      micSrcRef.current = micSrc;

      // Mic monitor to headphones (default silent until enabled).
      const micMon = ctx.createGain();
      micMon.gain.value = micMonitor ? micMonitorVol : 0;
      micSrc.connect(micMon);
      micMon.connect(ctx.destination);
      micMonRef.current = micMon;

      // Recording bus: mic always recorded; bed added only in "mix" mode.
      const mixDest = ctx.createMediaStreamDestination();
      micSrc.connect(mixDest);
      mixDestRef.current = mixDest;

      // Music bed.
      const items = buildBedItems();
      bedItemsRef.current = items;
      bedPosRef.current = 0;
      if (items.length) {
        const el = new Audio();
        el.crossOrigin = "anonymous";
        el.preload = "auto";
        bedElRef.current = el;
        const bedSrc = ctx.createMediaElementSource(el);
        bedSrcRef.current = bedSrc;
        const bedGain = ctx.createGain();
        bedGain.gain.value = bedVolume;
        bedGainRef.current = bedGain;
        bedSrc.connect(bedGain);
        bedGain.connect(ctx.destination); // headphones monitor
        if (mixBed) bedGain.connect(mixDest); // also record it
        el.onended = () => loadBedAt(bedPosRef.current + 1); // advance / loop
        await loadBedAt(0);
      }

      const rec = new MediaRecorder(mixDest.stream);
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => {
        blobRef.current = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blobRef.current);
        previewRef.current = new Audio(url);
        previewRef.current.onended = () => setPlaying(false);
        setStatus("recorded");
      };
      rec.start();
      recRef.current = rec;
      setStatus("recording");
      setElapsed(0);
      const t0 = Date.now();
      timerRef.current = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    } catch {
      setStatus("error");
      teardown();
    }
  };

  const stopRec = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (bedElRef.current) bedElRef.current.pause();
    setBedNowPlaying("");
  };

  const togglePreview = () => {
    const a = previewRef.current;
    if (!a) return;
    if (a.paused) {
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const save = async () => {
    if (!blobRef.current) return;
    setBusy(true);
    try {
      const arr = await blobRef.current.arrayBuffer();
      const buf = await audioCtx().decodeAudioData(arr.slice(0));
      const wav = bufferToWav(buf);
      await onSave(wav, `${name}.wav`, insertIndex, buf.duration);
      onClose();
    } catch {
      setBusy(false);
      setStatus("error");
    }
  };

  const assignedJingles = jingles
    .map((j, i) => ({ j, i }))
    .filter((x) => x.j);
  const bedPlaylist = playlists.find((p) => p.id === bedPlaylistId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="voice-recorder-modal"
      onMouseDown={(e) => e.target === e.currentTarget && status !== "recording" && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Voice Booth</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {status === "error" && (
            <div className="text-[var(--hl-onair)] text-sm text-center" data-testid="voice-error">
              Microphone unavailable or permission denied.
            </div>
          )}

          <div className="grid place-items-center py-1">
            {status !== "recorded" ? (
              <button
                data-testid="voice-record-toggle"
                onClick={status === "recording" ? stopRec : startRec}
                className={`h-20 w-20 grid place-items-center rounded-full border-2 transition ${
                  status === "recording"
                    ? "border-[var(--hl-onair)] bg-[rgba(255,23,68,0.15)] text-[var(--hl-onair)] hl-onair-dot"
                    : "border-[var(--hl-fire)] text-[var(--hl-fire)] hover:bg-[rgba(255,90,31,0.1)]"
                }`}
                title={status === "recording" ? "Stop" : "Record"}
              >
                {status === "recording" ? <Square size={28} /> : <Circle size={28} fill="currentColor" />}
              </button>
            ) : (
              <button
                data-testid="voice-preview-toggle"
                onClick={togglePreview}
                className="h-20 w-20 grid place-items-center rounded-full hl-fire-gradient text-white"
              >
                {playing ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
              </button>
            )}
            <div className="mt-2 text-sm text-[var(--hl-muted)] tabular-nums" data-testid="voice-elapsed">
              {status === "recording"
                ? `● ${formatTime(elapsed)}${bedNowPlaying ? ` · bed: ${bedNowPlaying}` : ""}`
                : status === "recorded"
                ? "Recorded — preview & save"
                : "Tap to record"}
            </div>
          </div>

          {/* Music bed + monitoring setup (hidden once a take exists) */}
          {status !== "recorded" && (
            <div className="space-y-3 rounded-xl border border-[var(--hl-line)] p-3.5">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                <Music2 size={14} className="text-[var(--hl-amber)]" /> Music bed (underlayment)
              </div>
              <select
                data-testid="voice-bed-type"
                value={bedType}
                onChange={(e) => setBedType(e.target.value)}
                disabled={status === "recording"}
                className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
              >
                <option value="none">No bed — voice only</option>
                <option value="playlist">From a playlist (advances track to track)</option>
                <option value="jingle">From a jingle pad</option>
                <option value="upload">Upload / choose a file</option>
              </select>

              {bedType === "playlist" && (
                <div className="grid grid-cols-2 gap-2">
                  <select
                    data-testid="voice-bed-playlist"
                    value={bedPlaylistId}
                    onChange={(e) => {
                      setBedPlaylistId(e.target.value);
                      setBedStartIndex(0);
                    }}
                    disabled={status === "recording"}
                    className="bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                  >
                    {playlists.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <select
                    data-testid="voice-bed-start"
                    value={bedStartIndex}
                    onChange={(e) => setBedStartIndex(Number(e.target.value))}
                    disabled={status === "recording"}
                    className="bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                  >
                    {(bedPlaylist?.trackIds || []).map((id, i) => {
                      const t = tracks[id];
                      if (!t) return null;
                      return (
                        <option key={id} value={i}>
                          Start: {t.title || t.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              {bedType === "jingle" && (
                <select
                  data-testid="voice-bed-jingle"
                  value={bedJingleIndex}
                  onChange={(e) => setBedJingleIndex(Number(e.target.value))}
                  disabled={status === "recording"}
                  className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                >
                  {assignedJingles.length === 0 && <option value={0}>No jingle pads assigned</option>}
                  {assignedJingles.map(({ j, i }) => (
                    <option key={i} value={i}>
                      Pad {i + 1}: {j.name}
                    </option>
                  ))}
                </select>
              )}

              {bedType === "upload" && (
                <input
                  data-testid="voice-bed-file-input"
                  type="file"
                  accept=".mp3,.wav,.m4a,audio/*"
                  disabled={status === "recording"}
                  onChange={(e) => setBedFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-[var(--hl-muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[var(--hl-fire)] file:text-white"
                />
              )}

              {bedType !== "none" && (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--hl-muted)] w-24 shrink-0">Bed volume</span>
                    <input
                      data-testid="voice-bed-volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={bedVolume}
                      onChange={(e) => setBedVolume(Number(e.target.value))}
                      className="hl-range flex-1"
                    />
                    <span className="text-xs tabular-nums w-9 text-right">{Math.round(bedVolume * 100)}%</span>
                  </div>
                  <label
                    className="flex items-center gap-2.5 text-sm cursor-pointer select-none"
                    data-testid="voice-mix-label"
                  >
                    <input
                      type="checkbox"
                      data-testid="voice-mix-toggle"
                      checked={mixBed}
                      onChange={(e) => setMixBed(e.target.checked)}
                      disabled={status === "recording"}
                      className="h-4 w-4 accent-[var(--hl-fire)]"
                    />
                    Mix the bed into the saved file (off = record my voice only)
                  </label>
                </>
              )}
            </div>
          )}

          {/* Mic monitor to headphones */}
          {status !== "recorded" && (
            <div className="space-y-2.5 rounded-xl border border-[var(--hl-line)] p-3.5">
              <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  data-testid="voice-mic-monitor-toggle"
                  checked={micMonitor}
                  onChange={(e) => setMicMonitor(e.target.checked)}
                  className="h-4 w-4 accent-[var(--hl-fire)]"
                />
                <Headphones size={15} className="text-[var(--hl-amber)]" />
                Hear my mic in my headphones (monitor)
              </label>
              {micMonitor && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--hl-muted)] w-24 shrink-0">Monitor vol</span>
                  <input
                    data-testid="voice-mic-monitor-volume"
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={micMonitorVol}
                    onChange={(e) => setMicMonitorVol(Number(e.target.value))}
                    className="hl-range flex-1"
                  />
                  <span className="text-xs tabular-nums w-9 text-right">
                    {Math.round(micMonitorVol * 100)}%
                  </span>
                </div>
              )}
              <div
                className="flex items-start gap-2 text-[11px] text-[var(--hl-amber)]"
                data-testid="voice-monitor-warning"
              >
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                Use headphones. On laptop speakers this causes echo/feedback.
              </div>
            </div>
          )}

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">File name</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                data-testid="voice-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this recording"
                className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]"
              />
              <span className="text-sm text-[var(--hl-muted)] tabular-nums shrink-0">.wav</span>
            </div>
          </div>

          {status === "recorded" && (
            <>
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                  Insert position
                </label>
                <select
                  data-testid="voice-insert-position"
                  value={insertIndex}
                  onChange={(e) => setInsertIndex(Number(e.target.value))}
                  className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]"
                >
                  <option value={0}>At the start</option>
                  {existingTracks.map((t, i) => (
                    <option key={i} value={i + 1}>
                      After: {t.title || t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setStatus("idle")}
                  className="px-4 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-white"
                >
                  Re-record
                </button>
                <button
                  data-testid="voice-save"
                  disabled={busy}
                  onClick={save}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg hl-fire-gradient text-white font-600 disabled:opacity-50"
                >
                  <Save size={16} /> {busy ? "Saving…" : "Add to Playlist"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
