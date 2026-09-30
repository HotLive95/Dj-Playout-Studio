import React, { useEffect, useRef, useState } from "react";
import {
  X, Radio, Play, Pause, SkipForward, SkipBack, Mic, MicOff, Headphones,
  Wifi, WifiOff, Loader2, Music2, ListMusic, Volume2, Clock, Check,
} from "lucide-react";
import { MultiChannelEngine } from "@/lib/multiChannel";
import { stationWsConfig } from "@/lib/stations";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const wsUrlFor = () => BACKEND.replace(/^http/, "ws") + "/api/broadcast/ws";

const DUCK_LS = "hotlive95_mc_duck";
const SCHED_LS = "hotlive95_mc_schedules";
const loadDuckDip = () => {
  const v = parseFloat(localStorage.getItem(DUCK_LS) || "");
  return Number.isFinite(v) ? v : 0.8;
};
const loadSchedules = () => {
  try {
    return JSON.parse(localStorage.getItem(SCHED_LS) || "{}") || {};
  } catch {
    return {};
  }
};
const saveSchedule = (id, sched) => {
  const all = loadSchedules();
  all[id] = sched;
  try {
    localStorage.setItem(SCHED_LS, JSON.stringify(all));
  } catch {
    /* ignore */
  }
};

const buildItems = (pl, tracks) => {
  if (!pl) return [];
  if (pl.items) return pl.items;
  return (pl.trackIds || [])
    .map((tid) => {
      const t = tracks[tid];
      return t ? { id: tid, title: t.title || t.name, artist: t.artist || "" } : null;
    })
    .filter(Boolean);
};

const statusChip = (s) => {
  const map = {
    live: ["● LIVE", "text-[#22c55e]"],
    connecting: ["Connecting…", "text-[var(--hl-fire)]"],
    reconnecting: ["Reconnecting…", "text-[var(--hl-fire)]"],
    error: ["Error", "text-[var(--hl-onair)]"],
    stopped: ["Offline", "text-[var(--hl-muted)]"],
    idle: ["Offline", "text-[var(--hl-muted)]"],
  };
  return map[s] || map.idle;
};

