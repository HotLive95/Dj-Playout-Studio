import React, { useState } from "react";
import { X, Download, Loader2, Music2 } from "lucide-react";
import { decodeToBuffer, bufferToWav, bufferToMp3 } from "../lib/audioProcessing";
import { platform } from "../lib/platform";
import { formatTotal } from "../lib/format";

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Renders every track in a playlist (in order, honouring each track's In/Out cues)
// into one continuous file and downloads it. Optional crossfade blends adjacent
// tracks. Runs fully offline via OfflineAudioContext.
export default function ExportPlaylistModal({
  playlist,
  tracks,
  defaultCrossfade = false,
  crossfadeSeconds = 3,
  onClose,
}) {
  const [format, setFormat] = useState("mp3");
  const [xfade, setXfade] = useState(!!defaultCrossfade);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [skipped, setSkipped] = useState([]);

  if (!playlist) return null;
  const items = playlist.trackIds.map((id) => tracks[id]).filter(Boolean);

  const run = async () => {
    setBusy(true);
    setError("");
    setSkipped([]);
    setProgress(0);
    try {
      const targetSR = 44100;
      const decoded = [];
      const skippedNames = [];
      for (let i = 0; i < items.length; i++) {
        setStatus(`Decoding ${i + 1}/${items.length} · ${items[i].name}`);
        setProgress(Math.round(((i + 0.5) / items.length) * 55));
        let buf;
        try {
          // eslint-disable-next-line no-await-in-loop
          const url = await platform.getUrl(items[i]);
          // eslint-disable-next-line no-await-in-loop
          buf = await decodeToBuffer(url);
        } catch {
          skippedNames.push(items[i].name);
          continue;
        }
        const inP = items[i].cueIn != null ? Math.max(0, items[i].cueIn) : 0;
        const outP = items[i].cueOut != null ? items[i].cueOut : buf.duration;
        decoded.push({ buf, offset: inP, dur: Math.max(0.05, outP - inP) });
      }

      if (decoded.length === 0) {
        throw new Error(
          "None of these tracks could be read — their audio files aren't available on this device. Re-import the files into the playlist, then try again."
        );
      }

      const n = decoded.length;
      const durs = decoded.map((d) => d.dur);
      const xf = xfade ? Math.max(0, crossfadeSeconds) : 0;
      // Timeline: each track starts after the previous, overlapping by the crossfade.
      const starts = [0];
      for (let i = 1; i < n; i++) {
        const gap = Math.min(xf, durs[i - 1] / 2, durs[i] / 2);
        starts[i] = starts[i - 1] + durs[i - 1] - gap;
      }
      const totalSec = starts[n - 1] + durs[n - 1];
      setStatus(`Rendering ${formatTotal(totalSec)} of audio…`);
      setProgress(60);

      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oac = new OAC(2, Math.max(1, Math.ceil(totalSec * targetSR)), targetSR);
      for (let i = 0; i < n; i++) {
        const d = decoded[i];
        const startAt = starts[i];
        const endAt = startAt + d.dur;
        const fadeIn = i > 0 ? starts[i - 1] + durs[i - 1] - startAt : 0;
        const fadeOut = i < n - 1 ? endAt - starts[i + 1] : 0;
        const src = oac.createBufferSource();
        src.buffer = d.buf;
        const g = oac.createGain();
        src.connect(g);
        g.connect(oac.destination);
        g.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : 1, startAt);
        if (fadeIn > 0) g.gain.linearRampToValueAtTime(1, startAt + fadeIn);
        if (fadeOut > 0) {
          g.gain.setValueAtTime(1, Math.max(startAt, endAt - fadeOut));
          g.gain.linearRampToValueAtTime(0.0001, endAt);
        }
        src.start(startAt, d.offset, d.dur);
      }
      const rendered = await oac.startRendering();

      setStatus(`Encoding ${format.toUpperCase()}…`);
      setProgress(70);
      await new Promise((r) => setTimeout(r, 30));
      const blob =
        format === "mp3"
          ? await bufferToMp3(rendered, 192, (p) => setProgress(70 + Math.round(p * 29)))
          : bufferToWav(rendered);

      setProgress(100);
      const safe = playlist.name.replace(/[^a-z0-9\-_ ]/gi, "").trim() || "playlist";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${safe} ${today()}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      if (skippedNames.length) {
        setSkipped(skippedNames);
        setStatus(`Saved ${decoded.length} of ${items.length} tracks`);
      } else {
        setStatus("Saved!");
        setTimeout(() => onClose(), 800);
      }
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

          <label
            className="flex items-center gap-2.5 text-sm cursor-pointer select-none"
            data-testid="export-crossfade-label"
          >
            <input
              type="checkbox"
              data-testid="export-crossfade"
              checked={xfade}
              onChange={(e) => setXfade(e.target.checked)}
              disabled={busy}
              className="h-4 w-4 accent-[var(--hl-fire)]"
            />
            Crossfade tracks ({crossfadeSeconds}s blend) for a seamless mix
          </label>

          {(busy || progress > 0) && (
            <div>
              <div className="h-2 w-full rounded-full bg-[#2a2a31] overflow-hidden">
                <div
                  data-testid="export-progress-bar"
                  className="h-full hl-fire-gradient transition-[width] duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div
                className="flex items-center justify-between mt-1.5 text-xs text-[var(--hl-amber)]"
                data-testid="export-status"
              >
                <span className="flex items-center gap-2 truncate">
                  {busy && <Loader2 size={13} className="animate-spin shrink-0" />}
                  <span className="truncate">{status}</span>
                </span>
                <span className="tabular-nums shrink-0 ml-2" data-testid="export-progress-pct">
                  {progress}%
                </span>
              </div>
            </div>
          )}
          {error && (
            <div className="text-sm text-[var(--hl-onair)]" data-testid="export-error">
              {error}
            </div>
          )}
          {skipped.length > 0 && (
            <div
              className="text-sm text-[var(--hl-amber)] bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2"
              data-testid="export-skipped"
            >
              Skipped {skipped.length} track{skipped.length === 1 ? "" : "s"} whose audio file
              couldn't be read (re-import to include): {skipped.join(", ")}
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
