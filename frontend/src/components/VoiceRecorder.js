import React, { useRef, useState, useEffect } from "react";
import { Mic, Square, Play, Pause, Save, X, Circle } from "lucide-react";
import { formatTime } from "../lib/format";
import { audioCtx, bufferToWav } from "../lib/audioProcessing";

export default function VoiceRecorder({ existingTracks, defaultIndex, onClose, onSave }) {
  const [status, setStatus] = useState("idle"); // idle | recording | recorded | error
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState(
    `Voice Track ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  );
  const [insertIndex, setInsertIndex] = useState(defaultIndex ?? existingTracks.length);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);

  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const previewRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (previewRef.current) previewRef.current.pause();
    };
  }, []);

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
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
    }
  };

  const stopRec = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="voice-recorder-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Voice Track</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {status === "error" && (
            <div className="text-[var(--hl-onair)] text-sm text-center" data-testid="voice-error">
              Microphone unavailable or permission denied.
            </div>
          )}

          <div className="grid place-items-center py-3">
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
              {status === "recording" ? `● ${formatTime(elapsed)}` : status === "recorded" ? "Recorded — preview & save" : "Tap to record"}
            </div>
          </div>

          {status === "recorded" && (
            <>
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">Name</label>
                <input
                  data-testid="voice-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]"
                />
              </div>
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
                      After: {t.name}
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
