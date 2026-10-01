import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Radio,
  X,
  Plus,
  Trash2,
  Pencil,
  Check,
  Wifi,
  WifiOff,
  Loader2,
  Copy,
  QrCode,
  Image as ImageIcon,
  Mic,
  MicOff,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Zap,
  Square,
  Upload,
  Download,
} from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import VuMeter from "@/components/VuMeter";
import { blankStation, stationPublic, downscaleLogo } from "@/lib/stations";
import { api } from "@/lib/api";

const BACKEND = process.env.REACT_APP_BACKEND_URL || "";
const appOrigin = typeof window !== "undefined" ? window.location.origin : "";

const STATE_META = {
  live: { label: "LIVE", dot: "bg-[#2ee5c4] animate-pulse", text: "text-[#2ee5c4]" },
  connecting: { label: "Connecting…", dot: "bg-[var(--hl-amber)] animate-pulse", text: "text-[var(--hl-amber)]" },
  reconnecting: { label: "Reconnecting…", dot: "bg-[var(--hl-amber)] animate-pulse", text: "text-[var(--hl-amber)]" },
  error: { label: "Error", dot: "bg-[var(--hl-onair)]", text: "text-[var(--hl-onair)]" },
  idle: { label: "Offline", dot: "bg-[var(--hl-muted)]", text: "text-[var(--hl-muted)]" },
};

function liveLink(s, theme) {
  const params = new URLSearchParams();
  params.set("station", s.id);
  if (s.streamUrl) params.set("stream", s.streamUrl);
  if (s.statusUrl) params.set("status", s.statusUrl);
  if (theme && theme !== "full") params.set("theme", theme);
  return `${appOrigin}/live?${params.toString()}`;
}