function ChannelColumn({ station, playlists, tracks, engine, tick }) {
  const [playlistId, setPlaylistId] = useState(station.defaultPlaylistId || playlists[0]?.id || "");
  const [cur, setCur] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState("idle");
  const [statusInfo, setStatusInfo] = useState(null);
  const [micOn, setMicOn] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [sched, setSched] = useState(() => loadSchedules()[station.id] || { at: "", goLive: false, enabled: false });
  const schedFiredRef = useRef("");
  const accent = station.color || "#ff5a1f";

  const updateSched = (patch) => {
    setSched((prev) => {
      const next = { ...prev, ...patch };
      saveSchedule(station.id, next);
      return next;
    });
  };

  // Per-channel auto-start: at the set time each day, start this channel's
  // program from the top (and optionally take it live) so a channel can run
  // itself overnight.
  useEffect(() => {
    if (!sched.enabled || !sched.at) return;
    const iv = setInterval(() => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const stamp = `${now.toDateString()} ${hhmm}`;
      if (hhmm === sched.at && schedFiredRef.current !== stamp) {
        schedFiredRef.current = stamp;
        engine.playIndex(station.id, 0);
        if (sched.goLive && station.host && station.password) {
          engine.goLive(station.id, wsUrlFor(), stationWsConfig(station));
        }
      }
    }, 10000);
    return () => clearInterval(iv);
  }, [sched.enabled, sched.at, sched.goLive, engine, station]);

  // Register the channel once.
  useEffect(() => {
    engine.addChannel(station.id, {
      bitrate: station.bitrate || 128,
      onTrack: (item) => setCur(item),
      onState: (s, info) => {
        if (["playing", "paused"].includes(s)) {
          setPlaying(s === "playing");
          return;
        }
        setStatus(s === "stopped" ? "idle" : s);
        setStatusInfo(typeof info === "object" ? info : null);
      },
    });
    const pl = playlists.find((p) => p.id === playlistId) || playlists[0];
    if (pl) {
      engine.setPlaylist(station.id, buildItems(pl, tracks));
      engine.cue(station.id);
    }
    return () => engine.removeChannel(station.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changePlaylist = (id) => {
    setPlaylistId(id);
    const pl = playlists.find((p) => p.id === id);
    engine.setPlaylist(station.id, buildItems(pl, tracks));
    engine.cue(station.id);
  };

  const goLive = () => {
    if (!station.host || !station.password) {
      setStatus("error");
      setStatusInfo(null);
      return;
    }
    engine.goLive(station.id, wsUrlFor(), stationWsConfig(station));
  };

  const level = engine.getLevel(station.id); // eslint-disable-line no-unused-vars
  const lvl = Math.min(1, engine.getLevel(station.id) * 1.6);
  const pl = playlists.find((p) => p.id === playlistId);
  const items = buildItems(pl, tracks);
  const nextItem = items.length ? items[(items.findIndex((i) => cur && i.id === cur.id) + 1 + items.length) % items.length] : null;
  const [chipText, chipCls] = statusChip(status);
  const isLive = status === "live";
  const busy = status === "connecting" || status === "reconnecting";

  return (
    <div
      className="flex flex-col rounded-xl bg-black/30 border overflow-hidden"
      style={{ borderColor: `${accent}55`, boxShadow: isLive ? `0 0 0 1px ${accent}, 0 0 22px ${accent}44` : "none" }}
      data-testid={`mc-channel-${station.id}`}
    >
      {/* header */}
      <div className="px-3 py-2.5 flex items-center gap-2" style={{ background: `${accent}1a` }}>
        <img src={station.logo || "/hl-emblem.png"} alt="" className="w-8 h-8 rounded object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-600" data-testid={`mc-name-${station.id}`}>{station.name}</div>
          <div className={`text-[11px] ${chipCls}`} data-testid={`mc-status-${station.id}`}>
            {chipText}{busy && statusInfo?.seconds ? ` ${statusInfo.seconds}s` : ""}
          </div>
        </div>
      </div>

      {/* playlist picker */}
      <div className="px-3 pt-2.5">
        <label className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)] flex items-center gap-1">
          <ListMusic size={11} /> Program
        </label>
        <select
          value={playlistId}
          onChange={(e) => changePlaylist(e.target.value)}
          className="hl-input mt-1"
          data-testid={`mc-playlist-${station.id}`}
        >
          {playlists.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* now playing */}
      <div className="px-3 py-3 flex-1">
        <div className="rounded-lg bg-black/40 p-3 min-h-[64px]">
          <div className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)] flex items-center gap-1 mb-1">
            <Music2 size={11} /> On this channel
          </div>
          <div className="truncate text-sm font-600" data-testid={`mc-nowplaying-${station.id}`}>
            {cur ? (cur.title || cur.id) : "—"}
          </div>
          <div className="truncate text-[11px] text-[var(--hl-muted)]">{cur?.artist || ""}</div>
          {nextItem && (
            <div className="mt-2 truncate text-[11px] text-[var(--hl-muted)]">
              Up next: <span className="text-[var(--hl-text)]">{nextItem.title}</span>
            </div>
          )}
        </div>
        {/* level meter */}
        <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full transition-[width] duration-100" style={{ width: `${lvl * 100}%`, background: accent }} data-testid={`mc-level-${station.id}`} />
        </div>
      </div>

      {/* transport */}
      <div className="px-3 pb-2 flex items-center justify-center gap-2">
        <button onClick={() => engine.prev(station.id)} className="w-9 h-9 grid place-items-center rounded-full bg-white/5 hover:bg-white/10" data-testid={`mc-prev-${station.id}`}><SkipBack size={16} /></button>
        <button onClick={() => engine.toggle(station.id)} className="w-12 h-12 grid place-items-center rounded-full text-white" style={{ background: accent }} data-testid={`mc-play-${station.id}`}>
          {playing ? <Pause size={20} /> : <Play size={20} />}
        </button>
        <button onClick={() => engine.next(station.id)} className="w-9 h-9 grid place-items-center rounded-full bg-white/5 hover:bg-white/10" data-testid={`mc-next-${station.id}`}><SkipForward size={16} /></button>
      </div>

      {/* mic / monitor */}
      <div className="px-3 pb-2 grid grid-cols-2 gap-2">
        <button
          onClick={() => { const v = !micOn; setMicOn(v); engine.setMic(station.id, v); }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-600 ${micOn ? "hl-fire-gradient text-white" : "bg-white/5 text-[var(--hl-muted)] hover:bg-white/10"}`}
          data-testid={`mc-mic-${station.id}`}
        >
          {micOn ? <Mic size={14} /> : <MicOff size={14} />} Mic
        </button>
        <button
          onClick={() => { const v = !monitor; setMonitor(v); engine.setMonitor(station.id, v); }}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-600 ${monitor ? "bg-white/20 text-white" : "bg-white/5 text-[var(--hl-muted)] hover:bg-white/10"}`}
          data-testid={`mc-monitor-${station.id}`}
        >
          <Headphones size={14} /> Cue
        </button>
      </div>

      {/* ducking indicator */}
      {micOn && (
        <div className="px-3 pb-1 text-[10px] text-[var(--hl-cue)] flex items-center gap-1" data-testid={`mc-ducking-${station.id}`}>
          <Volume2 size={11} /> Music ducked for mic
        </div>
      )}

      {/* per-channel auto-start schedule */}
      <div className="px-3 pb-2">
        <div className="rounded-lg bg-black/30 border border-[var(--hl-line)] p-2">
          <label className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">
            <span className="flex items-center gap-1"><Clock size={11} /> Auto-start</span>
            <button
              onClick={() => updateSched({ enabled: !sched.enabled })}
              className={`relative h-4 w-8 rounded-full transition ${sched.enabled ? "bg-[var(--hl-fire)]" : "bg-white/15"}`}
              data-testid={`mc-sched-enable-${station.id}`}
              aria-pressed={sched.enabled}
            >
              <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${sched.enabled ? "left-4" : "left-0.5"}`} />
            </button>
          </label>
          {sched.enabled && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="time"
                value={sched.at}
                onChange={(e) => updateSched({ at: e.target.value })}
                className="hl-input flex-1 py-1 text-xs"
                data-testid={`mc-sched-time-${station.id}`}
              />
              <button
                onClick={() => updateSched({ goLive: !sched.goLive })}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-600 ${sched.goLive ? "hl-fire-gradient text-white" : "bg-white/5 text-[var(--hl-muted)]"}`}
                data-testid={`mc-sched-golive-${station.id}`}
                title="Also go live at this time"
              >
                {sched.goLive && <Check size={11} />} Live
              </button>
            </div>
          )}
        </div>
      </div>

      {/* go live */}
      <div className="px-3 pb-3">
        {isLive || busy ? (
          <button onClick={() => engine.stopLive(station.id)} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--hl-onair)]/60 text-[var(--hl-onair)] px-3 py-2 text-sm font-600" data-testid={`mc-stop-${station.id}`}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <WifiOff size={14} />} {busy ? "Connecting…" : "Stop broadcast"}
          </button>
        ) : (
          <button onClick={goLive} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg hl-fire-gradient text-white px-3 py-2 text-sm font-600" data-testid={`mc-golive-${station.id}`}>
            <Wifi size={14} /> Go live
          </button>
        )}
        {status === "error" && (
          <div className="mt-1 text-[10px] text-[var(--hl-onair)]" data-testid={`mc-error-${station.id}`}>
            Couldn't go live — check this station's host / port / DJ login in the Broadcast Center.
          </div>
        )}
      </div>
    </div>
  );
}

