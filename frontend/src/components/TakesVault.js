import React, { useRef, useState, useMemo } from "react";
import { Archive, X, Play, Pause, Plus, Download, Trash2, Mic, Scissors, Pencil, Check, Search, Folder, FolderPlus, CheckSquare, Square } from "lucide-react";
import { formatTime } from "../lib/format";

const PRESET_FOLDERS = ["Intros", "Promos", "Station IDs", "Bumpers"];

// A persistent drawer of every voice-booth take (auto-saved on record). DJs can
// search, group into folders (incl. custom), multi-select for bulk move/delete,
// re-insert, trim/rename, download, or delete. Takes travel inside show files.
export default function TakesVault({
  vault = [],
  customFolders = [],
  currentPlaylistName,
  getUrl,
  onInsert,
  onEdit,
  onRename,
  onMoveFolder,
  onBulkMove,
  onBulkDelete,
  onAddFolder,
  onDownload,
  onDelete,
  onClose,
}) {
  const [playingId, setPlayingId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameVal, setRenameVal] = useState("");
  const [query, setQuery] = useState("");
  const [folderFilter, setFolderFilter] = useState("All");
  const [selected, setSelected] = useState(() => new Set());
  const [newFolder, setNewFolder] = useState("");
  const [addingFolder, setAddingFolder] = useState(false);
  const audioRef = useRef(null);

  const allFolders = useMemo(() => {
    const seen = new Set();
    const out = [];
    [...PRESET_FOLDERS, ...customFolders, ...vault.map((v) => v.folder || "").filter(Boolean)].forEach((f) => {
      if (f && !seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    });
    return out;
  }, [customFolders, vault]);
  const hasUnfiled = useMemo(() => vault.some((v) => !v.folder), [vault]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vault.filter((v) => {
      if (folderFilter === "All") {
        /* keep */
      } else if (folderFilter === "Unfiled") {
        if (v.folder) return false;
      } else if ((v.folder || "") !== folderFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (v.name || "").toLowerCase().includes(q) ||
        (v.transcript || "").toLowerCase().includes(q)
      );
    });
  }, [vault, query, folderFilter]);

  const toggleSelect = (id) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const clearSelection = () => setSelected(new Set());
  const selectedIds = [...selected];

  const startRename = (v) => {
    setRenamingId(v.id);
    setRenameVal(v.name);
  };
  const commitRename = (id) => {
    onRename(id, renameVal);
    setRenamingId(null);
  };
  const submitNewFolder = () => {
    const n = newFolder.trim();
    if (n) onAddFolder(n);
    setNewFolder("");
    setAddingFolder(false);
    if (n) setFolderFilter(n);
  };

  const togglePlay = async (v) => {
    if (playingId === v.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    const url = await getUrl(v);
    if (!url) return;
    if (!audioRef.current) audioRef.current = new Audio();
    const a = audioRef.current;
    a.src = url;
    a.onended = () => setPlayingId(null);
    try {
      await a.play();
      setPlayingId(v.id);
    } catch {
      /* ignore */
    }
  };

  const fmtDate = (iso) => {
    try {
      return new Date(iso).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="takes-vault-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          audioRef.current?.pause();
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg hl-panel rounded-2xl overflow-hidden max-h-[88vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Archive size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Takes Vault</h2>
            <span className="text-xs text-[var(--hl-muted)]">
              {vault.length} take{vault.length === 1 ? "" : "s"}
            </span>
          </div>
          <button
            data-testid="takes-vault-close"
            onClick={() => {
              audioRef.current?.pause();
              onClose();
            }}
            className="h-8 w-8 grid place-items-center rounded hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {vault.length > 0 && (
          <div className="px-4 pt-3 pb-1 space-y-2 border-b border-[var(--hl-line)]">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--hl-muted)] pointer-events-none" />
              <input
                data-testid="vault-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search takes by name or transcript…"
                className="w-full h-9 pl-9 pr-3 rounded-full bg-black/40 border border-[var(--hl-line)] text-sm outline-none focus:border-[var(--hl-fire)]"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 items-center" data-testid="vault-folder-filters">
              {["All", ...(hasUnfiled ? ["Unfiled"] : []), ...allFolders].map((f) => (
                <button
                  key={f}
                  data-testid={`vault-folder-filter-${f.replace(/\s/g, "-")}`}
                  onClick={() => setFolderFilter(f)}
                  className={`text-[11px] rounded-full px-2.5 py-1 border transition ${
                    folderFilter === f
                      ? "border-[var(--hl-fire)] text-[var(--hl-fire)] bg-[rgba(255,90,31,0.12)]"
                      : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
              {addingFolder ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    data-testid="vault-new-folder-input"
                    value={newFolder}
                    onChange={(e) => setNewFolder(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitNewFolder();
                      if (e.key === "Escape") setAddingFolder(false);
                    }}
                    placeholder="Folder name"
                    className="w-28 bg-black/50 border border-[var(--hl-line)] rounded-full px-2.5 py-1 text-[11px] outline-none focus:border-[var(--hl-fire)]"
                  />
                  <button
                    data-testid="vault-new-folder-save"
                    onClick={submitNewFolder}
                    className="h-5 w-5 grid place-items-center rounded-full text-[var(--hl-cue)] hover:bg-white/10"
                  >
                    <Check size={13} />
                  </button>
                </span>
              ) : (
                <button
                  data-testid="vault-add-folder"
                  onClick={() => setAddingFolder(true)}
                  className="text-[11px] rounded-full px-2.5 py-1 border border-dashed border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:border-[var(--hl-fire)] inline-flex items-center gap-1"
                >
                  <FolderPlus size={12} /> New folder
                </button>
              )}
            </div>
            {selectedIds.length > 0 && (
              <div
                className="flex flex-wrap items-center gap-2 pt-1"
                data-testid="vault-bulk-bar"
              >
                <span className="text-[11px] text-[var(--hl-fire)] font-600" data-testid="vault-bulk-count">
                  {selectedIds.length} selected
                </span>
                <select
                  data-testid="vault-bulk-move"
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value !== "") {
                      onBulkMove(selectedIds, e.target.value === "__unfiled__" ? "" : e.target.value);
                      clearSelection();
                    }
                    e.target.value = "";
                  }}
                  className="bg-black/40 border border-[var(--hl-line)] rounded px-2 py-1 text-[11px] outline-none focus:border-[var(--hl-fire)]"
                >
                  <option value="">Move to…</option>
                  <option value="__unfiled__">Unfiled</option>
                  {allFolders.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <button
                  data-testid="vault-bulk-delete"
                  onClick={() => {
                    if (window.confirm(`Delete ${selectedIds.length} take(s) from the vault?`)) {
                      onBulkDelete(selectedIds);
                      clearSelection();
                    }
                  }}
                  className="text-[11px] rounded px-2.5 py-1 border border-[var(--hl-onair)] text-[var(--hl-onair)] hover:bg-[rgba(255,23,68,0.1)] inline-flex items-center gap-1"
                >
                  <Trash2 size={12} /> Delete
                </button>
                <button
                  data-testid="vault-bulk-clear"
                  onClick={clearSelection}
                  className="text-[11px] text-[var(--hl-muted)] hover:text-white"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
        )}

        <div className="p-4 overflow-y-auto hl-scroll space-y-2">
          {vault.length === 0 && (
            <div
              className="text-center text-[var(--hl-muted)] text-sm px-6 py-12"
              data-testid="takes-vault-empty"
            >
              <Mic size={22} className="mx-auto mb-2 opacity-60" />
              No saved takes yet. Every recording you make in the Voice Booth is auto-saved here and
              survives reloads.
            </div>
          )}
          {vault.length > 0 && filtered.length === 0 && (
            <div className="text-center text-[var(--hl-muted)] text-sm px-6 py-10" data-testid="vault-no-results">
              No takes match your search or folder.
            </div>
          )}
          {filtered.map((v) => (
            <div
              key={v.id}
              data-testid={`vault-take-${v.id}`}
              className={`rounded-xl border bg-black/30 p-3 flex items-start gap-3 ${
                selected.has(v.id) ? "border-[var(--hl-fire)]" : "border-[var(--hl-line)]"
              }`}
            >
              <button
                data-testid={`vault-select-${v.id}`}
                onClick={() => toggleSelect(v.id)}
                className="mt-1 h-5 w-5 shrink-0 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"
                title="Select for bulk actions"
              >
                {selected.has(v.id) ? (
                  <CheckSquare size={17} className="text-[var(--hl-fire)]" />
                ) : (
                  <Square size={17} />
                )}
              </button>
              <button
                data-testid={`vault-play-${v.id}`}
                onClick={() => togglePlay(v)}
                className="h-10 w-10 shrink-0 grid place-items-center rounded-full border border-[var(--hl-fire)] text-[var(--hl-fire)] hover:bg-[rgba(255,90,31,0.1)]"
                title="Preview take"
              >
                {playingId === v.id ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
              </button>
              <div className="min-w-0 flex-1">
                {renamingId === v.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      data-testid={`vault-rename-input-${v.id}`}
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(v.id);
                        if (e.key === "Escape") setRenamingId(null);
                      }}
                      className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded px-2 py-1 text-sm outline-none focus:border-[var(--hl-fire)]"
                    />
                    <button
                      data-testid={`vault-rename-save-${v.id}`}
                      onClick={() => commitRename(v.id)}
                      className="h-6 w-6 grid place-items-center rounded text-[var(--hl-cue)] hover:bg-white/10"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <span className="font-500 truncate">{v.name}</span>
                    <button
                      data-testid={`vault-rename-${v.id}`}
                      onClick={() => startRename(v)}
                      className="h-5 w-5 shrink-0 grid place-items-center rounded text-[var(--hl-muted)] hover:text-white"
                      title="Rename take"
                    >
                      <Pencil size={12} />
                    </button>
                  </div>
                )}
                <div className="text-[11px] text-[var(--hl-muted)] mt-0.5 flex items-center gap-2">
                  <span className="tabular-nums">{formatTime(v.duration || 0)}</span>
                  <span>·</span>
                  <span>{fmtDate(v.date)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Folder size={12} className="text-[var(--hl-muted)] shrink-0" />
                  <select
                    data-testid={`vault-folder-${v.id}`}
                    value={v.folder || ""}
                    onChange={(e) => onMoveFolder(v.id, e.target.value)}
                    className="bg-black/40 border border-[var(--hl-line)] rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-[var(--hl-fire)]"
                  >
                    <option value="">Unfiled</option>
                    {allFolders.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                {v.transcript && (
                  <div
                    className="text-[11px] text-[var(--hl-text)] mt-1 line-clamp-2 italic opacity-80"
                    data-testid={`vault-transcript-${v.id}`}
                  >
                    "{v.transcript}"
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  data-testid={`vault-insert-${v.id}`}
                  onClick={() => onInsert(v.id)}
                  className="h-8 px-2.5 grid place-items-center rounded-lg border border-[var(--hl-line)] text-[var(--hl-cue)] hover:border-[var(--hl-cue)] text-xs font-600 flex-row gap-1"
                  title={`Insert into ${currentPlaylistName || "current playlist"}`}
                >
                  <Plus size={13} /> Insert
                </button>
                <button
                  data-testid={`vault-edit-${v.id}`}
                  onClick={() => onEdit(v.id)}
                  className="h-8 w-8 grid place-items-center rounded-lg text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:bg-white/10"
                  title="Trim / edit before inserting"
                >
                  <Scissors size={14} />
                </button>
                <button
                  data-testid={`vault-download-${v.id}`}
                  onClick={() => onDownload(v.id)}
                  className="h-8 w-8 grid place-items-center rounded-lg text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:bg-white/10"
                  title="Download take"
                >
                  <Download size={14} />
                </button>
                <button
                  data-testid={`vault-delete-${v.id}`}
                  onClick={() => {
                    if (window.confirm(`Delete take "${v.name}" from the vault?`)) onDelete(v.id);
                  }}
                  className="h-8 w-8 grid place-items-center rounded-lg text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:bg-white/10"
                  title="Delete take"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
