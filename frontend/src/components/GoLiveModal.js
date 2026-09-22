import React, { useEffect, useRef, useState } from "react";
import { X, Podcast, Radio, Loader2, Square, AlertTriangle, Mic, Info } from "lucide-react";

const CFG_KEY = "hotlive95_radioco";
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
export default function GoLiveModal({ state, error, nowPlaying, getLevel, onStart, onStop, onClose }) {
  const saved = loadCfg();
  const [host, setHost] = useState(saved.host || "denim.radio.co");
  const [port, setPort] = useState(saved.port || 5189);
  const [password, setPassword] = useState(saved.password || "");
  const [name, setName] = useState(saved.name || "Hot Live 95");
  const [bitrate, setBitrate] = useState(saved.bitrate || 128);
  const [includeMic, setIncludeMic] = useState(saved.includeMic !== false);
  const [level, setLevel] = useState(0);
  const raf = useRef(0);

  const live = state === "live";
  const busy = state === "connecting";

  useEffect(() => {
    if (!live) {
      setLevel(0);
      return;
    }
    const tick = () => {
      setLevel(getLevel());
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [live, getLevel]);

  const go = () => {
    const cfg = { host: host.trim(), port: Number(port), password, name: name.trim(), bitrate: Number(bitrate), genre: "Various", includeMic };
    localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    onStart({ host: cfg.host, port: cfg.port, password: cfg.password, name: cfg.name, bitrate: cfg.bitrate, genre: "Various" }, includeMic);
  };

  const canGo = host.trim() && Number(port) > 0 && password.trim();
  const pct = Math.min(100, Math.round(level * 140));

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
          {live ? (
            <div className="space-y-4" data-testid="go-live-onair">
              <div className="flex items-center gap-2 justify-center">
                <span className="h-3 w-3 rounded-full bg-[var(--hl-onair)] hl-onair-pulse" />
                <span className="font-display text-2xl tracking-wide text-[var(--hl-onair)]">ON AIR</span>
              </div>
              <p className="text-center text-sm text-[var(--hl-muted)]">
                Broadcasting to <span className="text-[var(--hl-text)]">{host}</span>
              </p>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
