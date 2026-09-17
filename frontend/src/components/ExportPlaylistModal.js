import React, { useState } from "react";
import { X, Download, Loader2, Music2 } from "lucide-react";
import { decodeToBuffer, bufferToWav, bufferToMp3 } from "../lib/audioProcessing";
import { platform } from "../lib/platform";
import { formatTotal } from "../lib/format";

// Renders every track in a playlist (in order, honouring each track's In/Out cues)
// into one continuous file and downloads it. Runs fully offline via OfflineAudioContext.
export default function ExportPlaylistModal({ playlist, tracks, onClose }) {
  const [format, setFormat] = useState("mp3");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  if (!playlist) return null;
  const items = playlist.trackIds.map((id) => tracks[id]).filter(Boolean);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const targetSR = 44100;
      const decoded = [];
      for (let i = 0; i < items.length; i++) {
        setStatus(`Decoding ${i + 1}/${items.length} · ${items[i].name}`);
        // eslint-disable-next-line no-await-in-loop
        const url = await platform.getUrl(items[i]);
        // eslint-disable-next-line no-await-in-loop
        const buf = await decodeToBuffer(url);
        const inP = items[i].cueIn != null ? Math.max(0, items[i].cueIn) : 0;
        const outP = items[i].cueOut != null ? items[i].cueOut : buf.duration;
        decoded.push({ buf, offset: inP, dur: Math.max(0.01, outP - inP) });
      }
      const totalSec = decoded.reduce((s, d) => s + d.dur, 0);
      setStatus(`Rendering ${formatTotal(totalSec)} of audio…`);
      const frames = Math.max(1, Math.ceil(totalSec * targetSR));
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oac = new OAC(2, frames, targetSR);
      let when = 0;
      for (const d of decoded) {
        const src = oac.createBufferSource();
        src.buffer = d.buf;
        src.connect(oac.destination);
        src.start(when, d.offset, d.dur);
        when += d.dur;
      }
      const rendered = await oac.startRendering();
      setStatus(`Encoding ${format.toUpperCase()}…`);
      await new Promise((r) => setTimeout(r, 30));
      const blob = format === "mp3" ? bufferToMp3(rendered) : bufferToWav(rendered);
      const safe = playlist.name.replace(/[^a-z0-9\-_ ]/gi, "").trim() || "playlist";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safe}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setStatus("Saved!");
      setTimeout(() => onClose(), 800);
    } catch (e) {
      setError(e.message || "Export failed. A track file may be missing.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4"
      data-testid="export-playlist-modal"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--hl-line)] bg-[var(--hl-panel)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Download size={18} className="text-[var(--hl-fire)] shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-700 tracking-wide truncate">Save Playlist</div>
              <div className="text-xs text-[var(--hl-muted)] truncate">{playlist.name}</div>
            </div>
          </div>
          <button
            data-testid="export-close"
            onClick={() => !busy && onClose()}
            className="h-8 w-8 grid place-items-center rounded hover:bg-white/10 text-[var(--hl-muted)] disabled:opacity-40"
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm text-[var(--hl-muted)]">
            <Music2 size={15} />
            {items.length} track{items.length === 1 ? "" : "s"} · exported in order, one continuous file
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider text-[var(--hl-muted)]">
              Format
            </label>
            <select
              data-testid="export-format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={busy}
              className="mt-1 w-full h-10 px-3 rounded-lg bg-black/50 border border-[var(--hl-line)] text-sm outline-none focus:border-[var(--hl-fire)]"
            >
              <option value="mp3">MP3 (192 kbps · smaller)</option>
              <option value="wav">WAV (lossless · larger)</option>
            </select>
          </div>

          {status && (
            <div
              className="flex items-center gap-2 text-sm text-[var(--hl-amber)]"
              data-testid="export-status"
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              {status}
            </div>
          )}
          {error && (
            <div className="text-sm text-[var(--hl-onair)]" data-testid="export-error">
              {error}
            </div>
          )}

          <button
            data-testid="export-run"
            onClick={run}
            disabled={busy || items.length === 0}
            className="w-full h-11 rounded-xl hl-fire-gradient text-white font-700 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            {busy ? "Working…" : `Save as ${format.toUpperCase()}`}
          </button>
          <p className="text-[11px] text-[var(--hl-muted)] leading-relaxed">
            Big playlists take a moment to render — keep this window open until the download starts.
          </p>
        </div>
      </div>
    </div>
  );
}
