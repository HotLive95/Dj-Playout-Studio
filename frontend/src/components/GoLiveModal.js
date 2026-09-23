import React, { useEffect, useRef, useState } from "react";
import { X, Podcast, Radio, Loader2, Square, AlertTriangle, Mic, Info, Users, CalendarClock, RotateCw, Archive, Play, Download, Trash2, ListPlus, Plug, CheckCircle2, ListChecks, Bookmark, Save, Gauge, Timer } from "lucide-react";

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
export default function GoLiveModal({ state, error, reconnect, loginRetry, onCancelRetry, onTest, onStartMeter, onStopMeter, getMeterLevel, metaFormat = "artist-title", onMetaFormat, schedules = [], onAddSchedule, onRemoveSchedule, playlists = [], broadcasts = [], nowPlaying, getLevel, getHealth, onStart, onStop, onDownloadBroadcast, onDeleteBroadcast, onGetBroadcastUrl, onArchiveToPlaylist, onClose }) {
  const saved = loadCfg();
  const [host, setHost] = useState(saved.host || "denim.radio.co");
  const [port, setPort] = useState(saved.port || 5189);
  const [password, setPassword] = useState(saved.password || "");
  const [name, setName] = useState(saved.name || "Hot Live 95");
  const [bitrate, setBitrate] = useState(saved.bitrate || 128);
  const [includeMic, setIncludeMic] = useState(saved.includeMic !== false);
  const [stationId, setStationId] = useState(saved.stationId || "");
  const [alertSound, setAlertSound] = useState(saved.alertSound !== false);
  const [scheduleInput, setScheduleInput] = useState("");
  const [scheduleEndInput, setScheduleEndInput] = useState("");
  const [schedulePlaylist, setSchedulePlaylist] = useState("");
  const [scheduleLabel, setScheduleLabel] = useState("");
  const [listeners, setListeners] = useState(null);
  const [listenerHist, setListenerHist] = useState([]);
  const [level, setLevel] = useState(0);
  const [health, setHealth] = useState(null);
  const [dropAlert, setDropAlert] = useState(false);
  const [playId, setPlayId] = useState(null);
  const [playUrl, setPlayUrl] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [autoWait, setAutoWait] = useState(saved.autoWait || false);
  const [meterOn, setMeterOn] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0);
  const meterRaf = useRef(0);
  const meterTimer = useRef(null);
  const [presets, setPresets] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hotlive95_radioco_presets") || "[]");
    } catch {
      return [];
    }
  });
  const [presetName, setPresetName] = useState("");
  const [armTesting, setArmTesting] = useState(false);
  const [flash, setFlash] = useState(false);
  const prevLive = useRef(false);
  const raf = useRef(0);
  const prevStatus = useRef("good");
  const beepCtx = useRef(null);

  const live = state === "live";
  const busy = state === "connecting";
  const reconnecting = state === "reconnecting";
  const retrying = !!loginRetry;

  const beep = () => {
    if (!alertSound) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!beepCtx.current) beepCtx.current = new AC();
      const ctx = beepCtx.current;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.value = 0.0001;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.start(t);
      o.stop(t + 0.36);
    } catch {
      /* ignore */
    }
  };

  const goLiveChime = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!beepCtx.current) beepCtx.current = new AC();
      const ctx = beepCtx.current;
      const t0 = ctx.currentTime;
      [660, 990].forEach((freq, i) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = freq;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(ctx.destination);
        const start = t0 + i * 0.16;
        g.gain.exponentialRampToValueAtTime(0.3, start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
        o.start(start);
        o.stop(start + 0.3);
      });
    } catch {
      /* ignore */
    }
  };

  // The moment the stream actually connects: chime + flash the panel.
  useEffect(() => {
    if (live && !prevLive.current) {
      goLiveChime();
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 3000);
      prevLive.current = true;
      return () => clearTimeout(id);
    }
    if (!live) prevLive.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  useEffect(() => {
    if (!live && !reconnecting) {
      setLevel(0);
      setHealth(null);
      return;
    }
    const tick = () => {
      setLevel(getLevel());
      if (getHealth) {
        const h = getHealth();
        setHealth(h);
        if (h) {
          const bad = h.status === "unstable" || h.status === "buffering" || h.status === "reconnecting";
          const wasBad = prevStatus.current === "unstable" || prevStatus.current === "buffering" || prevStatus.current === "reconnecting";
          if (bad && !wasBad) {
            setDropAlert(true);
            beep();
          }
          if (!bad) setDropAlert(false);
          prevStatus.current = h.status;
        }
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, reconnecting, getLevel, getHealth, alertSound]);

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
        if (alive && d.ok && typeof d.listeners === "number") {
          setListeners(d.listeners);
          setListenerHist((h) => [...h, { t: Date.now(), n: d.listeners }].slice(-120));
        }
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
  useEffect(() => {
    if (!live) setListenerHist([]);
  }, [live]);

  const cfgObj = () => ({ host: host.trim(), port: Number(port), password, name: name.trim(), bitrate: Number(bitrate), genre: "Various", includeMic, stationId: stationId.trim(), alertSound, autoWait, metaFormat });

  const startMeter = async () => {
    if (!onStartMeter) return;
    try {
      const ok = await onStartMeter(includeMic);
      if (ok === false) return;
    } catch {
      return;
    }
    setMeterOn(true);
    const tick = () => {
      setMeterLevel(getMeterLevel ? getMeterLevel() : 0);
      meterRaf.current = requestAnimationFrame(tick);
    };
    meterRaf.current = requestAnimationFrame(tick);
    if (meterTimer.current) clearTimeout(meterTimer.current);
    meterTimer.current = setTimeout(() => stopMeter(), 10000);
  };
  const stopMeter = () => {
    cancelAnimationFrame(meterRaf.current);
    if (meterTimer.current) {
      clearTimeout(meterTimer.current);
      meterTimer.current = null;
    }
    setMeterOn(false);
    setMeterLevel(0);
    if (onStopMeter) onStopMeter();
  };
  useEffect(() => () => stopMeter(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => {
    const cfg = cfgObj();
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    stopMeter();
    onStart({ host: cfg.host, port: cfg.port, password: cfg.password, name: cfg.name, bitrate: cfg.bitrate, genre: "Various" }, includeMic, { autoWait });
  };

  const runTest = async () => {
    setTestResult(null);
    setTesting(true);
    startMeter();
    const cfg = cfgObj();
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    try {
      const res = await onTest({ host: cfg.host, port: cfg.port, password: cfg.password });
      setTestResult(res || { ok: false, message: "No response from the test service." });
    } catch {
      setTestResult({ ok: false, message: "Couldn't reach the test service. Check your internet connection." });
    } finally {
      setTesting(false);
    }
  };

  const savePreset = () => {
    const label = (presetName.trim() || host.trim()).slice(0, 40);
    if (!label) return;
    const p = { id: Date.now().toString(36), label, host: host.trim(), port: Number(port), password, name: name.trim(), bitrate: Number(bitrate), includeMic, stationId: stationId.trim(), alertSound };
    setPresets((prev) => {
      const next = [p, ...prev.filter((x) => x.label.toLowerCase() !== label.toLowerCase())].slice(0, 12);
      localStorage.setItem("hotlive95_radioco_presets", JSON.stringify(next));
      return next;
    });
    setPresetName("");
  };
  const loadPreset = (p) => {
    setHost(p.host || "denim.radio.co");
    setPort(p.port || 5189);
    setPassword(p.password || "");
    setName(p.name || "Hot Live 95");
    setBitrate(p.bitrate || 128);
    setIncludeMic(p.includeMic !== false);
    setStationId(p.stationId || "");
    if (typeof p.alertSound === "boolean") setAlertSound(p.alertSound);
    setTestResult(null);
  };
  const deletePreset = (id) => {
    setPresets((prev) => {
      const next = prev.filter((x) => x.id !== id);
      localStorage.setItem("hotlive95_radioco_presets", JSON.stringify(next));
      return next;
    });
  };
  // One-tap: load a saved station and go live immediately.
  const goPreset = (p) => {
    loadPreset(p);
    const cfg = {
      host: p.host,
      port: Number(p.port),
      password: p.password,
      name: p.name,
      bitrate: Number(p.bitrate),
      genre: "Various",
      includeMic: p.includeMic !== false,
      stationId: p.stationId || "",
      alertSound: typeof p.alertSound === "boolean" ? p.alertSound : alertSound,
      autoWait,
      metaFormat,
    };
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    stopMeter();
    onStart({ host: cfg.host, port: cfg.port, password: cfg.password, name: cfg.name, bitrate: cfg.bitrate, genre: "Various" }, cfg.includeMic, { autoWait });
  };

  // Add a show to the persistent lineup. Runs a quick reachability test so a
  // wrong host/port is caught now; a "not in slot" result is expected before
  // the show and still lets the DJ schedule ahead of time.
  const addToLineup = async () => {
    if (!scheduleInput) return;
    const ts = new Date(scheduleInput).getTime();
    if (!ts || ts <= Date.now()) {
      setTestResult({ ok: false, message: "Pick a start time in the future." });
      return;
    }
    const endTs = scheduleEndInput ? new Date(scheduleEndInput).getTime() : null;
    const cfg = cfgObj();
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    setArmTesting(true);
    setTestResult(null);
    let res = null;
    try {
      res = await onTest({ host: cfg.host, port: cfg.port, password: cfg.password });
    } catch {
      res = { ok: false, reachable: false, message: "Couldn't reach the test service. Check your internet connection." };
    }
    setArmTesting(false);
    setTestResult(res);
    // Block only when radio.co is unreachable (bad host/port) or the password
    // is definitively wrong (401). "Not in slot" still lets DJs schedule ahead.
    if (res && (res.reachable === false || res.status === "bad_password")) return;
    const label = (scheduleLabel.trim() || name.trim() || "Show");
    onAddSchedule({ at: ts, endAt: endTs && endTs > ts ? endTs : null, playlistId: schedulePlaylist || null, label: scheduleLabel, config: cfg });
    setScheduleInput("");
    setScheduleEndInput("");
    setScheduleLabel("");
    setSchedulePlaylist("");
    setTestResult({
      ok: true,
      message: `Added "${label}" to your lineup — it goes on air at the set time (keep the studio open on this device).${res && !res.ok ? " radio.co will accept the connection once your slot opens." : ""}`,
    });
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
  const upcoming = [...schedules].filter((s) => !s.done).sort((a, b) => a.at - b.at);
  const fmtWhen = (ts) => new Date(ts).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const spark = (() => {
    if (listenerHist.length < 2) return null;
    const ns = listenerHist.map((p) => p.n);
    const max = Math.max(...ns, 1);
    const min = Math.min(...ns, 0);
    const W = 240;
    const H = 40;
    const span = max - min || 1;
    const pts = listenerHist.map((p, i) => {
      const x = (i / (listenerHist.length - 1)) * W;
      const y = H - ((p.n - min) / span) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { points: pts.join(" "), max, W, H };
  })();

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
            <div className={`space-y-4 ${flash ? "hl-golive-flash" : ""}`} data-testid="go-live-onair">
              {dropAlert && (
                <div
                  className="flex items-center gap-2 rounded-lg border border-[var(--hl-onair)] bg-[rgba(255,23,68,0.15)] px-3 py-2 hl-onair-pulse"
                  data-testid="go-live-drop-alert"
                >
                  <AlertTriangle size={16} className="text-[var(--hl-onair)]" />
                  <span className="text-sm text-[var(--hl-onair)] font-600">Connection trouble — audio may be dropping out</span>
                </div>
              )}
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
              {spark && (
                <div className="rounded-lg border border-[var(--hl-line)] p-2.5" data-testid="go-live-listener-graph">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-[var(--hl-muted)] mb-1">
                    <span>Listeners over show</span>
                    <span className="text-[var(--hl-cue)]">peak {spark.max}</span>
                  </div>
                  <svg viewBox={`0 0 ${spark.W} ${spark.H}`} preserveAspectRatio="none" className="w-full h-10">
                    <polyline points={spark.points} fill="none" stroke="#2ee5c4" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  </svg>
                </div>
              )}
              {nowPlaying && (
                <p className="text-center text-xs text-[var(--hl-muted)]" data-testid="go-live-nowplaying">
                  Now playing: <span className="text-[var(--hl-cue)]">{nowPlaying}</span> <span className="text-[10px]">· sent to radio.co</span>
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

              {presets.length > 0 && (
                <div className="rounded-lg border border-[var(--hl-line)] p-2.5 space-y-2" data-testid="go-live-presets">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">
                    <Bookmark size={13} className="text-[var(--hl-cue)]" /> Saved stations — tap to load
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {presets.map((p) => (
                      <div
                        key={p.id}
                        data-testid={`go-live-preset-${p.id}`}
                        className="flex items-center gap-1 rounded-full bg-black/40 border border-[var(--hl-line)] pl-2.5 pr-1 py-1"
                      >
                        <button
                          data-testid={`go-live-preset-load-${p.id}`}
                          onClick={() => loadPreset(p)}
                          className="text-xs text-[var(--hl-text)] hover:text-[var(--hl-cue)] max-w-[150px] truncate"
                          title="Load this station"
                        >
                          {p.label}
                        </button>
                        <button
                          data-testid={`go-live-preset-golive-${p.id}`}
                          onClick={() => goPreset(p)}
                          disabled={busy || retrying}
                          className="h-6 w-6 grid place-items-center rounded-full text-[var(--hl-onair)] hover:bg-[rgba(255,23,68,0.15)] disabled:opacity-40"
                          title="Load this station and go live now"
                        >
                          <Radio size={13} />
                        </button>
                        <button
                          data-testid={`go-live-preset-delete-${p.id}`}
                          onClick={() => deletePreset(p.id)}
                          className="h-5 w-5 grid place-items-center rounded-full text-[var(--hl-muted)] hover:text-[var(--hl-onair)]"
                          title="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                <label className="block">
                  <span className="text-xs text-[var(--hl-muted)]">How the song shows to listeners</span>
                  <select
                    data-testid="go-live-meta-format"
                    value={metaFormat}
                    onChange={(e) => onMetaFormat && onMetaFormat(e.target.value)}
                    className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-onair)]"
                  >
                    <option value="artist-title">Artist — Title</option>
                    <option value="title-artist">Title — Artist</option>
                    <option value="title-only">Title only</option>
                  </select>
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
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="go-live-alert-sound"
                    checked={alertSound}
                    onChange={(e) => setAlertSound(e.target.checked)}
                    className="h-4 w-4 accent-[var(--hl-amber)]"
                  />
                  <AlertTriangle size={14} className="text-[var(--hl-amber)]" /> Sound an alert if the stream drops out
                </label>
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="go-live-auto-wait"
                    checked={autoWait}
                    onChange={(e) => setAutoWait(e.target.checked)}
                    className="h-4 w-4 accent-[var(--hl-cue)]"
                  />
                  <Timer size={14} className="text-[var(--hl-cue)]" /> Keep trying until my slot opens (go live the moment radio.co accepts)
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
                <div className="rounded-lg border border-[var(--hl-line)] p-3 space-y-2" data-testid="go-live-lineup">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                    <CalendarClock size={14} className="text-[var(--hl-amber)]" /> Show lineup — schedule ahead
                  </div>

                  {upcoming.length > 0 && (
                    <div className="space-y-1.5" data-testid="go-live-lineup-list">
                      {upcoming.map((s) => {
                        const pl = playlists.find((p) => p.id === s.playlistId);
                        return (
                          <div
                            key={s.id}
                            data-testid={`go-live-show-${s.id}`}
                            className="flex items-start justify-between gap-2 rounded-md bg-black/30 px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <div className="text-sm text-[var(--hl-text)] truncate">
                                {s.label || (s.config && s.config.name) || "Live show"}
                              </div>
                              <div className="text-[10px] text-[var(--hl-muted)]">
                                {fmtWhen(s.at)}
                                {s.endAt ? ` – ${new Date(s.endAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                                {pl ? ` · ${pl.name}` : ""}
                              </div>
                            </div>
                            <button
                              data-testid={`go-live-show-remove-${s.id}`}
                              onClick={() => onRemoveSchedule(s.id)}
                              className="shrink-0 h-6 w-6 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-onair)]"
                              title="Remove this show"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <input
                    data-testid="go-live-schedule-label"
                    value={scheduleLabel}
                    onChange={(e) => setScheduleLabel(e.target.value)}
                    placeholder="Show name (e.g. DJ Nova · Drive Time)"
                    className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-amber)]"
                  />
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
                    <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)] w-12 shrink-0">Start</span>
                    <input
                      data-testid="go-live-schedule-input"
                      type="datetime-local"
                      value={scheduleInput}
                      onChange={(e) => setScheduleInput(e.target.value)}
                      className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-amber)]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)] w-12 shrink-0">End</span>
                    <input
                      data-testid="go-live-schedule-end"
                      type="datetime-local"
                      value={scheduleEndInput}
                      onChange={(e) => setScheduleEndInput(e.target.value)}
                      className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-amber)]"
                      title="Auto-stop the broadcast at this time (optional)"
                    />
                  </div>
                  <button
                    data-testid="go-live-add-show"
                    onClick={addToLineup}
                    disabled={!canGo || !scheduleInput || armTesting}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--hl-amber)] text-[var(--hl-amber)] text-xs font-700 hover:bg-[rgba(255,171,0,0.12)] disabled:opacity-40 flex items-center justify-center gap-1.5"
                    title="Tests reachability, then saves this show to the lineup"
                  >
                    {armTesting ? <Loader2 size={13} className="animate-spin" /> : <CalendarClock size={13} />}
                    {armTesting ? "Checking connection…" : "Add show to lineup"}
                  </button>
                  <p className="text-[10px] text-[var(--hl-muted)] leading-relaxed">
                    Shows are saved on this device and survive restarts. Keep the studio open on the broadcasting computer — each show goes on air hands-free at its start time (radio.co accepts the connection once the slot opens).
                  </p>
                </div>
              </div>

              {loginRetry && (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--hl-amber)] bg-[rgba(255,171,0,0.12)] px-3 py-2" data-testid="go-live-login-retry">
                  <div className="flex items-center gap-2 min-w-0">
                    <RotateCw size={15} className="text-[var(--hl-amber)] animate-spin shrink-0" />
                    <span className="text-sm text-[var(--hl-amber)] truncate">
                      {loginRetry.autoWait
                        ? `Waiting for your slot to open — retrying in ${loginRetry.seconds}s (attempt ${loginRetry.attempt})`
                        : `Login not accepted yet — retrying in ${loginRetry.seconds}s (attempt ${loginRetry.attempt} of ${loginRetry.max})`}
                    </span>
                  </div>
                  <button
                    data-testid="go-live-cancel-retry"
                    onClick={onCancelRetry}
                    className="shrink-0 text-xs px-2 py-1 rounded border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:border-[var(--hl-onair)]"
                  >
                    Stop trying
                  </button>
                </div>
              )}

              {testResult && (
                <div
                  data-testid="go-live-test-result"
                  className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2 ${
                    testResult.ok
                      ? "border-[#2ee5c4] text-[#2ee5c4] bg-[rgba(46,229,196,0.1)]"
                      : testResult.status === "not_in_slot"
                      ? "border-[var(--hl-amber)] text-[var(--hl-amber)] bg-[rgba(255,171,0,0.1)]"
                      : "border-[var(--hl-onair)] text-[var(--hl-onair)] bg-[rgba(255,23,68,0.1)]"
                  }`}
                >
                  {testResult.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
                  ) : testResult.status === "not_in_slot" ? (
                    <Info size={15} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  )}
                  <span>{testResult.message}</span>
                </div>
              )}

              {state === "error" && error && (
                <div className="flex items-start gap-2 text-sm text-[var(--hl-onair)]" data-testid="go-live-error">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              {((state === "error" && error) || (testResult && !testResult.ok && testResult.status !== "not_in_slot")) && (
                <div className="rounded-lg border border-[var(--hl-line)] bg-black/30 p-3 space-y-1.5" data-testid="go-live-checklist">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                    <ListChecks size={14} className="text-[var(--hl-cue)]" /> Before radio.co will accept you
                  </div>
                  <ul className="text-xs text-[var(--hl-muted)] space-y-1 leading-relaxed list-disc pl-4">
                    <li>Turn on <b className="text-[var(--hl-text)]">Live Anytime</b> in your radio.co dashboard, or be inside a scheduled live slot.</li>
                    <li>Make sure your station is <b className="text-[var(--hl-text)]">powered on</b> in the dashboard.</li>
                    <li>Use the <b className="text-[var(--hl-text)]">source port</b> from your dashboard — SHOUTcast v1 is usually the base port <b className="text-[var(--hl-text)]">+ 1</b>.</li>
                    <li>Use your <b className="text-[var(--hl-text)]">Live / DJ broadcast password</b>, not your account login password.</li>
                  </ul>
                </div>
              )}

              {meterOn && (
                <div data-testid="go-live-meter">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--hl-muted)] mb-1">
                    <Gauge size={13} className="text-[var(--hl-cue)]" /> Input level {includeMic ? "(music + mic)" : "(music)"} — play a track or speak to check
                  </div>
                  <div className="h-3 w-full rounded-full bg-[#2a2a31] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-75"
                      style={{ width: `${Math.min(100, Math.round(meterLevel * 140))}%`, background: "linear-gradient(90deg,#2ee5c4,#ffab00)" }}
                    />
                  </div>
                  {meterLevel < 0.01 && <div className="text-[10px] text-[var(--hl-amber)] mt-1">No signal yet — start a track or talk into the mic.</div>}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  data-testid="go-live-preset-name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Name this station to save it…"
                  className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-cue)]"
                />
                <button
                  data-testid="go-live-save-preset"
                  onClick={savePreset}
                  disabled={!canGo}
                  className="shrink-0 px-3 py-2 rounded-lg border border-[var(--hl-cue)] text-[var(--hl-cue)] text-xs font-700 hover:bg-[rgba(46,229,196,0.1)] disabled:opacity-40 flex items-center gap-1.5"
                  title="Save these settings as a station preset"
                >
                  <Save size={14} /> Save
                </button>
              </div>

              <div className="flex gap-2">
                <button
                  data-testid="go-live-test"
                  onClick={runTest}
                  disabled={!canGo || testing || busy || retrying}
                  className="flex-1 h-11 rounded-lg border border-[var(--hl-cue)] text-[var(--hl-cue)] font-700 flex items-center justify-center gap-2 hover:bg-[rgba(46,229,196,0.1)] disabled:opacity-50"
                  title="Check your radio.co login without going on air"
                >
                  {testing ? <Loader2 size={16} className="animate-spin" /> : <Plug size={16} />}
                  {testing ? "Testing…" : "Test connection"}
                </button>
              </div>

              <button
                data-testid="go-live-start"
                onClick={go}
                disabled={!canGo || busy || retrying}
                className="w-full h-12 rounded-lg bg-[var(--hl-onair)] text-white font-700 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {busy || retrying ? <Loader2 size={18} className="animate-spin" /> : <Radio size={18} />}
                {retrying
                  ? loginRetry.autoWait
                    ? `Waiting for your slot… (try ${loginRetry.attempt})`
                    : `Retrying login… (${loginRetry.attempt}/${loginRetry.max})`
                  : busy
                  ? "Connecting to radio.co…"
                  : "Go live now"}
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
                          data-testid={`go-live-archive-add-${b.id}`}
                          onClick={() => onArchiveToPlaylist(b)}
                          className="h-7 w-7 grid place-items-center rounded shrink-0 text-[var(--hl-muted)] hover:text-[var(--hl-cue)]"
                          title="Add to the current playlist to re-air"
                        >
                          <ListPlus size={14} />
                        </button>
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
