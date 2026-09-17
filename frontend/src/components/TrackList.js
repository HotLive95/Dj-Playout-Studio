import React, { useRef, useState } from "react";
import {
  Plus,
  Play,
  Pause,
  GripVertical,
  Trash2,
  RefreshCw,
  Music2,
  Clock,
  Headphones,
  Upload,
  Scissors,
  Share2,
  Mic,
} from "lucide-react";
import { formatTime, formatTotal } from "../lib/format";

export default function TrackList({
  playlist,
  playlists,
  tracks,
  search,
  onSelectPlaylist,
  currentTrackId,
  cueTrackId,
  isPlaying,
  onAddFiles,
  onImportDialog,
  onDropFiles,
  isElectron,
  onReorder,
  onRemove,
  onReplaceFiles,
  onReplaceDialog,
  onPlayTrack,
  onTogglePlay,
  onCueTrack,
  onEditTrack,
  onExportPlaylist,
  onRecordVoice,
}) {
  const addInputRef = useRef(null);
  const replaceInputRef = useRef(null);
  const replaceIndexRef = useRef(null);
  const dragDepth = useRef(0);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [fileDragging, setFileDragging] = useState(false);

  const allItems = playlist
    ? playlist.trackIds.map((id, i) => ({ track: tracks[id], index: i })).filter((x) => x.track)
    : [];
  const totalDuration = allItems.reduce((sum, x) => sum + (x.track.duration || 0), 0);
  const q = (search || "").trim().toLowerCase();
  const items = q ? allItems.filter((x) => x.track.name.toLowerCase().includes(q)) : allItems;
  const otherMatches = q
    ? (playlists || [])
        .filter((pl) => pl.id !== playlist?.id)
        .flatMap((pl) =>
          pl.trackIds
            .map((id) => tracks[id])
            .filter((t) => t && t.name.toLowerCase().includes(q))
            .map((t) => ({ pl, track: t }))
        )
    : [];

  const handleAddClick = () => {
    if (isElectron) onImportDialog();
    else addInputRef.current?.click();
  };

  const handleReplaceClick = (index) => {
    if (isElectron) {
      onReplaceDialog(index);
    } else {
      replaceIndexRef.current = index;
      replaceInputRef.current?.click();
    }
  };

  const onRowDragStart = (index) => setDragIndex(index);
  const onRowDragOver = (e, index) => {
    if (dragIndex === null) return; // let file-drag pass through
    e.preventDefault();
    setOverIndex(index);
  };
  const onRowDrop = (index) => {
    if (dragIndex !== null && dragIndex !== index) onReorder(dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
  };

  // ---- Drag files from the OS ----
  const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
  const onZoneDragEnter = (e) => {
    if (!isFileDrag(e) || !playlist) return;
    e.preventDefault();
    dragDepth.current += 1;
    setFileDragging(true);
  };
  const onZoneDragOver = (e) => {
    if (!isFileDrag(e) || !playlist) return;
    e.preventDefault();
  };
  const onZoneDragLeave = (e) => {
    if (!isFileDrag(e)) return;
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) {
      dragDepth.current = 0;
      setFileDragging(false);
    }
  };
  const onZoneDrop = (e) => {
    if (!isFileDrag(e) || !playlist) return;
    e.preventDefault();
    dragDepth.current = 0;
    setFileDragging(false);
    if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files);
  };

  if (!playlist) {
    return (
      <div className="flex-1 grid place-items-center text-center px-8">
        <div>
          <Music2 size={48} className="mx-auto text-[var(--hl-line)]" />
          <h2 className="font-display text-2xl mt-4">No Playlist Selected</h2>
          <p className="text-[var(--hl-muted)] mt-2 max-w-sm mx-auto">
            Create or select a playlist on the left to start loading your MP3 and WAV files for
            live playout.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col min-w-0 min-h-0 relative"
      data-testid="track-list-panel"
      onDragEnter={onZoneDragEnter}
      onDragOver={onZoneDragOver}
      onDragLeave={onZoneDragLeave}
      onDrop={onZoneDrop}
    >
      {/* Hot Live 95 branded backdrop (tracks scroll over it) */}
      <div className="absolute inset-0 z-0 pointer-events-none hl-playlist-bg" aria-hidden data-testid="playlist-carbon-bg">
        <img
          src={`${process.env.PUBLIC_URL || ""}/hl-emblem.png`}
          alt=""
          aria-hidden
          data-testid="playlist-logo-watermark"
          className="hl-watermark absolute select-none"
        />
      </div>

      {fileDragging && (
        <div
          className="absolute inset-3 z-20 rounded-2xl border-2 border-dashed border-[var(--hl-fire)] bg-[rgba(255,90,31,0.12)] backdrop-blur-sm grid place-items-center pointer-events-none"
          data-testid="drop-overlay"
        >
          <div className="text-center">
            <Upload size={44} className="mx-auto text-[var(--hl-fire)]" />
            <p className="mt-3 font-display text-xl">Drop MP3 / WAV files to add</p>
          </div>
        </div>
      )}

      {/* Hidden inputs for browser file selection */}
      <input
        ref={addInputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/*"
        multiple
        className="hidden"
        data-testid="add-files-input"
        onChange={(e) => {
          if (e.target.files?.length) onAddFiles(Array.from(e.target.files));
          e.target.value = "";
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav,audio/*"
        className="hidden"
        data-testid="replace-file-input"
        onChange={(e) => {
          if (e.target.files?.[0] && replaceIndexRef.current !== null) {
            onReplaceFiles(replaceIndexRef.current, e.target.files[0]);
          }
          replaceIndexRef.current = null;
          e.target.value = "";
        }}
      />

      {/* Playlist header */}
      <div className="relative z-10 px-6 pt-5 pb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.25em] text-[var(--hl-muted)]">
            Now editing
          </div>
          <h1
            className="font-display text-3xl font-700 truncate hl-text-fire"
            data-testid="current-playlist-name"
          >
            {playlist.name}
          </h1>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-[var(--hl-muted)]">
            <span data-testid="track-count">
              {q
                ? `${items.length} of ${allItems.length} match`
                : `${allItems.length} track${allItems.length === 1 ? "" : "s"}`}
            </span>
            <span className="flex items-center gap-1.5" data-testid="total-duration">
              <Clock size={14} /> {formatTotal(totalDuration)} total runtime
            </span>
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-2">
        <button
          data-testid="add-files-button"
          onClick={handleAddClick}
          className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg hl-fire-gradient text-white font-600 hover:brightness-110 transition hl-glow"
        >
          <Plus size={18} /> Add MP3 / WAV
        </button>
        <button
          data-testid="record-voice-button"
          onClick={onRecordVoice}
          className="shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-fire)]"
          title="Record a voice intro and drop it into the playlist"
        >
          <Mic size={16} /> Voice
        </button>
        <button
          data-testid="export-playlist-button"
          onClick={onExportPlaylist}
          disabled={items.length === 0}
          className="shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-amber)] disabled:opacity-40"
          title="Export this playlist to a shareable file"
        >
          <Share2 size={16} /> Share
        </button>
        </div>
      </div>

      {/* Track rows — fill available height and scroll; no track-count cap */}
      <div
        className="relative z-10 flex-1 min-h-0 overflow-y-auto hl-scroll px-4 pb-6"
        data-testid="track-scroll"
      >
        {allItems.length === 0 ? (
          <div
            className="mx-2 mt-4 border-2 border-dashed border-[var(--hl-line)] rounded-xl py-16 text-center"
            data-testid="empty-playlist"
          >
            <Music2 size={40} className="mx-auto text-[var(--hl-line)]" />
            <p className="mt-3 text-[var(--hl-muted)]">
              This playlist is empty. Click{" "}
              <span className="text-[var(--hl-fire)] font-600">Add MP3 / WAV</span> or drag files
              here to load tracks.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div
            className="mx-2 mt-4 border-2 border-dashed border-[var(--hl-line)] rounded-xl py-16 text-center"
            data-testid="no-search-results"
          >
            <Music2 size={40} className="mx-auto text-[var(--hl-line)]" />
            <p className="mt-3 text-[var(--hl-muted)]">
              No tracks match{" "}
              <span className="text-[var(--hl-fire)] font-600">"{search}"</span> in this playlist.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map(({ track, index }) => {
              const active = track.id === currentTrackId;
              const rowPlaying = active && isPlaying;
              const cued = track.id === cueTrackId;
              return (
                <div
                  key={track.id}
                  data-testid={`track-row-${index}`}
                  draggable={!q}
                  onDragStart={() => onRowDragStart(index)}
                  onDragOver={(e) => onRowDragOver(e, index)}
                  onDrop={() => onRowDrop(index)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  className={`group flex items-center gap-3 rounded-lg pl-2 pr-3 py-2.5 border transition ${
                    active
                      ? "bg-[rgba(255,90,31,0.1)] border-[var(--hl-fire)]"
                      : cued
                      ? "bg-[rgba(255,171,0,0.08)] border-[var(--hl-amber)]"
                      : "bg-[var(--hl-panel-2)] border-[var(--hl-line)] hover:border-[#3a3a44]"
                  } ${dragIndex === index ? "hl-dragging" : ""} ${
                    overIndex === index && dragIndex !== null && dragIndex !== index
                      ? "hl-drag-over"
                      : ""
                  }`}
                >
                  <span
                    className="cursor-grab active:cursor-grabbing text-[var(--hl-muted)] hover:text-white"
                    title="Drag to reorder"
                    data-testid={`drag-handle-${index}`}
                  >
                    <GripVertical size={18} />
                  </span>

                  <button
                    data-testid={`play-track-${index}`}
                    onClick={() => (active ? onTogglePlay() : onPlayTrack(index))}
                    className={`h-10 w-10 shrink-0 grid place-items-center rounded-md ${
                      active
                        ? "hl-fire-gradient text-white"
                        : "bg-black/40 text-[var(--hl-muted)] group-hover:text-white"
                    }`}
                    title={rowPlaying ? "Pause" : "Play on air"}
                  >
                    {rowPlaying ? <Pause size={18} /> : <Play size={18} />}
                  </button>

                  <div className="w-7 text-right text-sm text-[var(--hl-muted)] tabular-nums">
                    {index + 1}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className={`truncate font-500 ${
                        active ? "text-[var(--hl-fire)]" : cued ? "text-[var(--hl-amber)]" : ""
                      }`}
                      data-testid={`track-name-${index}`}
                    >
                      {track.name}
                    </div>
                    <div className="text-[11px] text-[var(--hl-muted)] uppercase tracking-wide">
                      {track.type?.includes("wav") || /\.wav$/i.test(track.name) ? "WAV" : "MP3"}
                    </div>
                  </div>

                  <div className="text-sm text-[var(--hl-muted)] tabular-nums w-14 text-right">
                    {track.duration ? formatTime(track.duration) : "--:--"}
                  </div>

                  <div className="flex items-center gap-1 w-[144px] justify-end">
                    <button
                      data-testid={`cue-track-${index}`}
                      onClick={() => onCueTrack(index)}
                      className={`h-8 w-8 grid place-items-center rounded transition ${
                        cued
                          ? "text-[var(--hl-amber)] bg-[rgba(255,171,0,0.15)]"
                          : "text-[var(--hl-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--hl-amber)] hover:bg-white/10"
                      }`}
                      title="Cue / pre-listen on headphones"
                    >
                      <Headphones size={16} />
                    </button>
                    <button
                      data-testid={`edit-track-${index}`}
                      onClick={() => onEditTrack(index)}
                      className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--hl-fire)] hover:bg-white/10"
                      title="Edit / trim this track"
                    >
                      <Scissors size={16} />
                    </button>
                    <button
                      data-testid={`replace-track-${index}`}
                      onClick={() => handleReplaceClick(index)}
                      className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--hl-amber)] hover:bg-white/10"
                      title="Replace file"
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button
                      data-testid={`remove-track-${index}`}
                      onClick={() => onRemove(index)}
                      className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] opacity-0 group-hover:opacity-100 hover:text-[var(--hl-onair)] hover:bg-white/10"
                      title="Remove from playlist"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {q && otherMatches.length > 0 && (
          <div className="mt-5" data-testid="other-playlist-results">
            <div className="px-2 mb-2 text-[11px] uppercase tracking-wider text-[var(--hl-muted)]">
              In other playlists ({otherMatches.length})
            </div>
            <div className="space-y-1.5">
              {otherMatches.map(({ pl, track }) => (
                <div
                  key={`${pl.id}-${track.id}`}
                  data-testid={`other-match-${pl.id}-${track.id}`}
                  className="flex items-center gap-3 rounded-lg pl-3 pr-3 py-2.5 border bg-[var(--hl-panel-2)] border-[var(--hl-line)]"
                >
                  <Music2 size={16} className="text-[var(--hl-muted)] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate font-500">{track.name}</div>
                    <div className="text-[11px] text-[var(--hl-amber)] uppercase tracking-wide truncate">
                      {pl.name}
                    </div>
                  </div>
                  <button
                    data-testid={`open-playlist-${pl.id}`}
                    onClick={() => onSelectPlaylist(pl.id)}
                    className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-fire)] hover:text-[var(--hl-fire)] transition"
                    title={`Open "${pl.name}"`}
                  >
                    Open
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
