import React, { useEffect, useRef, useState } from "react";
import { Play, Pause, Volume2, VolumeX, Radio, ExternalLink, AlertCircle } from "lucide-react";
import { api } from "../lib/api";

const ENV_STREAM = process.env.REACT_APP_STATION_STREAM_URL || "";
const WEBSITE_URL = process.env.REACT_APP_STATION_WEBSITE || "";
const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const PUBLIC = process.env.PUBLIC_URL || "";
const qs = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
const STATION_ID = qs.get("station") || "";
const ls = (k) => {
  try {
    return (typeof window !== "undefined" && localStorage.getItem(k)) || "";
  } catch {
    return "";
  }
};
const DEFAULTS = {
  name: "HOT LIVE 95",
  tagline: "Detroit · A.I. Radio",
  color: "#ff5a1f",
  logo: `${PUBLIC}/hl-emblem.png`,
  streamUrl: qs.get("stream") || ls("hotlive95_stream_url") || ENV_STREAM,
  statusUrl: qs.get("status") || ls("hotlive95_status_url") || "",
};

// Public "Listen Live" landing page (route: /live[?station=<id>]).
export default function ListenLivePage() {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.9);
  const [error, setError] = useState("");
  const [nowPlaying, setNowPlaying] = useState(null);
  const [stationLive, setStationLive] = useState(null);
  const [listeners, setListeners] = useState(null);
  const [st, setSt] = useState(DEFAULTS);
  const [theme, setTheme] = useState(() => {
    const q = (qs.get("theme") || "").toLowerCase();
    if (q === "compact" || q === "full") return q;
    return ls("hotlive95_live_theme") || "full";
  });
  const setThemePref = (t) => {
    setTheme(t);
    try {
      localStorage.setItem("hotlive95_live_theme", t);
    } catch {
      /* ignore */
    }
  };

  const STREAM_URL = st.streamUrl;
  const STATUS_URL = st.statusUrl;

  // Resolve station branding/config from the backend when ?station=<id> is set.
  useEffect(() => {
    if (!STATION_ID || !BACKEND) return;
    let alive = true;
    api
      .getStation(STATION_ID)
      .then((s) => {
        if (!alive || !s) return;
        setSt((prev) => ({
          name: s.name || prev.name,
          tagline: s.tagline || prev.tagline,
          color: s.color || prev.color,
          logo: s.logo || prev.logo,
          // query params still win (explicit share links) then backend, then defaults.
          streamUrl: qs.get("stream") || s.stream_url || prev.streamUrl,
          statusUrl: qs.get("status") || s.status_url || prev.statusUrl,
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Live listener count + on-air status (AzuraCast stats API, else Icecast).
  useEffect(() => {
    if (!BACKEND || (!STATUS_URL && !STREAM_URL)) return;
    let alive = true;
    const poll = async () => {
      try {
        const url = STATUS_URL
          ? `${BACKEND}/api/broadcast/azuracast-status?url=${encodeURIComponent(STATUS_URL)}`
          : `${BACKEND}/api/broadcast/icecast-status?stream=${encodeURIComponent(STREAM_URL)}`;
        const r = await fetch(url);
        const d = await r.json();
        if (!alive || !d || !d.ok) return;
        if (typeof d.live === "boolean") setStationLive(d.live);
        if (typeof d.listeners === "number") setListeners(d.listeners);
        if (d.nowPlaying) setNowPlaying({ title: d.nowPlaying });
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [STATUS_URL, STREAM_URL]);

  // Poll the station "now playing" feed (published by the studio when it's online).
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const np = await api.getNowPlaying(STATION_ID || undefined);
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

  const accent = st.color || "#ff5a1f";

  const ThemeToggle = () => (
    <div className="absolute top-4 right-4 z-20 flex items-center gap-1 rounded-full border border-[var(--hl-line)] bg-black/50 p-1" data-testid="live-theme-toggle">
      <button
        onClick={() => setThemePref("full")}
        className={`px-2.5 py-1 rounded-full text-[10px] font-600 transition ${theme === "full" ? "text-white" : "text-[var(--hl-muted)] hover:text-[var(--hl-text)]"}`}
        style={theme === "full" ? { background: accent } : {}}
        data-testid="live-theme-full"
      >
        Card
      </button>
      <button
        onClick={() => setThemePref("compact")}
        className={`px-2.5 py-1 rounded-full text-[10px] font-600 transition ${theme === "compact" ? "text-white" : "text-[var(--hl-muted)] hover:text-[var(--hl-text)]"}`}
        style={theme === "compact" ? { background: accent } : {}}
        data-testid="live-theme-compact"
      >
        Bar
      </button>
    </div>
  );

  // Compact skin — a slim horizontal player bar for embedding in a page strip.
  if (theme === "compact") {
    return (
      <div className="min-h-screen bg-[var(--hl-bg)] text-[var(--hl-text)] relative overflow-hidden grid place-items-center p-4" data-testid="listen-live-page">
        <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(700px 360px at 50% -10%, ${accent}33, transparent 60%)` }} />
        <ThemeToggle />
        <div className="relative z-10 w-full max-w-2xl hl-panel rounded-2xl p-3 flex items-center gap-3" data-testid="live-compact-bar">
          <img
            src={nowPlaying?.art || st.logo}
            alt={st.name}
            className="h-14 w-14 shrink-0 rounded-lg object-cover bg-black/40 border border-[var(--hl-line)]"
            data-testid="live-logo"
            onError={(e) => { e.currentTarget.src = `${PUBLIC}/hl-emblem.png`; }}
          />
          <button
            data-testid="live-play-button"
            onClick={toggle}
            disabled={!STREAM_URL || loading}
            className="h-12 w-12 shrink-0 grid place-items-center rounded-full text-white shadow-[0_6px_20px_rgba(255,23,68,0.35)] hover:scale-105 active:scale-95 transition disabled:opacity-40"
            style={{ background: `linear-gradient(135deg, ${accent}, #ff2d0e)` }}
            aria-label={playing ? "Pause" : "Play"}
          >
            {loading ? <Radio size={20} className="animate-pulse" /> : playing ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate font-display text-base tracking-wide" data-testid="live-station-name">{st.name}</span>
              <span className="inline-flex items-center gap-1 shrink-0" data-testid="live-badge">
                <span className="h-2 w-2 rounded-full" style={{ background: stationLive || playing ? accent : "var(--hl-muted)", animation: (stationLive || playing) ? "pulse 1.5s ease-in-out infinite" : "none" }} />
                <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]" data-testid="live-status">
                  {stationLive === true ? "Live" : stationLive === false ? "Offline" : playing ? "On Air" : "Live"}
                </span>
              </span>
            </div>
            <div className="truncate text-xs text-[var(--hl-muted)]" data-testid="live-now-playing">
              {nowPlaying ? (
                <>
                  <span className="text-[var(--hl-text)]" data-testid="live-np-title">{nowPlaying.title}</span>
                  {nowPlaying.artist && <span data-testid="live-np-artist"> — {nowPlaying.artist}</span>}
                </>
              ) : (
                st.tagline
              )}
            </div>
          </div>
          {listeners != null && (
            <div className="hidden sm:flex items-center gap-1 shrink-0 text-xs text-[var(--hl-muted)]" data-testid="live-listeners">
              <Radio size={12} style={{ color: accent }} /> <span className="text-[var(--hl-text)]">{listeners}</span>
            </div>
          )}
          {STREAM_URL && (
            <button data-testid="live-mute" onClick={toggleMute} className="shrink-0 text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">
              {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
          <audio ref={audioRef} preload="none" />
        </div>
        {error && (
          <div className="relative z-10 mt-2 text-[var(--hl-onair)] text-xs flex items-center gap-2" data-testid="live-error">
            <AlertCircle size={14} /> {error}
          </div>
        )}
        {!STREAM_URL && (
          <div className="relative z-10 mt-2 text-xs text-[var(--hl-amber)]" data-testid="live-not-configured">
            Stream link not set yet.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--hl-bg)] text-[var(--hl-text)] relative overflow-hidden" data-testid="listen-live-page">
      {/* ambient glow tinted with the station's accent */}
      <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(900px 500px at 50% -10%, ${accent}33, transparent 60%)` }} />
      <ThemeToggle />

      <div className="relative z-10 min-h-screen grid place-items-center p-5">
        <div className="w-full max-w-md hl-panel rounded-3xl p-7 text-center">
          <div className="flex flex-col items-center gap-4">
            <img
              src={st.logo}
              alt={st.name}
              className="h-24 w-auto max-w-[70%] object-contain"
              style={{ filter: `drop-shadow(0 0 24px ${accent}59)` }}
              data-testid="live-logo"
              onError={(e) => {
                e.currentTarget.src = `${PUBLIC}/hl-emblem.png`;
              }}
            />
            <div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-wide leading-none" data-testid="live-station-name">
                {st.name}
              </h1>
              <p className="text-[11px] uppercase tracking-[0.35em] text-[var(--hl-muted)] mt-1">{st.tagline}</p>
            </div>

            {/* Live badge — reflects the station's real on-air status */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--hl-line)] bg-black/40" data-testid="live-badge">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{
                  background: stationLive ? "#2ee5c4" : stationLive === false ? "var(--hl-muted)" : playing ? accent : "var(--hl-muted)",
                  animation: (stationLive || (stationLive == null && playing)) ? "pulse 1.5s ease-in-out infinite" : "none",
                }}
              />
              <span className="text-xs font-600 uppercase tracking-wider" data-testid="live-status">
                {stationLive === true ? "🟢 Live" : stationLive === false ? "⚪ Offline" : playing ? "On Air — Live" : "Live Radio"}
              </span>
            </div>

            {listeners != null && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--hl-muted)]" data-testid="live-listeners">
                <Radio size={12} style={{ color: accent }} />
                <span className="text-[var(--hl-text)]">{listeners}</span> listening now
              </div>
            )}

            {/* Play control */}
            <button
              data-testid="live-play-button"
              onClick={toggle}
              disabled={!STREAM_URL || loading}
              className="mt-2 h-20 w-20 grid place-items-center rounded-full text-white shadow-[0_10px_40px_rgba(255,23,68,0.4)] hover:scale-105 active:scale-95 transition disabled:opacity-40 disabled:hover:scale-100"
              style={{ background: `linear-gradient(135deg, ${accent}, #ff2d0e)` }}
              aria-label={playing ? "Pause" : "Play"}
            >
              {loading ? <Radio size={30} className="animate-pulse" /> : playing ? <Pause size={34} /> : <Play size={34} className="ml-1" />}
            </button>
            <div className="text-sm text-[var(--hl-muted)]">{playing ? "Tap to pause" : "Tap to listen live"}</div>

            {nowPlaying && (
              <div className="mt-3 w-full flex items-center gap-3 rounded-2xl border border-[var(--hl-line)] bg-black/40 px-3 py-2.5 text-left" data-testid="live-now-playing">
                <img
                  src={nowPlaying.art || st.logo}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-md object-cover bg-black/40 border border-[var(--hl-line)]"
                  onError={(e) => {
                    e.currentTarget.src = `${PUBLIC}/hl-emblem.png`;
                  }}
                />
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.25em]" style={{ color: accent }}>
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
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--hl-cue)]" data-testid="live-coming-up">
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
              <a data-testid="live-website-link" href={WEBSITE_URL} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">
                Visit our website <ExternalLink size={12} />
              </a>
            )}
          </div>

          <audio ref={audioRef} preload="none" />
        </div>

        <div className="absolute bottom-4 text-[11px] text-[var(--hl-muted)]">© {st.name} · Powered by Hot Live 95</div>
      </div>
    </div>
  );
}
