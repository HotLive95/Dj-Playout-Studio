import React, { useState } from "react";
import { Search, ShieldCheck, ShieldAlert, ShieldX, MonitorSmartphone, Clock, Radio } from "lucide-react";
import { api } from "../lib/api";
import { platform } from "../lib/platform";

const fmt = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return String(iso).slice(0, 10);
  }
};

// Reusable DJ self-serve license lookup. Used inside the app (modal) and on the
// public /license page. `embedded` renders standalone chrome (logo header).
export function LicenseStatus({ defaultKey = "", embedded = false }) {
  const [key, setKey] = useState(defaultKey);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const lookup = async () => {
    const k = key.trim();
    if (!k) return;
    setLoading(true);
    setErr("");
    setRes(null);
    try {
      const dev = await platform.getDeviceId().catch(() => null);
      const r = await api.status(k, dev);
      if (r.status === "unknown") {
        setErr("We couldn't find that key. Double-check it and try again.");
      } else {
        setRes(r);
      }
    } catch {
      setErr("Couldn't reach the licensing server. Try again in a moment.");
    }
    setLoading(false);
  };

  const tone =
    res?.status === "ok" ? "var(--hl-teal, #22c55e)" : res?.status ? "var(--hl-onair)" : "var(--hl-muted)";
  const StatusIcon = res?.revoked ? ShieldX : res?.expired ? ShieldAlert : ShieldCheck;
  const statusLabel = res?.revoked ? "Revoked" : res?.expired ? "Expired" : "Active";

  return (
    <div className="space-y-4" data-testid="license-status">
      {embedded && (
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 grid place-items-center rounded-xl hl-fire-gradient">
            <Radio size={20} className="text-white" />
          </div>
          <div>
            <div className="font-display text-lg tracking-wide">HOT LIVE 95 — My License</div>
            <div className="text-[11px] text-[var(--hl-muted)] uppercase tracking-[0.2em]">Detroit · A.I. Radio</div>
          </div>
        </div>
      )}
      <p className="text-sm text-[var(--hl-muted)]">Enter your activation key to see your expiry date and the computers it's running on.</p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">Activation key</label>
          <input
            data-testid="license-status-key-input"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lookup()}
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2.5 font-display tracking-widest outline-none focus:border-[var(--hl-fire)]"
          />
        </div>
        <button
          data-testid="license-status-lookup"
          onClick={lookup}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg hl-fire-gradient text-white font-600 disabled:opacity-50"
        >
          <Search size={16} /> {loading ? "Checking…" : "Check"}
        </button>
      </div>

      {err && <div className="text-[var(--hl-onair)] text-sm" data-testid="license-status-error">{err}</div>}

      {res && (
        <div className="rounded-xl border border-[var(--hl-line)] bg-[var(--hl-panel-2)] p-4 space-y-3" data-testid="license-status-result">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-[var(--hl-muted)]">DJ</div>
              <div className="font-display text-xl">{res.dj}</div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border" style={{ borderColor: tone, color: tone }} data-testid="license-status-badge">
              <StatusIcon size={16} />
              <span className="font-600 text-sm">{statusLabel}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-black/30 border border-[var(--hl-line)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]"><Clock size={12} /> Expires</div>
              <div className="mt-1 font-600">{res.expires_at ? fmt(res.expires_at) : "No expiry"}</div>
              {typeof res.days_left === "number" && !res.expired && (
                <div className={`text-xs mt-0.5 ${res.days_left <= 14 ? "text-[var(--hl-amber)]" : "text-[var(--hl-muted)]"}`}>{res.days_left} days left</div>
              )}
            </div>
            <div className="rounded-lg bg-black/30 border border-[var(--hl-line)] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]"><MonitorSmartphone size={12} /> Computers</div>
              <div className="mt-1 font-600" data-testid="license-status-devices">{res.active_devices} / {res.max_devices}</div>
              <div className="text-xs mt-0.5 text-[var(--hl-muted)]">activated</div>
            </div>
          </div>

          {res.devices?.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Registered computers</div>
              {res.devices.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-black/20 rounded-md px-3 py-1.5 border border-[var(--hl-line)]">
                  <span className="flex items-center gap-2"><MonitorSmartphone size={13} className="text-[var(--hl-muted)]" /> Computer {i + 1}{d.this_device ? " · this device" : ""}</span>
                  <span className="text-[var(--hl-muted)] text-xs">since {fmt(d.activated_at)}</span>
                </div>
              ))}
            </div>
          )}

          {(res.revoked || res.expired) && (
            <div className="text-sm text-[var(--hl-onair)]">
              {res.revoked ? "This key has been revoked — contact the studio owner." : "This key has expired — ask the owner to renew it."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
