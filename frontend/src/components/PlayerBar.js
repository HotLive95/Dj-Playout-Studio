import React from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Shuffle,
  Waves,
  Mic,
  Radio,
  Scissors,
} from "lucide-react";
import { formatTime } from "../lib/format";
import Waveform from "./Waveform";

export default function PlayerBar({
  track,
  peaks,
  isPlaying,
  currentTime,
  duration,
  volume,
  autoplay,
  crossfade,
  crossfadeSeconds,
  trimSilence,
  talkActive,
  autoDuck,
  micActive,
  onTogglePlay,
  onNext,
  onPrev,
  onSeek,
  onVolume,
  onToggleAutoplay,
  onToggleCrossfade,
  onCrossfadeSeconds,
  onToggleTrimSilence,
  onToggleTalk,
  onToggleAutoDuck,
}) {
  const pct = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div
      className="border-t border-[var(--hl-line)] bg-[var(--hl-panel)] px-6 py-3"
      data-testid="player-bar"
    >
      {/* Seek bar */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-[var(--hl-muted)] tabular-nums w-11 text-right" data-testid="current-time">
          {formatTime(currentTime)}
        </span>
        <div
          className="relative flex-1 h-2 rounded-full bg-[#2a2a31] cursor-pointer group"
          data-testid="seek-bar"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - rect.left) / rect.width;
            onSeek(Math.max(0, Math.min(1, ratio)) * (duration || 0));
          }}
        >
          {peaks ? (
            <div className="absolute inset-0 -top-3">
              <Waveform
                peaks={peaks}
                progress={duration ? currentTime / duration : 0}
                compact
                height={32}
                onSeek={(frac) => onSeek(frac * (duration || 0))}
              />
            </div>
          ) : (
            <>
              <div
                className="absolute left-0 top-0 h-full rounded-full hl-fire-gradient"
                style={{ width: `${pct}%` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full bg-white shadow opacity-0 group-hover:opacity-100 transition"
                style={{ left: `calc(${pct}% - 7px)` }}
              />
            </>
          )}
        </div>
        <span className="text-xs text-[var(--hl-muted)] tabular-nums w-11" data-testid="duration">
          {formatTime(duration)}
        </span>
      </div>

      <div className="flex items-center justify-between mt-2.5 gap-4">
        {/* Now playing */}
        <div className="flex items-center gap-3 min-w-0 w-1/3">
          <div className="h-11 w-11 shrink-0 rounded-md hl-fire-gradient grid place-items-center">
            <Waves size={20} className="text-white" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-600 text-sm" data-testid="player-track-name">
              {track ? track.name : "Nothing loaded"}
            </div>
            <div className="text-[11px] text-[var(--hl-muted)] uppercase tracking-wide">
              {track ? "Live Playout" : "Load a track to begin"}
            </div>
          </div>
        </div>

        {/* Transport controls */}
        <div className="flex items-center gap-4">
          <button
            data-testid="prev-button"
            onClick={onPrev}
            className="h-10 w-10 grid place-items-center rounded-full text-[var(--hl-text)] hover:bg-white/10 transition"
            title="Previous"
          >
            <SkipBack size={22} />
          </button>
          <button
            data-testid="play-pause-button"
            onClick={onTogglePlay}
            className="h-14 w-14 grid place-items-center rounded-full hl-fire-gradient text-white hover:brightness-110 transition hl-glow"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={26} /> : <Play size={26} className="ml-0.5" />}
          </button>
          <button
            data-testid="next-button"
            onClick={onNext}
            className="h-10 w-10 grid place-items-center rounded-full text-[var(--hl-text)] hover:bg-white/10 transition"
            title="Next"
          >
            <SkipForward size={22} />
          </button>
          <div className="w-px h-8 bg-[var(--hl-line)] mx-1" />
          <button
            data-testid="talk-button"
            onClick={onToggleTalk}
            className={`flex items-center gap-1.5 px-3 h-10 rounded-full font-700 text-sm border-2 transition ${
              talkActive
                ? "bg-[var(--hl-onair)] border-[var(--hl-onair)] text-white hl-onair-dot"
                : "border-[var(--hl-onair)] text-[var(--hl-onair)] hover:bg-[rgba(255,23,68,0.12)]"
            }`}
            title="Talk over — dips the music while you speak (T)"
          >
            <Mic size={17} /> TALK
          </button>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2.5 w-1/3 justify-end">
          <button
            data-testid="auto-duck-toggle"
            onClick={onToggleAutoDuck}
            className={`h-9 w-9 grid place-items-center rounded-md border transition ${
              autoDuck
                ? micActive
                  ? "border-[var(--hl-onair)] text-[var(--hl-onair)] bg-[rgba(255,23,68,0.15)]"
                  : "border-[var(--hl-fire)] text-[var(--hl-fire)] bg-[rgba(255,90,31,0.1)]"
                : "border-[var(--hl-line)] text-[var(--hl-muted)]"
            }`}
            title="Auto-duck: listens to your mic and dips music automatically"
          >
            <Radio size={16} />
          </button>
          <button
            data-testid="trim-silence-toggle"
            onClick={onToggleTrimSilence}
            className={`h-9 w-9 grid place-items-center rounded-md border transition ${
              trimSilence
                ? "border-[var(--hl-amber)] text-[var(--hl-amber)] bg-[rgba(255,171,0,0.1)]"
                : "border-[var(--hl-line)] text-[var(--hl-muted)]"
            }`}
            title="Trim silence: skip dead air at the start/end for tight playout"
          >
            <Scissors size={16} />
          </button>
          <button
            data-testid="autoplay-toggle"
            onClick={onToggleAutoplay}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-600 border transition ${
              autoplay
                ? "border-[var(--hl-fire)] text-[var(--hl-fire)] bg-[rgba(255,90,31,0.1)]"
                : "border-[var(--hl-line)] text-[var(--hl-muted)]"
            }`}
            title="Auto-play next track"
          >
            <Repeat size={15} /> Auto
          </button>

          <div className="flex items-center gap-1.5">
            <button
              data-testid="crossfade-toggle"
              onClick={onToggleCrossfade}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-600 border transition ${
                crossfade
                  ? "border-[var(--hl-amber)] text-[var(--hl-amber)] bg-[rgba(255,171,0,0.1)]"
                  : "border-[var(--hl-line)] text-[var(--hl-muted)]"
              }`}
              title="Crossfade between tracks"
            >
              <Shuffle size={15} /> Xfade
            </button>
            {crossfade && (
              <select
                data-testid="crossfade-seconds"
                value={crossfadeSeconds}
                onChange={(e) => onCrossfadeSeconds(Number(e.target.value))}
                className="bg-black/50 border border-[var(--hl-line)] rounded-md text-xs px-1.5 py-1.5 outline-none focus:border-[var(--hl-amber)]"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map((s) => (
                  <option key={s} value={s}>
                    {s}s
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 w-28">
            <button
              onClick={() => onVolume(volume > 0 ? 0 : 1)}
              data-testid="mute-button"
              className="text-[var(--hl-muted)] hover:text-white"
            >
              {volume > 0 ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
            <input
              data-testid="volume-slider"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => onVolume(Number(e.target.value))}
              className="hl-range flex-1"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
