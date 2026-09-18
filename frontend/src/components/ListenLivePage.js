import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Radio, ExternalLink, AlertCircle } from "lucide-react";
import { api } from "../lib/api";

const STREAM_URL = process.env.REACT_APP_STATION_STREAM_URL || "";
const WEBSITE_URL = process.env.REACT_APP_STATION_WEBSITE || "";

// Public "Listen Live" landing page (route: /live). Point the domain here.
export default function ListenLivePage() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [error, setError] = useState("");
  const [nowPlaying, setNowPlaying] = useState(null);

  // Poll the station "now playing" feed (published by the studio when it's online).
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const np = await api.getNowPlaying();
        if (alive) setNowPlaying(np && np.title ? np : null);
      } catch {
        /* offline / not set — leave as generic live radio */
      }
    };
    load();
    const id = setInterval(load, 10000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  // Recover gracefully when a live stream drops, stalls, or ends mid-play.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onError = () => {
      setPlaying(false);
      setLoading(false);
      setError("The stream dropped. Tap play to reconnect.");
    };
    const onStalled = () => setLoading(true);
    const onPlaying = () => {
      setLoading(false);
      setError("");
    };
    const onEnded = () => setPlaying(false);
    a.addEventListener("error", onError);
    a.addEventListener("stalled", onStalled);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("ended", onEnded);
    return () => {
      a.removeEventListener("error", onError);
      a.removeEventListener("stalled", onStalled);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("ended", onEnded);
    };
  }, []);

  const toggle = async () => {
    const a = audioRef.current;
    if (!a || !STREAM_URL) return;
    if (playing) {
      a.pause();
      setPlaying(false);
      return;
    }
    setLoading(true);
    setError("");
    // reload the live stream from the live edge each time
    a.src = STREAM_URL;
    a.load();
    try {
      await a.play();
      setPlaying(true);
    } catch {
      setError("Couldn't start the stream. Try again or open the station website.");
    }
    setLoading(false);
  };

  const toggleMute = () => {
    const a = audioRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(a.muted);
  };

  return (
    <div className="min-h-screen bg-[var(--hl-bg)] text-[var(--hl-text)] relative overflow-hidden" data-testid="listen-live-page">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: "radial-gradient(900px 500px at 50% -10%, rgba(255,90,31,0.20), transparent 60%)" }} />

      <div className="relative z-10 min-h-screen grid place-items-center p-5">
        <div className="w-full max-w-md hl-panel rounded-3xl p-7 text-center">
          <div className="flex flex-col items-center gap-4">
            <img
              src={`${process.env.PUBLIC_URL || ""}/hl-emblem.png`}
              alt="Hot Live 95"
              className="h-24 w-auto drop-shadow-[0_0_24px_rgba(255,90,31,0.35)]"
              data-testid="live-logo"
            />
            <div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-wide leading-none">HOT LIVE 95</h1>
              <p className="text-[11px] uppercase tracking-[0.35em] text-[var(--hl-muted)] mt-1">Detroit · A.I. Radio</p>
            </div>

            {/* Live badge */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--hl-line)] bg-black/40">
              <span className={`h-2.5 w-2.5 rounded-full ${playing ? "bg-[var(--hl-onair)] animate-pulse" : "bg-[var(--hl-muted)]"}`} />
              <span className="text-xs font-600 uppercase tracking-wider" data-testid="live-status">
                {playing ? "On Air — Live" : "Live Radio"}
              </span>
            </div>

            {/* Play control */}
            <button
              data-testid="live-play-button"
              onClick={toggle}
              disabled={!STREAM_URL || loading}
              className="mt-2 h-20 w-20 grid place-items-center rounded-full hl-fire-gradient text-white shadow-[0_10px_40px_rgba(255,23,68,0.4)] hover:scale-105 active:scale-95 transition disabled:opacity-40 disabled:hover:scale-100"
              aria-label={playing ? "Pause" : "Play"}
            >
              {loading ? (
                <Radio size={30} className="animate-pulse" />
              ) : playing ? (
                <Pause size={34} />
              ) : (
                <Play size={34} className="ml-1" />
              )}
            </button>
            <div className="text-sm text-[var(--hl-muted)]">{playing ? "Tap to pause" : "Tap to listen live"}</div>

            {nowPlaying && (
              <div
                className="mt-3 w-full flex items-center gap-3 rounded-2xl border border-[var(--hl-line)] bg-black/40 px-3 py-2.5 text-left"
                data-testid="live-now-playing"
              >
                <img
                  src={nowPlaying.art || `${process.env.PUBLIC_URL || ""}/hl-emblem.png`}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md object-cover bg-black/40 border border-[var(--hl-line)]"
                  onError={(e) => {
                    e.currentTarget.src = `${process.env.PUBLIC_URL || ""}/hl-emblem.png`;
                  }}
                />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--hl-fire)]">
                    Now Playing
                  </div>
                  <div className="truncate font-600 text-sm" data-testid="live-np-title">
                    {nowPlaying.title}
                  </div>
                  {nowPlaying.artist && (
                    <div className="truncate text-xs text-[var(--hl-muted)]" data-testid="live-np-artist">
                      {nowPlaying.artist}
                    </div>
                  )}
                  {nowPlaying.next_title && (
                    <div
                      className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--hl-cue)]"
                      data-testid="live-coming-up"
                    >
                      <Radio size={11} className="shrink-0" />
                      <span className="uppercase tracking-[0.2em] text-[10px] opacity-80">Up next</span>
                      <span className="truncate text-[var(--hl-text)]" data-testid="live-next-title">
                        {nowPlaying.next_title}
                        {nowPlaying.next_artist ? ` — ${nowPlaying.next_artist}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Volume */}
            {STREAM_URL && (
              <div className="flex items-center gap-3 w-full max-w-[240px] mt-1">
                <button data-testid="live-mute" onClick={toggleMute} className="text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <input
                  data-testid="live-volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="hl-jingle-vol flex-1"
                />
              </div>
            )}

            {error && (
              <div className="text-[var(--hl-onair)] text-sm flex items-center gap-2" data-testid="live-error">
                <AlertCircle size={15} /> {error}
              </div>
            )}

            {!STREAM_URL && (
              <div className="mt-2 text-sm text-[var(--hl-amber)] bg-black/40 border border-[var(--hl-line)] rounded-xl px-4 py-3" data-testid="live-not-configured">
                Stream link not set yet. Add your station's audio stream URL and this player goes live.
              </div>
            )}

            {WEBSITE_URL && (
              <a
                data-testid="live-website-link"
                href={WEBSITE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"
              >
                Visit our website <ExternalLink size={12} />
              </a>
            )}
          </div>

          <audio ref={audioRef} preload="none" />
        </div>

        <div className="absolute bottom-4 text-[11px] text-[var(--hl-muted)]">© Hot Live 95 Detroit · A.I. Radio</div>
      </div>
    </div>
  );
}
