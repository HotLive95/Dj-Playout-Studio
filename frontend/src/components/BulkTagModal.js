import React, { useState } from "react";
import { X, Tags, Loader2, RefreshCw, FileText, Users, Save } from "lucide-react";
import { readNamesOnly, parseFilename } from "../lib/id3";
import { platform } from "../lib/platform";

// Bulk-edit Artist + Song Title for every track in a playlist in one pass, with
// one-click helpers: re-read embedded tags, parse from filename, set one artist.
export default function BulkTagModal({ playlist, tracks, getUrl, onSaveAll, onClose }) {
  const items = playlist.trackIds.map((id) => tracks[id]).filter(Boolean);
  const [rows, setRows] = useState(() =>
    items.map((t) => ({ id: t.id, name: t.name, title: t.title || t.name, artist: t.artist || "" }))
  );
  const [busy, setBusy] = useState("");
  const [allArtist, setAllArtist] = useState("");

  const setRow = (id, patch) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const rereadTags = async () => {
    setBusy("Re-reading embedded tags…");
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const url = await getUrl(tracks[next[i].id]);
        // eslint-disable-next-line no-await-in-loop
        const blob = url ? await (await fetch(url)).blob() : null;
        // eslint-disable-next-line no-await-in-loop
        const { title, artist } = await readNamesOnly(blob, next[i].name);
        next[i] = { ...next[i], title: title || next[i].title, artist: artist || next[i].artist };
      } catch {
        /* keep current */
      }
    }
    setRows(next);
    setBusy("");
  };

  const parseFromFilenames = () => {
    setRows((prev) =>
      prev.map((r) => {
        const { title, artist } = parseFilename(r.name);
        return { ...r, title: title || r.title, artist: artist || r.artist };
      })
    );
  };

  const applyArtistToAll = () => {
    if (!allArtist.trim()) return;
    setRows((prev) => prev.map((r) => ({ ...r, artist: allArtist.trim() })));
  };

  const saveAll = () => {
    const updates = {};
    rows.forEach((r) => {
      updates[r.id] = { title: r.title.trim(), artist: r.artist.trim() };
    });
    onSaveAll(updates);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4"
      data-testid="bulk-tag-modal"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="w-full max-w-2xl rounded-2xl border border-[var(--hl-line)] bg-[var(--hl-panel)] shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <Tags size={18} className="text-[var(--hl-fire)] shrink-0" />
            <div className="min-w-0">
              <div className="font-display font-700 tracking-wide truncate">Bulk Edit Tags</div>
              <div className="text-xs text-[var(--hl-muted)] truncate">
                {playlist.name} · {items.length} tracks
              </div>
            </div>
          </div>
          <button
            data-testid="bulk-close"
            onClick={() => !busy && onClose()}
            className="h-8 w-8 grid place-items-center rounded hover:bg-white/10 text-[var(--hl-muted)]"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-[var(--hl-line)] flex flex-wrap items-center gap-2">
          <button
            data-testid="bulk-reread"
            onClick={rereadTags}
            disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-fire)] disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Re-read tags
          </button>
          <button
            data-testid="bulk-parse-filenames"
            onClick={parseFromFilenames}
            disabled={!!busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-amber)] disabled:opacity-50"
          >
            <FileText size={14} /> Parse from filenames
          </button>
          <div className="flex items-center gap-1.5 ml-auto">
            <Users size={14} className="text-[var(--hl-muted)]" />
            <input
              data-testid="bulk-all-artist"
              value={allArtist}
              onChange={(e) => setAllArtist(e.target.value)}
              placeholder="Artist for all…"
              className="w-40 bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--hl-fire)]"
            />
            <button
              data-testid="bulk-apply-artist"
              onClick={applyArtistToAll}
              className="px-3 py-1.5 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-fire)]"
            >
              Apply
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-4 space-y-2">
          {busy && (
            <div className="text-xs text-[var(--hl-amber)] flex items-center gap-2" data-testid="bulk-status">
              <Loader2 size={13} className="animate-spin" /> {busy}
            </div>
          )}
          {rows.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2" data-testid={`bulk-row-${i}`}>
              <span className="w-6 text-right text-xs text-[var(--hl-muted)] tabular-nums shrink-0">
                {i + 1}
              </span>
              <input
                data-testid={`bulk-title-${i}`}
                value={r.title}
                onChange={(e) => setRow(r.id, { title: e.target.value })}
                placeholder="Song title"
                className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--hl-fire)]"
              />
              <input
                data-testid={`bulk-artist-${i}`}
                value={r.artist}
                onChange={(e) => setRow(r.id, { artist: e.target.value })}
                placeholder="Artist"
                className="w-48 shrink-0 bg-black/50 border border-[var(--hl-line)] rounded px-2 py-1.5 text-sm outline-none focus:border-[var(--hl-amber)]"
              />
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-[var(--hl-line)] flex justify-end gap-2">
          <button
            onClick={() => !busy && onClose()}
            className="px-4 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-white"
          >
            Cancel
          </button>
          <button
            data-testid="bulk-save"
            onClick={saveAll}
            disabled={!!busy}
            className="flex items-center gap-2 px-4 py-2 rounded-lg hl-fire-gradient text-white font-700 disabled:opacity-50"
          >
            <Save size={16} /> Save all
          </button>
        </div>
      </div>
    </div>
  );
}
