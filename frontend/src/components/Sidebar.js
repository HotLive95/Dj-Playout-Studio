import React, { useState, useRef } from "react";
import {
  Plus,
  Radio,
  Trash2,
  Pencil,
  Check,
  X,
  ListMusic,
  Clock,
  FolderDown,
  Shuffle,
  Download,
  DownloadCloud,
  Save,
  Upload,
} from "lucide-react";
import { formatTotal } from "../lib/format";
import InstallButton from "./InstallButton";

export default function Sidebar({
  playlists,
  currentPlaylistId,
  onSelect,
  onDropTracks,
  onCreate,
  onRename,
  onDelete,
  onSchedule,
  onExport,
  onImportPlaylist,
  onSavePlaylist,
  onBatchExport,
  durationOf,
  shuffleAll,
  onToggleShuffleAll,
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [dropTargetId, setDropTargetId] = useState(null);
  const importRef = useRef(null);

  const hasTrackDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("application/x-hl-tracks");
  const onPlDragOver = (e, plId) => {
    if (!hasTrackDrag(e)) return;
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = e.ctrlKey || e.metaKey ? "copy" : "move";
    } catch {
      /* ignore */
    }
    if (dropTargetId !== plId) setDropTargetId(plId);
  };
  const onPlDrop = (e, plId) => {
    if (!hasTrackDrag(e)) return;
    e.preventDefault();
    setDropTargetId(null);
    let ids = [];
    try {
      ids = JSON.parse(e.dataTransfer.getData("application/x-hl-tracks") || "[]");
    } catch {
      ids = [];
    }
    if (ids.length && onDropTracks) onDropTracks(plId, ids, e.ctrlKey || e.metaKey);
  };

  const submitCreate = () => {
    const name = newName.trim() || "New Playlist";
    onCreate(name);
    setNewName("");
    setCreating(false);
  };

  const submitRename = (id) => {
    onRename(id, editName.trim() || "Untitled");
    setEditingId(null);
  };

  return (
    <aside
      className="w-full md:w-72 shrink-0 h-auto md:h-full max-h-[30vh] md:max-h-none flex flex-col border-b md:border-b-0 md:border-r border-[var(--hl-line)] bg-[var(--hl-panel)]"
      data-testid="sidebar"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2 text-[var(--hl-muted)] uppercase text-xs tracking-[0.2em] font-600">
          <Radio size={15} className="text-[var(--hl-fire)]" />
          Playlists
        </div>
        <div className="flex items-center gap-1.5">
          <input
            ref={importRef}
            type="file"
            multiple
            accept=".hl95playout,.hl95playlist,.hlp.json,.json,application/json"
            className="hidden"
            data-testid="import-playlist-input"
            onChange={(e) => {
              if (e.target.files?.length) onImportPlaylist(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            data-testid="import-playlist-button"
            onClick={() => importRef.current?.click()}
            className="h-7 w-7 grid place-items-center rounded-md border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:border-[var(--hl-amber)] transition"
            title="Load a saved playlist (.hl95playlist) or shared show (.hl95playout)"
          >
            <Upload size={15} />
          </button>
          <button
            data-testid="batch-export-button"
            onClick={onBatchExport}
            className="h-7 w-7 grid place-items-center rounded-md border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:border-[var(--hl-fire)] transition"
            title="Batch export playlists to MP3 / WAV"
          >
            <DownloadCloud size={15} />
          </button>
          <button
            data-testid="new-playlist-button"
            onClick={() => setCreating(true)}
            className="h-7 w-7 grid place-items-center rounded-md hl-fire-gradient text-white hover:brightness-110 transition"
            title="New playlist"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      <div className="px-3 pb-2">
        <button
          data-testid="load-playlist-file-button"
          onClick={() => importRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:border-[var(--hl-amber)] transition py-2 text-xs font-600"
          title="Load a saved playlist (.hl95playlist) or shared show (.hl95playout)"
        >
          <Upload size={14} /> Load playlist file (.hl95playlist)
        </button>
      </div>

      {creating && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <input
            autoFocus
            data-testid="new-playlist-input"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCreate();
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Playlist name"
            className="flex-1 bg-black/50 border border-[var(--hl-line)] rounded-md px-2 py-1.5 text-sm outline-none focus:border-[var(--hl-fire)]"
          />
          <button
            data-testid="confirm-create-playlist"
            onClick={submitCreate}
            className="h-8 w-8 grid place-items-center rounded-md bg-[var(--hl-fire)] text-white"
          >
            <Check size={16} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto hl-scroll px-2 pb-3 space-y-1">
        {playlists.length === 0 && !creating && (
          <div className="text-center text-[var(--hl-muted)] text-sm px-4 py-10">
            No playlists yet. Create one to start building your show.
          </div>
        )}
        {playlists.map((pl) => {
          const active = pl.id === currentPlaylistId;
          const total = durationOf(pl);
          return (
            <div
              key={pl.id}
              data-testid={`playlist-item-${pl.id}`}
              onClick={() => onSelect(pl.id)}
              onDragOver={(e) => onPlDragOver(e, pl.id)}
              onDragLeave={() => setDropTargetId((cur) => (cur === pl.id ? null : cur))}
              onDrop={(e) => onPlDrop(e, pl.id)}
              className={`group rounded-lg px-3 py-2.5 cursor-pointer border transition ${
                dropTargetId === pl.id && pl.id !== currentPlaylistId
                  ? "border-[var(--hl-fire)] bg-[rgba(255,90,31,0.18)] ring-2 ring-[var(--hl-fire)]"
                  : active
                  ? "bg-[rgba(255,90,31,0.12)] border-[var(--hl-fire)] hl-glow"
                  : "bg-transparent border-transparent hover:bg-white/5"
              }`}
            >
              {editingId === pl.id ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(pl.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 bg-black/50 border border-[var(--hl-line)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--hl-fire)]"
                    data-testid="rename-playlist-input"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      submitRename(pl.id);
                    }}
                    className="text-[var(--hl-fire)]"
                    data-testid="confirm-rename-playlist"
                  >
                    <Check size={16} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(null);
                    }}
                    className="text-[var(--hl-muted)]"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <ListMusic
                        size={15}
                        className={active ? "text-[var(--hl-fire)]" : "text-[var(--hl-muted)]"}
                      />
                      <span className="font-500 truncate">{pl.name}</span>
                    </div>
                    <div className="text-[11px] text-[var(--hl-muted)] mt-0.5 pl-6">
                      {pl.trackIds.length} track{pl.trackIds.length === 1 ? "" : "s"} ·{" "}
                      {formatTotal(total)}
                    </div>
                    {pl.schedule?.enabled && (
                      <div
                        className="text-[10px] mt-1 pl-6 flex items-center gap-1 text-[var(--hl-amber)]"
                        data-testid={`schedule-badge-${pl.id}`}
                      >
                        <Clock size={11} /> {pl.schedule.start}–{pl.schedule.end}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      data-testid={`save-playlist-${pl.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSavePlaylist(pl.id);
                      }}
                      className="h-7 w-7 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-cue)] hover:bg-white/10 disabled:opacity-30"
                      title="Save playlist to a file (song order + audio) — reload it anytime"
                      disabled={pl.trackIds.length === 0}
                    >
                      <Save size={14} />
                    </button>
                    <button
                      data-testid={`export-playlist-${pl.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onExport(pl.id);
                      }}
                      className="h-7 w-7 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:bg-white/10 disabled:opacity-30"
                      title="Save playlist as MP3 / WAV"
                      disabled={pl.trackIds.length === 0}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      data-testid={`schedule-playlist-${pl.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSchedule(pl.id);
                      }}
                      className={`h-7 w-7 grid place-items-center rounded hover:bg-white/10 ${
                        pl.schedule?.enabled ? "text-[var(--hl-amber)]" : "text-[var(--hl-muted)] hover:text-white"
                      }`}
                      title="Show schedule"
                    >
                      <Clock size={14} />
                    </button>
                    <button
                      data-testid={`rename-playlist-${pl.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(pl.id);
                        setEditName(pl.name);
                      }}
                      className="h-7 w-7 grid place-items-center rounded text-[var(--hl-muted)] hover:text-white hover:bg-white/10"
                      title="Rename"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      data-testid={`delete-playlist-${pl.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete playlist "${pl.name}"?`)) onDelete(pl.id);
                      }}
                      className="h-7 w-7 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:bg-white/10"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-3 py-3 border-t border-[var(--hl-line)]">
        <button
          data-testid="shuffle-all-toggle"
          onClick={onToggleShuffleAll}
          className={`w-full flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-700 border transition ${
            shuffleAll
              ? "border-[var(--hl-fire)] text-[var(--hl-fire)] bg-[rgba(255,90,31,0.12)] hl-glow"
              : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:border-[var(--hl-fire)]"
          }`}
          title="Shuffle every track across all playlists as one big show"
        >
          <Shuffle size={15} />
          {shuffleAll ? "Shuffling All Playlists" : "Shuffle All Playlists"}
        </button>
        <div className="mt-2">
          <InstallButton variant="sidebar" />
        </div>
        <div className="mt-2 text-center text-[10px] text-[var(--hl-muted)] tracking-wide">
          HOT LIVE 95 · A.I. RADIO · DETROIT
        </div>
      </div>
    </aside>
  );
}