function StationCard({ station, bc, onChange, onDelete, onAir, onStop, onTest, getHealth }) {
  const [edit, setEdit] = useState(!station.host && !station.streamUrl);
  const [showQr, setShowQr] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
  const [shareTheme, setShareTheme] = useState("full");
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [copied, setCopied] = useState("");
  const [health, setHealth] = useState(null);
  const [listeners, setListeners] = useState(null);
  const listenerLogRef = useRef([]);
  const peakRef = useRef(0);
  const [peak, setPeak] = useState(0);
  const [peakFlash, setPeakFlash] = useState(false);
  const peakFlashTimer = useRef(null);
  const fileRef = useRef(null);
  const [azuraUrl, setAzuraUrl] = useState("");
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState(null);

  const state = bc?.state || "idle";
  const meta = STATE_META[state] || STATE_META.idle;
  const isLive = state === "live";
  const busy = state === "connecting" || state === "reconnecting";

  // Live health (kbps) while broadcasting to this station.
  useEffect(() => {
    if (!isLive) {
      setHealth(null);
      return;
    }
    const id = setInterval(() => setHealth(getHealth(station.id)), 1000);
    return () => clearInterval(id);
  }, [isLive, station.id, getHealth]);

  // Public listener count from AzuraCast/Icecast status.
  useEffect(() => {
    if (!BACKEND || (!station.statusUrl && !station.streamUrl)) return;
    let alive = true;
    const poll = async () => {
      try {
        const url = station.statusUrl
          ? `${BACKEND}/api/broadcast/azuracast-status?url=${encodeURIComponent(station.statusUrl)}`
          : `${BACKEND}/api/broadcast/icecast-status?stream=${encodeURIComponent(station.streamUrl)}`;
        const r = await fetch(url);
        const d = await r.json();
        if (alive && d && d.ok && typeof d.listeners === "number") {
          setListeners(d.listeners);
          // Listener peak alert: gently flash when this show sets a new high.
          if (d.listeners > peakRef.current && d.listeners > 0) {
            if (peakRef.current > 0) {
              setPeakFlash(true);
              if (peakFlashTimer.current) clearTimeout(peakFlashTimer.current);
              peakFlashTimer.current = setTimeout(() => setPeakFlash(false), 5000);
            }
            peakRef.current = d.listeners;
            setPeak(d.listeners);
          }
          // Record a listener sample for the per-show CSV export.
          listenerLogRef.current.push({
            t: new Date().toISOString(),
            listeners: d.listeners,
            nowPlaying: d.nowPlaying || "",
          });
          if (listenerLogRef.current.length > 5000) listenerLogRef.current.shift();
        }
      } catch {
        /* ignore */
      }
    };
    poll();
    const id = setInterval(poll, 20000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [station.statusUrl, station.streamUrl]);

  const set = (patch) => onChange({ ...station, ...patch });

  // One-paste AzuraCast setup: resolve host / listen URL / now-playing / name.
  const autoFillAzura = async () => {
    const url = azuraUrl.trim();
    if (!url) {
      setResolveMsg({ ok: false, message: "Paste your AzuraCast URL first." });
      return;
    }
    setResolving(true);
    setResolveMsg(null);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10000);
    try {
      const r = await fetch(`${BACKEND}/api/broadcast/azuracast-resolve?url=${encodeURIComponent(url)}`, { signal: ctl.signal });
      const d = await r.json();
      if (!d.ok) {
        setResolveMsg({ ok: false, message: d.message || "Couldn't read that AzuraCast URL." });
      } else {
        const listen = d.listenUrl || "";
        let mount = d.mount || station.mount || "/radio.mp3";
        if (!d.mount) {
          try {
            const pu = new URL(listen);
            const last = (pu.pathname || "").split("/").filter(Boolean).pop();
            if (last && last.includes(".")) mount = "/" + last;
          } catch {
            /* keep default */
          }
        }
        set({
          name: !station.name || station.name === "Hot Live 95" ? d.name || station.name : station.name,
          host: d.host || station.host,
          streamUrl: listen || station.streamUrl,
          statusUrl: d.nowPlayingUrl || station.statusUrl,
          mount,
          bitrate: d.bitrate || station.bitrate,
          port: station.port || 8005,
          username: station.username || "source",
        });
        setResolveMsg({
          ok: true,
          message: `Filled from “${d.name || d.shortcode}”. Now add your DJ username, password & confirm the source port below.`,
        });
      }
    } catch {
      setResolveMsg({ ok: false, message: "Couldn't reach the server (timed out). Check the URL and that the station is public." });
    } finally {
      clearTimeout(timer);
      setResolving(false);
    }
  };

  const copyText = (text, tag) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(tag);
      setTimeout(() => setCopied(""), 1500);
    });
  };

  // Download this station's live listener graph for the current show as CSV.
  const exportListenersCsv = () => {
    const log = listenerLogRef.current;
    if (!log.length) return;
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [["timestamp", "listeners", "now_playing"]].concat(
      log.map((s) => [s.t, s.listeners, s.nowPlaying])
    );
    const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `${(station.name || "station").replace(/[^\w-]+/g, "_")}_listeners_${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const pickLogo = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const dataUrl = await downscaleLogo(f, 256);
      set({ logo: dataUrl });
    } catch {
      /* ignore */
    }
    e.target.value = "";
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await onTest(station);
      setTestResult(res);
    } catch {
      setTestResult({ ok: false, message: "Test failed — check your connection." });
    }
    setTesting(false);
  };

  const link = liveLink(station, shareTheme);
  const embedH = shareTheme === "compact" ? 120 : 640;
  const embedW = shareTheme === "compact" ? 640 : 360;
  const embedCode = `<iframe src="${link}" width="${embedW}" height="${embedH}" style="border:0;border-radius:16px;overflow:hidden" allow="autoplay" title="${(station.name || "Radio").replace(/"/g, "'")}"></iframe>`;

  return (
    <div
      className="rounded-xl border border-[var(--hl-line)] bg-black/30 overflow-hidden"
      data-testid={`station-card-${station.id}`}
      style={{ borderLeft: `4px solid ${station.color || "#ff5a1f"}` }}
    >
      {/* Card head */}
      <div className="flex items-center gap-3 p-3">
        <div
          className="h-11 w-11 shrink-0 grid place-items-center rounded-lg overflow-hidden bg-black/50 border border-[var(--hl-line)]"
          style={{ boxShadow: `0 0 18px ${station.color || "#ff5a1f"}33` }}
        >
          {station.logo ? (
            <img src={station.logo} alt="" className="h-full w-full object-cover" data-testid={`station-logo-img-${station.id}`} />
          ) : (
            <Radio size={20} style={{ color: station.color || "#ff5a1f" }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-600 text-sm" data-testid={`station-name-label-${station.id}`}>
              {station.name || "Untitled station"}
            </span>
            <span className={`inline-flex items-center gap-1 text-[10px] ${meta.text}`} data-testid={`station-status-${station.id}`}>
              <span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {meta.label}
            </span>
          </div>
          <div className="truncate text-[11px] text-[var(--hl-muted)]">
            {station.tagline || (station.host ? `${station.host}:${station.port}${station.mount || ""}` : "No connection set")}
            {listeners != null && (
              <span className="ml-2 inline-flex items-center gap-1 text-[var(--hl-cue)]">
                <Users size={11} /> {listeners}
              </span>
            )}
            {peakFlash && (
              <span
                className="ml-2 inline-flex items-center gap-1 rounded-full bg-[var(--hl-fire)]/20 text-[var(--hl-fire)] px-2 py-0.5 text-[10px] font-700 animate-pulse"
                data-testid={`listener-peak-alert-${station.id}`}
              >
                <TrendingUp size={11} /> New peak: {peak}
              </span>
            )}
            {health && isLive && <span className="ml-2 text-[#2ee5c4]">{health.kbps} kbps</span>}
          </div>
        </div>
        {isLive || busy ? (
          <button
            data-testid={`station-stop-${station.id}`}
            onClick={() => onStop(station.id)}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[var(--hl-onair)] text-white px-3.5 py-1.5 text-xs font-600 hover:opacity-90"
          >
            <Square size={13} /> Stop
          </button>
        ) : (
          <button
            data-testid={`station-golive-${station.id}`}
            onClick={() => onAir(station)}
            disabled={!station.host || !station.password}
            title={!station.host || !station.password ? "Fill in the connection first" : "Go live to this station"}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full hl-fire-gradient text-white px-3.5 py-1.5 text-xs font-600 hover:scale-105 transition disabled:opacity-40 disabled:hover:scale-100"
          >
            <Zap size={13} /> Go Live
          </button>
        )}
        <button
          data-testid={`station-edit-${station.id}`}
          onClick={() => setEdit((v) => !v)}
          className="shrink-0 h-8 w-8 grid place-items-center rounded-lg border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"
          title="Edit station"
        >
          {edit ? <ChevronUp size={16} /> : <Pencil size={15} />}
        </button>
      </div>

      {bc?.error && (
        <div className="mx-3 mb-2 text-[11px] text-[var(--hl-onair)] bg-black/40 border border-[var(--hl-line)] rounded-lg px-2.5 py-1.5" data-testid={`station-error-${station.id}`}>
          {bc.error}
        </div>
      )}

      {edit && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--hl-line)] pt-3">
          {/* Branding */}
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Branding</label>
            <input
              data-testid={`station-name-${station.id}`}
              value={station.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Station name"
              className="hl-input col-span-2"
            />
            <input
              data-testid={`station-tagline-${station.id}`}
              value={station.tagline}
              onChange={(e) => set({ tagline: e.target.value })}
              placeholder="Tagline (e.g. Detroit · A.I. Radio)"
              className="hl-input col-span-2"
            />
            <div className="flex items-center gap-2">
              <input
                data-testid={`station-color-${station.id}`}
                type="color"
                value={station.color || "#ff5a1f"}
                onChange={(e) => set({ color: e.target.value })}
                className="h-9 w-12 rounded bg-transparent border border-[var(--hl-line)] cursor-pointer"
                title="Accent color"
              />
              <span className="text-[11px] text-[var(--hl-muted)]">Accent</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                data-testid={`station-logo-${station.id}`}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hl-line)] px-2.5 py-1.5 text-[11px] text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"
              >
                <ImageIcon size={13} /> {station.logo ? "Change logo" : "Upload logo"}
              </button>
              {station.logo && (
                <button
                  data-testid={`station-logo-clear-${station.id}`}
                  onClick={() => set({ logo: null })}
                  className="text-[11px] text-[var(--hl-onair)] hover:underline"
                >
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickLogo} />
            </div>
          </div>

          {/* AzuraCast one-paste setup */}
          <div className="rounded-lg border border-[var(--hl-fire)]/40 bg-[var(--hl-fire)]/5 p-2.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--hl-fire)] mb-1.5">
              <Zap size={12} /> AzuraCast quick setup
            </div>
            <div className="flex items-center gap-2">
              <input
                data-testid={`station-azura-url-${station.id}`}
                value={azuraUrl}
                onChange={(e) => setAzuraUrl(e.target.value)}
                placeholder="Paste your AzuraCast URL (public page or now-playing)"
                className="hl-input flex-1"
              />
              <button
                data-testid={`station-azura-fill-${station.id}`}
                onClick={autoFillAzura}
                disabled={resolving}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-lg hl-fire-gradient px-3 py-2 text-xs font-600 text-white disabled:opacity-60"
              >
                {resolving ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                {resolving ? "Reading…" : "Auto-fill"}
              </button>
            </div>
            {resolveMsg && (
              <div
                data-testid={`station-azura-msg-${station.id}`}
                className={`mt-1.5 text-[11px] ${resolveMsg.ok ? "text-[#2ee5c4]" : "text-[var(--hl-onair)]"}`}
              >
                {resolveMsg.message}
              </div>
            )}
            <div className="mt-1 text-[10px] text-[var(--hl-muted)]">
              Fills host, stream URL, now-playing & name. Your DJ username/password come from AzuraCast → Station → Streamers/DJs.
            </div>
          </div>

          {/* Connection */}
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Live source (AzuraCast / Icecast)</label>
            <input
              data-testid={`station-host-${station.id}`}
              value={station.host}
              onChange={(e) => set({ host: e.target.value })}
              placeholder="Host (e.g. radio.hotlive95dj.com)"
              className="hl-input col-span-2"
            />
            <input
              data-testid={`station-port-${station.id}`}
              type="number"
              value={station.port}
              onChange={(e) => set({ port: e.target.value })}
              placeholder="Source port (e.g. 8005)"
              className="hl-input"
            />
            <select
              data-testid={`station-bitrate-${station.id}`}
              value={station.bitrate}
              onChange={(e) => set({ bitrate: Number(e.target.value) })}
              className="hl-input"
            >
              {[96, 128, 192, 256, 320].map((b) => (
                <option key={b} value={b}>
                  {b} kbps
                </option>
              ))}
            </select>
            <input
              data-testid={`station-username-${station.id}`}
              value={station.username}
              onChange={(e) => set({ username: e.target.value })}
              placeholder="Username (source)"
              className="hl-input"
            />
            <input
              data-testid={`station-mount-${station.id}`}
              value={station.mount}
              onChange={(e) => set({ mount: e.target.value })}
              placeholder="Mount (/radio.mp3 or /)"
              className="hl-input"
            />
            <input
              data-testid={`station-password-${station.id}`}
              type="password"
              value={station.password}
              onChange={(e) => set({ password: e.target.value })}
              placeholder="Broadcast / DJ password"
              className="hl-input col-span-2"
            />
            <label className="col-span-2 flex items-center gap-2 text-[11px] text-[var(--hl-muted)]">
              <input
                data-testid={`station-mic-${station.id}`}
                type="checkbox"
                checked={station.includeMic !== false}
                onChange={(e) => set({ includeMic: e.target.checked })}
              />
              {station.includeMic !== false ? <Mic size={12} /> : <MicOff size={12} />} Include my mic in this station's broadcast
            </label>
          </div>

          {/* Public player */}
          <div className="grid grid-cols-2 gap-2">
            <label className="col-span-2 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Public player</label>
            <input
              data-testid={`station-stream-${station.id}`}
              value={station.streamUrl}
              onChange={(e) => set({ streamUrl: e.target.value })}
              placeholder="Public stream URL (listeners hear this)"
              className="hl-input col-span-2"
            />
            <input
              data-testid={`station-status-url-${station.id}`}
              value={station.statusUrl}
              onChange={(e) => set({ statusUrl: e.target.value })}
              placeholder="AzuraCast now-playing URL (optional — listener count)"
              className="hl-input col-span-2"
            />
          </div>

          {/* Test + delete */}
          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              data-testid={`station-test-${station.id}`}
              onClick={runTest}
              disabled={testing || !station.host || !station.password}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hl-line)] px-3 py-1.5 text-xs text-[var(--hl-text)] hover:border-[var(--hl-cue)] disabled:opacity-40"
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />} Test connection
            </button>
            <button
              data-testid={`station-delete-${station.id}`}
              onClick={() => onDelete(station.id)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hl-line)] px-3 py-1.5 text-xs text-[var(--hl-onair)] hover:bg-[var(--hl-onair)]/10"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
          {testResult && (
            <div
              className={`text-[11px] rounded-lg px-2.5 py-2 border ${
                testResult.ok ? "text-[#2ee5c4] border-[#2ee5c4]/40 bg-[#2ee5c4]/5" : "text-[var(--hl-amber)] border-[var(--hl-line)] bg-black/40"
              }`}
              data-testid={`station-test-result-${station.id}`}
            >
              {testResult.ok ? <Check size={12} className="inline mr-1" /> : <WifiOff size={12} className="inline mr-1" />}
              {testResult.message}
            </div>
          )}
        </div>
      )}

      {/* Share row (always visible) */}
      <div className="px-3 pb-3 flex flex-wrap items-center gap-2 border-t border-[var(--hl-line)] pt-2.5">
        <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Listen link</span>
        <button
          data-testid={`station-copy-link-${station.id}`}
          onClick={() => copyText(link, "link")}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--hl-cue)] hover:underline"
        >
          <Copy size={11} /> {copied === "link" ? "Copied!" : "Copy /live link"}
        </button>
        <button
          data-testid={`station-qr-${station.id}`}
          onClick={() => setShowQr((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"
        >
          <QrCode size={12} /> QR
        </button>
        <button
          data-testid={`station-embed-${station.id}`}
          onClick={() => setShowEmbed((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"
        >
          &lt;/&gt; Embed
        </button>
        <button
          data-testid={`station-export-listeners-${station.id}`}
          onClick={exportListenersCsv}
          disabled={!listenerLogRef.current.length}
          title={listenerLogRef.current.length ? "Download this station's listener graph as CSV" : "No listener data recorded yet"}
          className="inline-flex items-center gap-1 text-[11px] text-[var(--hl-muted)] hover:text-[var(--hl-fire)] disabled:opacity-40"
        >
          <Download size={12} /> Listener CSV
        </button>
        {/* Player skin for the shared link / embed */}
        <div className="inline-flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-[var(--hl-muted)]">Skin</span>
          <div className="inline-flex rounded-full border border-[var(--hl-line)] p-0.5">
            <button
              data-testid={`station-skin-full-${station.id}`}
              onClick={() => setShareTheme("full")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-600 ${shareTheme === "full" ? "hl-fire-gradient text-white" : "text-[var(--hl-muted)]"}`}
            >
              Card
            </button>
            <button
              data-testid={`station-skin-compact-${station.id}`}
              onClick={() => setShareTheme("compact")}
              className={`px-2 py-0.5 rounded-full text-[10px] font-600 ${shareTheme === "compact" ? "hl-fire-gradient text-white" : "text-[var(--hl-muted)]"}`}
            >
              Bar
            </button>
          </div>
        </div>
        {showQr && (
          <div className="w-full mt-2 flex justify-center bg-white rounded-lg p-3" data-testid={`station-qr-canvas-${station.id}`}>
            <QRCodeCanvas value={link} size={140} includeMargin={false} level="M" />
          </div>
        )}
        {showEmbed && (
          <div className="w-full mt-2">
            <textarea
              readOnly
              value={embedCode}
              onFocus={(e) => e.target.select()}
              className="hl-input w-full text-[10px] font-mono h-16"
              data-testid={`station-embed-code-${station.id}`}
            />
            <button
              data-testid={`station-copy-embed-${station.id}`}
              onClick={() => copyText(embedCode, "embed")}
              className="mt-1 text-[11px] text-[var(--hl-cue)] hover:underline"
            >
              <Copy size={11} className="inline" /> {copied === "embed" ? "Copied!" : "Copy embed code"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StationsModal({
  stations,
  setStations,
  bcStations,
  onAir,
  onAirAll,
  onStop,
  onStopAll,
  onTest,
  getLevel,
  getProgramLevels,
  loudnessLufs,
  onLoudnessChange,
  getHealth,
  metaFormat,
  onMetaFormat,
  broadcasts = [],
  onDownloadBroadcast,
  onDeleteBroadcast,
  onArchiveToPlaylist,
  onOpenMultiChannel,
  onClose,
}) {
  const fileImportRef = useRef(null);

  const liveCount = useMemo(
    () => Object.values(bcStations || {}).filter((s) => s && (s.state === "live" || s.state === "connecting" || s.state === "reconnecting")).length,
    [bcStations]
  );

  // Persist a station's public branding to the backend so /live players see it.
  const publishPublic = (s) => {
    api.saveStation(stationPublic(s)).catch(() => {});
  };

  // On open, mirror every existing station's public config to the backend once so
  // /live?station=<id> resolves branding even before the DJ edits it.
  useEffect(() => {
    stations.forEach((s) => api.saveStation(stationPublic(s)).catch(() => {}));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateStation = (next) => {
    setStations((prev) => prev.map((s) => (s.id === next.id ? next : s)));
    publishPublic(next);
  };

  const addStation = () => {
    const s = blankStation({ name: `Station ${stations.length + 1}` });
    setStations((prev) => [...prev, s]);
    publishPublic(s);
  };

  const deleteStation = (id) => {
    const s = stations.find((x) => x.id === id);
    if (!window.confirm(`Delete "${s?.name || "this station"}"? This can't be undone.`)) return;
    onStop(id);
    setStations((prev) => prev.filter((x) => x.id !== id));
    api.deleteStation(id).catch(() => {});
  };

  const exportStations = () => {
    const blob = new Blob([JSON.stringify(stations, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hotlive95-stations.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const importStations = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const arr = JSON.parse(reader.result);
        if (Array.isArray(arr)) {
          setStations((prev) => {
            const byId = new Map(prev.map((s) => [s.id, s]));
            arr.forEach((s) => {
              if (s && s.id) byId.set(s.id, { ...blankStation(), ...s });
            });
            const merged = Array.from(byId.values());
            merged.forEach((s) => api.saveStation(stationPublic(s)).catch(() => {}));
            return merged;
          });
        }
      } catch {
        /* ignore */
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  const readyStations = stations.filter((s) => s.host && s.password);
  const anyLive = liveCount > 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-3" data-testid="stations-modal">
      <div className="w-full max-w-2xl max-h-[92vh] overflow-y-auto hl-panel rounded-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--hl-line)] bg-[var(--hl-panel)]">
          <div className="flex items-center gap-2.5">
            <Radio size={20} className="text-[var(--hl-fire)]" />
            <div>
              <h2 className="font-display text-lg leading-none tracking-wide">Broadcast Center</h2>
              <p className="text-[11px] text-[var(--hl-muted)] mt-0.5">Simulcast your show to multiple stations at once</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onOpenMultiChannel && (
              <button
                data-testid="open-multichannel"
                onClick={onOpenMultiChannel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--hl-fire)]/50 text-[var(--hl-fire)] px-3 h-9 text-xs font-600 hover:bg-[var(--hl-fire)]/10"
                title="Air a different live program on each channel at the same time"
              >
                <Radio size={14} /> Multi-Channel
              </button>
            )}
            <button data-testid="stations-close" onClick={onClose} className="h-9 w-9 grid place-items-center rounded-lg border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Global controls */}
          <div className="rounded-xl border border-[var(--hl-line)] bg-black/30 p-3 space-y-3" data-testid="broadcast-global-bar">
            {!(typeof window !== "undefined" && window.hotlive && window.hotlive.isElectron) && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--hl-cue)]/40 bg-[var(--hl-cue)]/5 px-3 py-2 text-[11px] text-[var(--hl-muted)]" data-testid="uninterrupted-air-note">
                <Radio size={13} className="mt-0.5 shrink-0 text-[var(--hl-cue)]" />
                <span>
                  <span className="text-[var(--hl-text)] font-600">For 24/7 non-stop air:</span> run the{" "}
                  <span className="text-[var(--hl-text)]">desktop app</span> (from your flash drive). In a phone/tablet
                  browser, the system can pause a live broadcast when the screen locks or you switch apps — the desktop
                  build keeps streaming no matter what until you stop it.
                  {process.env.REACT_APP_DESKTOP_URL && (
                    <>
                      {" "}
                      <a
                        href={process.env.REACT_APP_DESKTOP_URL}
                        target="_blank"
                        rel="noreferrer"
                        data-testid="air-note-desktop-link"
                        className="text-[var(--hl-cue)] underline hover:text-[var(--hl-fire)]"
                      >
                        Download the desktop app →
                      </a>
                    </>
                  )}
                </span>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button
                data-testid="broadcast-golive-all"
                onClick={() => onAirAll(readyStations)}
                disabled={!readyStations.length}
                className="inline-flex items-center gap-2 rounded-full hl-fire-gradient text-white px-4 py-2 text-sm font-600 hover:scale-105 transition disabled:opacity-40 disabled:hover:scale-100"
              >
                <Zap size={15} /> Go live to all ({readyStations.length})
              </button>
              <kbd className="hidden sm:inline-flex items-center rounded-md border border-[var(--hl-line)] bg-black/40 px-2 py-1 text-[10px] font-mono text-[var(--hl-muted)]" data-testid="broadcast-hotkey-hint">
                Ctrl+Shift+L
              </kbd>
              <button
                data-testid="broadcast-stop-all"
                onClick={onStopAll}
                disabled={!anyLive}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--hl-onair)] text-[var(--hl-onair)] px-4 py-2 text-sm font-600 hover:bg-[var(--hl-onair)]/10 disabled:opacity-40"
              >
                <Square size={14} /> Stop all
              </button>
              <div className="ml-auto flex items-center gap-3 text-xs text-[var(--hl-muted)]">
                <div className="flex items-center gap-1.5" data-testid="loudness-control">
                  <span>Loudness</span>
                  <select
                    data-testid="loudness-target"
                    value={loudnessLufs == null ? "off" : String(loudnessLufs)}
                    onChange={(e) => onLoudnessChange(e.target.value === "off" ? null : Number(e.target.value))}
                    className="hl-input py-1 text-xs"
                    title="Even out every song to a consistent on-air level"
                  >
                    <option value="off">Off</option>
                    <option value="-14">-14 LUFS</option>
                    <option value="-16">-16 LUFS</option>
                    <option value="-18">-18 LUFS</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <span>Metadata</span>
                  <select
                    data-testid="broadcast-meta-format"
                    value={metaFormat}
                    onChange={(e) => onMetaFormat(e.target.value)}
                    className="hl-input py-1 text-xs"
                  >
                  <option value="artist-title">Artist — Title</option>
                  <option value="title-artist">Title — Artist</option>
                  <option value="title-only">Title only</option>
                </select>
              </div>
            </div>
            </div>
            {/* On-air stereo VU meter (actual broadcast output) */}
            <div className="flex items-center gap-3" data-testid="broadcast-level">
              <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)] w-16">On-air</span>
              <div className="flex-1">
                <VuMeter getLevels={getProgramLevels} />
              </div>
              <span className="text-[10px] text-[var(--hl-muted)] w-10 text-right">{anyLive ? `${liveCount} on` : "idle"}</span>
            </div>
          </div>

          {/* Station list */}
          <div className="space-y-3" data-testid="stations-list">
            {stations.map((s) => (
              <StationCard
                key={s.id}
                station={s}
                bc={bcStations?.[s.id]}
                onChange={updateStation}
                onDelete={deleteStation}
                onAir={onAir}
                onStop={onStop}
                onTest={onTest}
                getHealth={getHealth}
              />
            ))}
            {!stations.length && <div className="text-center text-sm text-[var(--hl-muted)] py-6">No stations yet — add your first one.</div>}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              data-testid="station-add"
              onClick={addStation}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[var(--hl-line)] px-4 py-2.5 text-sm text-[var(--hl-text)] hover:border-[var(--hl-fire)] hover:text-[var(--hl-fire)]"
            >
              <Plus size={16} /> Add station
            </button>
            <button data-testid="stations-export" onClick={exportStations} className="inline-flex items-center gap-1.5 text-xs text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">
              <Download size={13} /> Export
            </button>
            <button data-testid="stations-import" onClick={() => fileImportRef.current?.click()} className="inline-flex items-center gap-1.5 text-xs text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">
              <Upload size={13} /> Import
            </button>
            <input ref={fileImportRef} type="file" accept="application/json,.json" className="hidden" onChange={importStations} />
          </div>

          {/* Broadcast archive */}
          {broadcasts.length > 0 && (
            <div className="rounded-xl border border-[var(--hl-line)] bg-black/30 p-3" data-testid="broadcast-archive">
              <div className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)] mb-2">Broadcast archive</div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {broadcasts.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 text-xs" data-testid={`broadcast-archive-${b.id}`}>
                    <Radio size={12} className="text-[var(--hl-cue)] shrink-0" />
                    <span className="truncate flex-1">{b.name}</span>
                    <button onClick={() => onArchiveToPlaylist(b)} className="text-[var(--hl-cue)] hover:underline">Re-air</button>
                    <button onClick={() => onDownloadBroadcast(b)} className="text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">Save</button>
                    <button onClick={() => onDeleteBroadcast(b)} className="text-[var(--hl-onair)] hover:underline">Delete</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
