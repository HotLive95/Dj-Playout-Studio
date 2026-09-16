import React from "react";
import { Play, Pause, SkipBack, SkipForward, Waves, Headphones } from "lucide-react";

// Slim, always-visible transport bar for phones only (hidden on md+). Pinned to
// the bottom of the viewport so DJs can play/pause/skip/cue one-handed without
// scrolling down to the full PlayerBar.
export const MobileMiniPlayer = ({
  track,
  isPlaying,
  currentTime,
  duration,
  cueing,
  onCue,
  onTogglePlay,
  onNext,
  onPrev,
}) => {
  const pct = duration ? Math.min(100, (currentTime / duration) * 100) : 0;
  return (
    <div
      data-testid="mobile-mini-player"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--hl-line)] bg-[var(--hl-panel)]/95 backdrop-blur-md"
    >
      <div className="h-0.5 w-full bg-[#2a2a31]">
        <div
          className="h-full hl-fire-gradient transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="h-9 w-9 shrink-0 rounded-md hl-fire-gradient grid place-items-center">
          <Waves size={16} className="text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-600" data-testid="mini-track-name">
            {track ? track.name : "Nothing loaded"}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-[var(--hl-muted)]">
            {track ? (isPlaying ? "On air" : "Paused") : "Load a track to begin"}
          </div>
        </div>
        <button
          data-testid="mini-cue-button"
          onClick={onCue}
          disabled={!track}
          className={`h-9 w-9 grid place-items-center rounded-full transition disabled:opacity-30 ${
            cueing
              ? "text-[var(--hl-amber)] bg-[rgba(255,171,0,0.15)]"
              : "text-[var(--hl-muted)] active:bg-white/10"
          }`}
          title="Pre-listen this track on headphones"
        >
          <Headphones size={17} />
        </button>
        <button
          data-testid="mini-prev-button"
          onClick={onPrev}
          className="h-9 w-9 grid place-items-center rounded-full text-[var(--hl-text)] active:bg-white/10"
          title="Previous"
        >
          <SkipBack size={18} />
        </button>
        <button
          data-testid="mini-play-pause-button"
          onClick={onTogglePlay}
          className="h-11 w-11 grid place-items-center rounded-full hl-fire-gradient text-white hl-glow"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
        </button>
        <button
          data-testid="mini-next-button"
          onClick={onNext}
          className="h-9 w-9 grid place-items-center rounded-full text-[var(--hl-text)] active:bg-white/10"
          title="Next"
        >
          <SkipForward size={18} />
        </button>
      </div>
    </div>
  );
};