export default function MultiChannelStudio({ stations = [], playlists = [], tracks = {}, onClose }) {
  const engineRef = useRef(null);
  if (!engineRef.current) engineRef.current = new MultiChannelEngine();
  const engine = engineRef.current;
  const [tick, setTick] = useState(0);
  const [duckDip, setDuckDip] = useState(loadDuckDip);

  // Apply the global ducking level to the engine (music gain = 1 - dip).
  useEffect(() => {
    engine.setDuckLevel(1 - duckDip);
    try {
      localStorage.setItem(DUCK_LS, String(duckDip));
    } catch {
      /* ignore */
    }
  }, [duckDip, engine]);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => (t + 1) % 1000), 120);
    return () => {
      clearInterval(iv);
      engine.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const usable = stations.filter((s) => s && s.id);

  return (
    <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm overflow-auto" data-testid="multichannel-studio">
      <div className="min-h-full p-4 sm:p-6">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-full hl-fire-gradient grid place-items-center"><Radio size={18} className="text-white" /></div>
              <div>
                <h2 className="font-display text-xl tracking-wide">Multi-Channel Studio</h2>
                <p className="text-[11px] text-[var(--hl-muted)]">Air a different live program on each channel — at the same time</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/10" data-testid="multichannel-close"><X size={18} /></button>
          </div>

          {/* global ducking control */}
          <div className="mb-4 rounded-xl border border-[var(--hl-line)] bg-black/30 p-3 flex items-center gap-3 flex-wrap" data-testid="mc-duck-bar">
            <div className="flex items-center gap-1.5 text-xs font-600 text-[var(--hl-text)]">
              <Volume2 size={14} className="text-[var(--hl-fire)]" /> Mic Ducking
            </div>
            <span className="text-[10px] text-[var(--hl-muted)]">Music dips on any channel the moment its mic opens</span>
            <div className="flex items-center gap-2 ml-auto min-w-[220px]">
              <span className="text-[10px] text-[var(--hl-muted)]">Dip</span>
              <input
                type="range"
                min="0"
                max="0.95"
                step="0.05"
                value={duckDip}
                onChange={(e) => setDuckDip(Number(e.target.value))}
                className="hl-jingle-vol flex-1"
                data-testid="mc-duck-slider"
              />
              <span className="text-xs font-mono w-10 text-right" data-testid="mc-duck-value">{Math.round(duckDip * 100)}%</span>
            </div>
          </div>

          {usable.length === 0 ? (
            <div className="hl-panel rounded-xl p-10 text-center text-[var(--hl-muted)]" data-testid="mc-empty">
              Add stations in the Broadcast Center first — each station becomes a channel you can air a separate program on.
            </div>
          ) : (
            <div
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.min(usable.length, 4)}, minmax(0, 1fr))` }}
            >
              {usable.map((s) => (
                <ChannelColumn key={s.id} station={s} playlists={playlists} tracks={tracks} engine={engine} tick={tick} />
              ))}
            </div>
          )}

          <div className="mt-4 text-center text-[11px] text-[var(--hl-muted)]">
            Each channel plays independently. Turn on <span className="text-[var(--hl-text)]">Cue</span> to monitor a channel in your headphones, <span className="text-[var(--hl-text)]">Mic</span> to talk over it, and <span className="text-[var(--hl-text)]">Go live</span> to stream it to that station.
          </div>
        </div>
      </div>
    </div>
  );
}
