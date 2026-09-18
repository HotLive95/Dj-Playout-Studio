import React, { useState } from "react";
import { X, DownloadCloud, Loader2, CheckSquare, Square } from "lucide-react";
import { exportPlaylistToBlob, downloadBlob, datedFilename } from "../lib/playlistExport";

// Export several playlists to MP3/WAV in one click (great for overnight prep).
// Renders each selected playlist sequentially, downloading one file per playlist.
export default function BatchExportModal({
  playlists,
  tracks,
  defaultCrossfade = false,
  crossfadeSeconds = 3,
  onClose,
}) {
  const exportable = (playlists || []).filter((p) => p.trackIds.length > 0);
  const [selected, setSelected] = useState(() => new Set(exportable.map((p) => p.id)));
  const [format, setFormat] = useState("mp3");
  const [xfade, setXfade] = useState(!!defaultCrossfade);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const [results, setResults] = useState([]); // {name, ok, skipped, error}
  const [done, setDone] = useState(false);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const chosen = exportable.filter((p) => selected.has(p.id));

  const run = async () => {
    if (!chosen.length) return;
    setBusy(true);
    setDone(false);
    setResults([]);
    const out = [];
    for (let i = 0; i < chosen.length; i++) {
      const pl = chosen[i];
      const items = pl.trackIds.map((id) => tracks[id]).filter(Boolean);
      setStatus(`Rendering "${pl.name}" (${i + 1}/${chosen.length})…`);
      const base = i / chosen.length;
      try {
        // eslint-disable-next-line no-await-in-loop
        const { blob, skipped } = await exportPlaylistToBlob({
          items,
          format,
          crossfade: xfade,
          crossfadeSeconds,
          onProgress: (p) => setProgress(Math.round((base + p / 100 / chosen.length) * 100)),
        });
        downloadBlob(blob, datedFilename(pl.name, format));
        out.push({ name: pl.name, ok: true, skipped });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 400)); // let each download start
      } catch (e) {
        out.push({ name: pl.name, ok: false, error: e.message });
      }
      setResults([...out]);
    }
    setProgress(100);
    setStatus("Done");
    setDone(true);
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4"
      data-testid="batch-export-modal"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-lg rounded-2xl border border-[var(--hl-line)] bg-[var(--hl-panel)] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <DownloadCloud size={18} className="text-[var(--hl-fire)] shrink-0" />
            <div className="font-display font-700 tracking-wide truncate">Batch Export</div>
          </div>
          <button
            data-testid="batch-export-close"
            onClick={() => !busy && onClose()}
            className="h-8 w-8 grid place-items-center rounded hover:bg-white/10 text-[var(--hl-muted)] disabled:opacity-40"
            disabled={busy}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {exportable.length === 0 ? (
            <div className="text-sm text-[var(--hl-muted)]" data-testid="batch-empty">
              No playlists with tracks to export yet.
            </div>
          ) : (
            <>
              <div className="text-sm text-[var(--hl-muted)]">
                Pick the playlists to save — each becomes its own {format.toUpperCase()} file.
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-[var(--hl-line)] divide-y divide-[var(--hl-line)]">
                {exportable.map((pl) => {
                  const on = selected.has(pl.id);
                  return (
                    <button
                      key={pl.id}
                      data-testid={`batch-select-${pl.id}`}
                      onClick={() => !busy && toggle(pl.id)}
                      disabled={busy}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 disabled:opacity-60"
                    >
                      {on ? (
                        <CheckSquare size={18} className="text-[var(--hl-fire)] shrink-0" />
                      ) : (
                        <Square size={18} className="text-[var(--hl-muted)] shrink-0" />
                      )}
                      <span className="flex-1 min-w-0 truncate text-sm">{pl.name}</span>
                      <span className="text-xs text-[var(--hl-muted)] tabular-nums shrink-0">
                        {pl.trackIds.length} tracks
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="text-[11px] uppercase tracking-wider text-[var(--hl-muted)]">
                    Format
                  </label>
                  <select
                    data-testid="batch-format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value)}
                    disabled={busy}
                    className="mt-1 w-full h-10 px-3 rounded-lg bg-black/50 border border-[var(--hl-line)] text-sm outline-none focus:border-[var(--hl-fire)]"
                  >
                    <option value="mp3">MP3 (192 kbps)</option>
                    <option value="wav">WAV (lossless)</option>
                  </select>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none mt-5">
                  <input
                    type="checkbox"
                    data-testid="batch-crossfade"
                    checked={xfade}
                    onChange={(e) => setXfade(e.target.checked)}
                    disabled={busy}
                    className="h-4 w-4 accent-[var(--hl-fire)]"
                  />
                  Crossfade
                </label>
              </div>

              {(busy || progress > 0) && (
                <div>
                  <div className="h-2 w-full rounded-full bg-[#2a2a31] overflow-hidden">
                    <div
                      data-testid="batch-progress-bar"
                      className="h-full hl-fire-gradient transition-[width] duration-200"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div
                    className="flex items-center gap-2 mt-1.5 text-xs text-[var(--hl-amber)]"
                    data-testid="batch-status"
                  >
                    {busy && <Loader2 size={13} className="animate-spin shrink-0" />}
                    <span className="truncate">{status}</span>
                  </div>
                </div>
              )}

              {results.length > 0 && (
                <div className="space-y-1 text-xs" data-testid="batch-results">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={r.ok ? "text-[var(--hl-amber)]" : "text-[var(--hl-onair)]"}
                    >
                      {r.ok
                        ? `✓ ${r.name}${r.skipped?.length ? ` (skipped ${r.skipped.length})` : ""}`
                        : `✕ ${r.name} — ${r.error}`}
                    </div>
                  ))}
                </div>
              )}

              <button
                data-testid="batch-run"
                onClick={done ? onClose : run}
                disabled={busy || chosen.length === 0}
                className="w-full h-11 rounded-xl hl-fire-gradient text-white font-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <DownloadCloud size={18} />}
                {busy
                  ? "Working…"
                  : done
                  ? "Close"
                  : `Export ${chosen.length} playlist${chosen.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
