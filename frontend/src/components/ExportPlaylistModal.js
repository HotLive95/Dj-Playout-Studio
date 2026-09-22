import React, { useState } from "react";
import { X, Download, Loader2, Music2, Scissors } from "lucide-react";
import JSZip from "jszip";
import { exportPlaylistToBlob, exportPlaylistInParts, downloadBlob, datedFilename } from "../lib/playlistExport";

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
  const [split, setSplit] = useState(false);
  const [partMinutes, setPartMinutes] = useState(30);
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
      if (split) {
        const { parts, skipped: skippedNames } = await exportPlaylistInParts({
          items,
          format,
          crossfade: xfade,
          crossfadeSeconds,
          maxMinutes: partMinutes,
          onProgress: setProgress,
          onStatus: setStatus,
        });
        setStatus("Zipping parts…");
        const zip = new JSZip();
        const safe = (playlist.name || "playlist").replace(/[^a-z0-9\-_ ]/gi, "").trim() || "playlist";
        parts.forEach((p) => {
          const pn = String(p.index).padStart(2, "0");
          zip.file(datedFilename(`${safe} Part ${pn} of ${p.total}`, format), p.blob);
        });
        const zipBlob = await zip.generateAsync({ type: "blob" });
        downloadBlob(zipBlob, datedFilename(`${safe} (${parts.length} parts)`, "zip"));
        if (skippedNames.length) {
          setSkipped(skippedNames);
          setStatus(`Saved ${parts.length} parts`);
        } else {
          setStatus(`Saved ${parts.length} parts!`);
          setTimeout(() => onClose(), 900);
        }
      } else {
        const { blob, skipped: skippedNames, decodedCount } = await exportPlaylistToBlob({
          items,
          format,
          crossfade: xfade,
          crossfadeSeconds,
          onProgress: setProgress,
          onStatus: setStatus,
        });
        downloadBlob(blob, datedFilename(playlist.name, format));
        if (skippedNames.length) {
          setSkipped(skippedNames);
          setStatus(`Saved ${decodedCount} of ${items.length} tracks`);
        } else {
          setStatus("Saved!");
          setTimeout(() => onClose(), 800);
        }
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

          <div className="rounded-lg border border-[var(--hl-line)] p-3 space-y-2.5">
            <label
              className="flex items-center gap-2.5 text-sm cursor-pointer select-none"
              data-testid="export-split-label"
            >
              <input
                type="checkbox"
                data-testid="export-split"
                checked={split}
                onChange={(e) => setSplit(e.target.checked)}
                disabled={busy}
                className="h-4 w-4 accent-[var(--hl-fire)]"
              />
              <Scissors size={15} className="text-[var(--hl-amber)]" />
              Split into device-friendly parts (one .zip)
            </label>
            {split && (
              <div className="flex items-center gap-2 pl-7">
                <span className="text-xs text-[var(--hl-muted)]">Max length per part</span>
                <select
                  data-testid="export-part-minutes"
                  value={partMinutes}
                  onChange={(e) => setPartMinutes(Number(e.target.value))}
                  disabled={busy}
                  className="h-9 px-2 rounded-lg bg-black/50 border border-[var(--hl-line)] text-sm outline-none focus:border-[var(--hl-fire)]"
                >
                  {[15, 20, 30, 45, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

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
            {busy ? "Working…" : split ? "Save in parts (.zip)" : `Save as ${format.toUpperCase()}`}
          </button>
          <p className="text-[11px] text-[var(--hl-muted)] leading-relaxed">
            Big playlists take a moment to render — keep this window open until the download starts.
          </p>
        </div>
      </div>
    </div>
  );
}
