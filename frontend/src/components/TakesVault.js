import React, { useRef, useState } from "react";
import { Archive, X, Play, Pause, Plus, Download, Trash2, Mic } from "lucide-react";
import { formatTime } from "../lib/format";

// A persistent drawer of every voice-booth take (auto-saved on record). DJs can
// re-insert a take into the current playlist, download it, or delete it. Vault
// takes also travel inside shared / saved show files.
export default function TakesVault({
  vault = [],
  currentPlaylistName,
  getUrl,
  onInsert,
  onDownload,
  onDelete,
  onClose,
}) {
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

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
          {vault.map((v) => (
            <div
              key={v.id}
              data-testid={`vault-take-${v.id}`}
              className="rounded-xl border border-[var(--hl-line)] bg-black/30 p-3 flex items-start gap-3"
            >
              <button
                data-testid={`vault-play-${v.id}`}
                onClick={() => togglePlay(v)}
                className="h-10 w-10 shrink-0 grid place-items-center rounded-full border border-[var(--hl-fire)] text-[var(--hl-fire)] hover:bg-[rgba(255,90,31,0.1)]"
                title="Preview take"
              >
                {playingId === v.id ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="font-500 truncate">{v.name}</div>
                <div className="text-[11px] text-[var(--hl-muted)] mt-0.5 flex items-center gap-2">
                  <span className="tabular-nums">{formatTime(v.duration || 0)}</span>
                  <span>·</span>
                  <span>{fmtDate(v.date)}</span>
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
