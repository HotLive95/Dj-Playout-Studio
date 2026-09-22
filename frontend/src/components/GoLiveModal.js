import React, { useEffect, useRef, useState } from "react";
import { X, Podcast, Radio, Loader2, Square, AlertTriangle, Mic, Info, Users, CalendarClock, RotateCw, Archive, Play, Download, Trash2 } from "lucide-react";

const CFG_KEY = "hotlive95_radioco";
const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const loadCfg = () => {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
  } catch {
    return {};
  }
};

// Broadcast the studio's live program mix to a radio.co station (SHOUTcast v1),
// relayed through the app backend. Online-only; the DJ's own credentials stay
// on this device and are sent over the encrypted (wss) connection to start.
export default function GoLiveModal({ state, error, reconnect, scheduledAt, scheduledPlaylistId, playlists = [], broadcasts = [], nowPlaying, getLevel, getHealth, onStart, onStop, onSchedule, onCancelSchedule, onDownloadBroadcast, onDeleteBroadcast, onGetBroadcastUrl, onClose }) {
  const saved = loadCfg();
  const [host, setHost] = useState(saved.host || "denim.radio.co");
  const [port, setPort] = useState(saved.port || 5189);
  const [password, setPassword] = useState(saved.password || "");
  const [name, setName] = useState(saved.name || "Hot Live 95");
  const [bitrate, setBitrate] = useState(saved.bitrate || 128);
  const [includeMic, setIncludeMic] = useState(saved.includeMic !== false);
  const [stationId, setStationId] = useState(saved.stationId || "");
  const [scheduleInput, setScheduleInput] = useState("");
  const [schedulePlaylist, setSchedulePlaylist] = useState(scheduledPlaylistId || "");
  const [listeners, setListeners] = useState(null);
  const [level, setLevel] = useState(0);
  const [health, setHealth] = useState(null);
  const [playId, setPlayId] = useState(null);
  const [playUrl, setPlayUrl] = useState(null);
  const raf = useRef(0);

  const live = state === "live";
  const busy = state === "connecting";
  const reconnecting = state === "reconnecting";

  useEffect(() => {
    if (!live && !reconnecting) {
      setLevel(0);
      setHealth(null);
      return;
    }
    const tick = () => {
      setLevel(getLevel());
      if (getHealth) setHealth(getHealth());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [live, reconnecting, getLevel, getHealth]);

  // Poll radio.co public status for the live listener count while on air.
  useEffect(() => {
    if (!live || !stationId.trim()) {
      setListeners(null);
      return;
    }
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch(`${BACKEND}/api/broadcast/station-status?station_id=${encodeURIComponent(stationId.trim())}`);
        const d = await r.json();
        if (alive && d.ok) setListeners(typeof d.listeners === "number" ? d.listeners : null);
      } catch {
        /* ignore */
      }
    };
    poll();
    const iv = setInterval(poll, 15000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [live, stationId]);

  const go = () => {
    const cfg = { host: host.trim(), port: Number(port), password, name: name.trim(), bitrate: Number(bitrate), genre: "Various", includeMic, stationId: stationId.trim() };
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    onStart({ host: cfg.host, port: cfg.port, password: cfg.password, name: cfg.name, bitrate: cfg.bitrate, genre: "Various" }, includeMic);
  };

  const armSchedule = () => {
    if (!scheduleInput) return;
    const ts = new Date(scheduleInput).getTime();
    if (!ts || ts <= Date.now()) return;
    const cfg = { host: host.trim(), port: Number(port), password, name: name.trim(), bitrate: Number(bitrate), genre: "Various", includeMic, stationId: stationId.trim() };
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    onSchedule({ at: ts, playlistId: schedulePlaylist || null });
  };

  const previewBroadcast = async (b) => {
    if (playId === b.id) {
      setPlayId(null);
      if (playUrl) URL.revokeObjectURL(playUrl);
      setPlayUrl(null);
      return;
    }
    if (playUrl) URL.revokeObjectURL(playUrl);
    const url = await onGetBroadcastUrl(b);
    setPlayUrl(url);
    setPlayId(url ? b.id : null);
  };
  const fmtSize = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

  const canGo = host.trim() && Number(port) > 0 && password.trim();
  const pct = Math.min(100, Math.round(level * 140));
  const schedRemain = scheduledAt ? Math.max(0, Math.round((scheduledAt - Date.now()) / 60000)) : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4"
      data-testid="go-live-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Podcast size={18} className="text-[var(--hl-onair)]" />
            <h2 className="font-display text-lg">Go Live · radio.co</h2>
          </div>
          <button data-testid="go-live-close" onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {live || reconnecting ? (
            <div className="space-y-4" data-testid="go-live-onair">
              {reconnecting ? (
                <div className="flex flex-col items-center gap-1.5" data-testid="go-live-reconnecting">
                  <RotateCw size={26} className="text-[var(--hl-amber)] animate-spin" />
                  <span className="font-display text-xl text-[var(--hl-amber)]">Reconnecting…</span>
                  <span className="text-sm text-[var(--hl-muted)]">
                    Link dropped — retrying in {reconnect?.seconds ?? 0}s (attempt {reconnect?.attempt ?? 1})
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 justify-center">
                  <span className="h-3 w-3 rounded-full bg-[var(--hl-onair)] hl-onair-pulse" />
                  <span className="font-display text-2xl tracking-wide text-[var(--hl-onair)]">ON AIR</span>
                </div>
              )}
              <p className="text-center text-sm text-[var(--hl-muted)]">
                Broadcasting to <span className="text-[var(--hl-text)]">{host}</span>
              </p>
              {stationId.trim() && (
                <div className="flex items-center justify-center gap-2 text-sm" data-testid="go-live-listeners">
                  <Users size={15} className="text-[var(--hl-cue)]" />
                  <span className="text-[var(--hl-text)]">
                    {listeners == null ? "—" : listeners} {listeners === 1 ? "listener" : "listeners"}
                  </span>
                </div>
              )}
              {nowPlaying && (
                <p className="text-center text-xs text-[var(--hl-muted)]" data-testid="go-live-nowplaying">
                  Now playing: <span className="text-[var(--hl-cue)]">{nowPlaying}</span>
                </p>
              )}
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)] mb-1">Air level</div>
                <div className="h-3 w-full rounded-full bg-[#2a2a31] overflow-hidden" data-testid="go-live-level">
                  <div
                    className="h-full rounded-full transition-[width] duration-75"
                    style={{
                      width: `${pct}%`,
                      background: pct > 90 ? "var(--hl-onair)" : "linear-gradient(90deg,#2ee5c4,#ffab00)",
                    }}
                  />
                </div>
              </div>
              {health && (
                <div className="flex items-center justify-between rounded-lg border border-[var(--hl-line)] px-3 py-2" data-testid="go-live-health">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${
                        health.status === "good"
                          ? "bg-[#2ee5c4]"
                          : health.status === "buffering" || health.status === "unstable"
                          ? "bg-[var(--hl-amber)]"
                          : "bg-[var(--hl-onair)]"
                      }`}
                    />
                    <span className="text-sm text-[var(--hl-text)]" data-testid="go-live-health-status">
                      {health.status === "good"
                        ? "Stable connection"
                        : health.status === "buffering"
                        ? "Buffering — network slow"
                        : health.status === "unstable"
                        ? "Dropouts detected"
                        : health.status === "reconnecting"
                        ? "Reconnecting"
                        : "Connecting"}
                    </span>
                  </div>
                  <span className="text-xs tabular-nums text-[var(--hl-muted)]" data-testid="go-live-health-kbps">
                    {health.kbps} kbps{health.drops ? ` · ${health.drops} drops` : ""}
                  </span>
                </div>
              )}
              <button
                data-testid="go-live-stop"
                onClick={onStop}
                className="w-full h-11 rounded-lg bg-[var(--hl-onair)] text-white font-700 flex items-center justify-center gap-2"
              >
                <Square size={16} className="fill-current" /> Stop broadcast
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 text-[11px] text-[var(--hl-muted)] leading-relaxed rounded-lg border border-[var(--hl-line)] p-2.5">
                <Info size={14} className="mt-0.5 shrink-0 text-[var(--hl-cue)]" />
                Enter the details from your radio.co dashboard → <b>Live / DJ</b>. Your password stays on this device.
                radio.co only accepts a connection when <b>Live Anytime</b> is on or you're in a scheduled slot.
              </div>

              <div className="space-y-2.5">
                <label className="block">
                  <span className="text-xs text-[var(--hl-muted)]">Server host</span>
                  <input
                    data-testid="go-live-host"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-onair)]"
                  />
                </label>
                <div className="flex gap-2">
                  <label className="flex-1">
                    <span className="text-xs text-[var(--hl-muted)]">Source port</span>
                    <input
                      data-testid="go-live-port"
                      type="number"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                      className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-onair)]"
                    />
                    <span className="text-[10px] text-[var(--hl-muted)]">usually base port + 1</span>
                  </label>
                  <label className="w-28">
                    <span className="text-xs text-[var(--hl-muted)]">Bitrate</span>
                    <select
                      data-testid="go-live-bitrate"
                      value={bitrate}
                      onChange={(e) => setBitrate(Number(e.target.value))}
                      className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-onair)]"
                    >
                      <option value={128}>128 kbps</option>
                      <option value={192}>192 kbps</option>
                      <option value={320}>320 kbps</option>
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className="text-xs text-[var(--hl-muted)]">Broadcast password</span>
                  <input
                    data-testid="go-live-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="from radio.co dashboard"
                    className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-onair)]"
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--hl-muted)]">Station name (shown to listeners)</span>
                  <input
                    data-testid="go-live-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-onair)]"
                  />
                </label>
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    data-testid="go-live-mic"
                    checked={includeMic}
                    onChange={(e) => setIncludeMic(e.target.checked)}
                    className="h-4 w-4 accent-[var(--hl-onair)]"
                  />
                  <Mic size={14} className="text-[var(--hl-onair)]" /> Put my mic on air (talk over the music)
                </label>
                <label className="block">
                  <span className="text-xs text-[var(--hl-muted)]">Station ID (optional — for live listener count)</span>
                  <input
                    data-testid="go-live-station-id"
                    value={stationId}
                    onChange={(e) => setStationId(e.target.value)}
                    placeholder="e.g. s1a2b3c4d5 (from your radio.co stream URL)"
                    className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-onair)]"
                  />
                </label>
                <div className="rounded-lg border border-[var(--hl-line)] p-3 space-y-2">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                    <CalendarClock size={14} className="text-[var(--hl-amber)]" /> Scheduled go-live (optional)
                  </div>
                  {scheduledAt ? (
                    <div className="flex items-center justify-between gap-2" data-testid="go-live-scheduled">
                      <span className="text-sm text-[var(--hl-text)]">
                        Armed for {new Date(scheduledAt).toLocaleString()} · in {schedRemain} min
                        {scheduledPlaylistId && playlists.find((p) => p.id === scheduledPlaylistId)
                          ? ` · plays "${playlists.find((p) => p.id === scheduledPlaylistId).name}"`
                          : ""}
                      </span>
                      <button
                        data-testid="go-live-cancel-schedule"
                        onClick={onCancelSchedule}
                        className="text-xs px-2 py-1 rounded border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:border-[var(--hl-onair)]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <select
                        data-testid="go-live-schedule-playlist"
                        value={schedulePlaylist}
                        onChange={(e) => setSchedulePlaylist(e.target.value)}
                        className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-amber)]"
                      >
                        <option value="">Auto-play a playlist… (optional)</option>
                        {playlists.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex items-center gap-2">
                        <input
                          data-testid="go-live-schedule-input"
                          type="datetime-local"
                          value={scheduleInput}
                          onChange={(e) => setScheduleInput(e.target.value)}
                          className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-amber)]"
                        />
                        <button
                          data-testid="go-live-arm-schedule"
                          onClick={armSchedule}
                          disabled={!canGo || !scheduleInput}
                          className="shrink-0 px-3 py-2 rounded-lg border border-[var(--hl-amber)] text-[var(--hl-amber)] text-xs font-700 hover:bg-[rgba(255,171,0,0.12)] disabled:opacity-40"
                          title="Auto-start the broadcast at this time (needs the password saved)"
                        >
                          Arm
                        </button>
                      </div>
                    </>
                  )}
                  <p className="text-[10px] text-[var(--hl-muted)]">Keep the app open on this device; it goes on air hands-free at the set time.</p>
                </div>
              </div>

              {state === "error" && error && (
                <div className="flex items-start gap-2 text-sm text-[var(--hl-onair)]" data-testid="go-live-error">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <button
                data-testid="go-live-start"
                onClick={go}
                disabled={!canGo || busy}
                className="w-full h-12 rounded-lg bg-[var(--hl-onair)] text-white font-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}
                {busy ? "Connecting to radio.co…" : "Go live now"}
              </button>
              <p className="text-[11px] text-[var(--hl-muted)] text-center">
                Broadcasting needs an internet connection. Your offline DJing is unaffected.
              </p>

              {broadcasts.length > 0 && (
                <div className="rounded-lg border border-[var(--hl-line)] p-3 space-y-2" data-testid="go-live-archive">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                    <Archive size={14} className="text-[var(--hl-cue)]" /> Past broadcasts ({broadcasts.length})
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {broadcasts.map((b) => (
                      <div
                        key={b.id}
                        data-testid={`go-live-archive-item-${b.id}`}
                        className="flex items-center gap-2 rounded-md bg-black/30 px-2.5 py-1.5"
                      >
                        <button
                          data-testid={`go-live-archive-play-${b.id}`}
                          onClick={() => previewBroadcast(b)}
                          className="h-7 w-7 grid place-items-center rounded shrink-0 text-[var(--hl-cue)] hover:bg-white/10"
                          title={playId === b.id ? "Stop" : "Preview"}
                        >
                          {playId === b.id ? <Square size={13} className="fill-current" /> : <Play size={14} />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs truncate text-[var(--hl-text)]">{b.name.replace("HotLive95 Broadcast ", "")}</div>
                          <div className="text-[10px] text-[var(--hl-muted)]">{fmtSize(b.size || 0)}</div>
                        </div>
                        <button
                          data-testid={`go-live-archive-download-${b.id}`}
                          onClick={() => onDownloadBroadcast(b)}
                          className="h-7 w-7 grid place-items-center rounded shrink-0 text-[var(--hl-muted)] hover:text-white"
                          title="Download"
                        >
                          <Download size={14} />
                        </button>
                        <button
                          data-testid={`go-live-archive-delete-${b.id}`}
                          onClick={() => onDeleteBroadcast(b)}
                          className="h-7 w-7 grid place-items-center rounded shrink-0 text-[var(--hl-muted)] hover:text-[var(--hl-onair)]"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  {playUrl && (
                    <audio data-testid="go-live-archive-audio" src={playUrl} autoPlay controls className="w-full h-8 mt-1" onEnded={() => setPlayId(null)} />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
