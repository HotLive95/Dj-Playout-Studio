import React, { useState, useEffect } from "react";
import { X, KeyRound, Copy, Trash2, Plus, ShieldQuestion, MonitorSmartphone, Lock, Ban, Cloud, HardDrive, Mail, RefreshCw, Send, Users, Clock, AlertTriangle } from "lucide-react";
import { generateKey } from "../lib/license";
import { platform } from "../lib/platform";
import { api } from "../lib/api";

const ADMIN_PASS = "hotlive95admin";
const KEY_ISSUER_DEVICE = "";
const STORE = "hotlive95_keys";
const ISSUER_STORE = "hotlive95_issuer";

export default function KeyManager({ onClose }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [passErr, setPassErr] = useState("");
  const [mode, setMode] = useState("online");
  const [deviceId, setDeviceId] = useState("");
  const [issuer, setIssuer] = useState(KEY_ISSUER_DEVICE || localStorage.getItem(ISSUER_STORE) || "");
  const [copied, setCopied] = useState(null);

  // local
  const [keys, setKeys] = useState([]);
  const [dj, setDj] = useState("");

  // online
  const [onlineKeys, setOnlineKeys] = useState([]);
  const [oDj, setODj] = useState("");
  const [oEmail, setOEmail] = useState("");
  const [oMax, setOMax] = useState(1);
  const [oExp, setOExp] = useState("");
  const [oMsg, setOMsg] = useState("");
  const [busy, setBusy] = useState(null);
  const [renewDays, setRenewDays] = useState(90);

  useEffect(() => {
    try {
      setKeys(JSON.parse(localStorage.getItem(STORE) || "[]"));
    } catch {
      setKeys([]);
    }
    platform.getDeviceId().then(setDeviceId);
  }, []);

  const loadOnline = async () => {
    try {
      setOnlineKeys(await api.adminList(ADMIN_PASS));
      setOMsg("");
    } catch {
      setOMsg("Can't reach the licensing server.");
    }
  };
  useEffect(() => {
    if (unlocked && mode === "online") loadOnline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, mode]);

  const tryUnlock = () => {
    if (pass === ADMIN_PASS) {
      setUnlocked(true);
      setPassErr("");
    } else setPassErr("Incorrect admin passphrase.");
  };
  const registerThisComputer = () => {
    localStorage.setItem(ISSUER_STORE, deviceId);
    setIssuer(deviceId);
  };
  const authorized = issuer && deviceId && issuer === deviceId;

  const persist = (next) => {
    setKeys(next);
    localStorage.setItem(STORE, JSON.stringify(next));
  };
  const issueLocal = () => {
    if (!authorized) return;
    persist([{ key: generateKey(), dj: dj.trim() || "Unassigned", createdAt: new Date().toISOString() }, ...keys]);
    setDj("");
  };
  const copy = (k) => {
    navigator.clipboard?.writeText(k);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };

  const createOnline = async () => {
    try {
      const r = await api.adminCreate(ADMIN_PASS, oDj.trim() || "Unassigned", Number(oMax) || 1, oExp || null, oEmail.trim() || null);
      setODj("");
      setOEmail("");
      setOExp("");
      setOMax(1);
      if (oEmail.trim()) setOMsg(r.email_sent ? `Key created — welcome email sent to ${oEmail.trim()}.` : "Key created. Email not sent (add a Resend API key on the server to enable emails).");
      else setOMsg("");
      loadOnline();
    } catch {
      setOMsg("Create failed — check the server.");
    }
  };
  const revokeOnline = async (k, val) => {
    try {
      await api.adminRevoke(ADMIN_PASS, k, val);
      loadOnline();
    } catch {
      setOMsg("Action failed.");
    }
  };
  const renewOnline = async (k) => {
    setBusy(k);
    try {
      const r = await api.adminRenew(ADMIN_PASS, k, renewDays);
      setOMsg(`Renewed ${renewDays} days — now valid through ${String(r.expires_at).slice(0, 10)}.`);
      await loadOnline();
    } catch {
      setOMsg("Renew failed.");
    }
    setBusy(null);
  };
  const resendEmail = async (k) => {
    setBusy(k);
    try {
      const r = await api.adminResendEmail(ADMIN_PASS, k);
      if (r.status === "no_email") setOMsg("No email on file for this DJ.");
      else setOMsg(r.email_sent ? "Welcome email re-sent." : "Email not sent (server has no Resend API key).");
    } catch {
      setOMsg("Resend failed.");
    }
    setBusy(null);
  };
  const deleteOnline = async (k) => {
    try {
      await api.adminDelete(ADMIN_PASS, k);
      loadOnline();
    } catch {
      setOMsg("Delete failed.");
    }
  };

  const Tab = ({ id, icon, label }) => (
    <button
      data-testid={`keymgr-tab-${id}`}
      onClick={() => setMode(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition ${
        mode === id ? "border-[var(--hl-fire)] text-[var(--hl-fire)] bg-[rgba(255,90,31,0.1)]" : "border-[var(--hl-line)] text-[var(--hl-muted)]"
      }`}
    >
      {icon} {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4" data-testid="key-manager-modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl hl-panel rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Key Manager</h2>
            <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">Admin</span>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {!unlocked ? (
          <div className="p-6 space-y-3">
            <div className="flex items-center gap-2 text-[var(--hl-muted)]"><ShieldQuestion size={16} /> Enter the admin passphrase to manage keys.</div>
            <input type="password" data-testid="admin-pass-input" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryUnlock()} placeholder="Admin passphrase" className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]" />
            {passErr && <div className="text-[var(--hl-onair)] text-sm" data-testid="admin-pass-error">{passErr}</div>}
            <button data-testid="admin-unlock-button" onClick={tryUnlock} className="w-full py-2.5 rounded-lg hl-fire-gradient text-white font-600">Unlock</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex gap-2">
              <Tab id="online" icon={<Cloud size={14} />} label="Online (revocable)" />
              <Tab id="local" icon={<HardDrive size={14} />} label="Offline keys" />
            </div>

            {mode === "online" ? (
              <div className="space-y-3" data-testid="keymgr-online">
                {/* Usage dashboard summary */}
                {(() => {
                  const active = onlineKeys.filter((k) => !k.revoked && !k.expired);
                  const totalDevices = onlineKeys.reduce((n, k) => n + (k.active_devices || (k.devices || []).length || 0), 0);
                  const soon = onlineKeys.filter((k) => !k.revoked && typeof k.days_left === "number" && k.days_left >= 0 && k.days_left <= 14).length;
                  const Card = ({ tid, icon, label, value, tone }) => (
                    <div data-testid={tid} className="flex-1 min-w-[110px] rounded-xl border border-[var(--hl-line)] bg-[var(--hl-panel-2)] px-3 py-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">{icon}{label}</div>
                      <div className={`font-display text-2xl leading-tight mt-1 ${tone || "text-[var(--hl-text)]"}`}>{value}</div>
                    </div>
                  );
                  return (
                    <div className="flex flex-wrap gap-2" data-testid="usage-dashboard">
                      <Card tid="stat-active-djs" icon={<Users size={12} />} label="Active DJs" value={active.length} tone="text-[var(--hl-fire)]" />
                      <Card tid="stat-total-devices" icon={<MonitorSmartphone size={12} />} label="Computers online" value={totalDevices} />
                      <Card tid="stat-total-keys" icon={<KeyRound size={12} />} label="Total keys" value={onlineKeys.length} />
                      <Card tid="stat-expiring" icon={<AlertTriangle size={12} />} label="Expiring ≤14d" value={soon} tone={soon ? "text-[var(--hl-amber)]" : "text-[var(--hl-text)]"} />
                    </div>
                  );
                })()}

                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 min-w-[130px]">
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">DJ name</label>
                    <input data-testid="online-dj-name" value={oDj} onChange={(e) => setODj(e.target.value)} placeholder="DJ name" className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]" />
                  </div>
                  <div className="flex-1 min-w-[160px]">
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">DJ email</label>
                    <input data-testid="online-dj-email" type="email" value={oEmail} onChange={(e) => setOEmail(e.target.value)} placeholder="dj@email.com" className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]" />
                  </div>
                  <div className="w-20">
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">Devices</label>
                    <input data-testid="online-max-devices" type="number" min="1" value={oMax} onChange={(e) => setOMax(e.target.value)} className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 outline-none focus:border-[var(--hl-fire)]" />
                  </div>
                  <div className="w-36">
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">Expires</label>
                    <input data-testid="online-expiry" type="date" value={oExp} onChange={(e) => setOExp(e.target.value)} className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 outline-none focus:border-[var(--hl-fire)]" />
                  </div>
                  <button data-testid="online-generate" onClick={createOnline} className="flex items-center gap-2 px-4 py-2.5 rounded-lg hl-fire-gradient text-white font-600"><Plus size={16} /> Create</button>
                </div>
                {oMsg && <div className="text-[var(--hl-amber)] text-sm" data-testid="online-msg">{oMsg}</div>}
                <div className="flex items-center gap-2 text-xs text-[var(--hl-muted)]">
                  <span className="uppercase tracking-wider">Renew length</span>
                  <select data-testid="renew-days-select" value={renewDays} onChange={(e) => setRenewDays(Number(e.target.value))} className="bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-1.5 text-[var(--hl-text)] outline-none focus:border-[var(--hl-fire)]">
                    <option value={30}>30 days</option>
                    <option value={90}>90 days (season)</option>
                    <option value={180}>180 days</option>
                    <option value={365}>365 days</option>
                  </select>
                  <span>— used by the ↻ renew button.</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto hl-scroll space-y-2" data-testid="online-list">
                  {onlineKeys.length === 0 && <div className="text-center text-[var(--hl-muted)] text-sm py-6">No server keys yet.</div>}
                  {onlineKeys.map((k, i) => {
                    const dl = typeof k.days_left === "number" ? k.days_left : null;
                    const expiring = dl !== null && dl >= 0 && dl <= 14;
                    return (
                    <div key={i} data-testid={`online-row-${i}`} className={`flex items-center gap-3 rounded-lg px-3 py-2 border ${k.revoked || k.expired ? "border-[var(--hl-onair)] opacity-80" : "border-[var(--hl-line)]"} bg-[var(--hl-panel-2)]`}>
                      <div className="min-w-0 flex-1">
                        <div className="font-600 truncate flex items-center gap-2">
                          {k.dj}
                          <span className="text-[10px] font-400 text-[var(--hl-muted)] inline-flex items-center gap-1"><MonitorSmartphone size={11} /> {(k.active_devices ?? (k.devices || []).length)}/{k.max_devices}</span>
                          {k.email && <span className="text-[10px] font-400 text-[var(--hl-muted)] inline-flex items-center gap-1 truncate"><Mail size={11} /> {k.email}</span>}
                        </div>
                        <div className="font-display tracking-widest text-sm text-[var(--hl-amber)]">{k.key}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {k.revoked ? (
                            <span className="text-[10px] uppercase tracking-wider text-[var(--hl-onair)]">Revoked</span>
                          ) : k.expired ? (
                            <span className="text-[10px] uppercase tracking-wider text-[var(--hl-onair)]" data-testid={`online-status-${i}`}>Expired</span>
                          ) : k.expires_at ? (
                            <span data-testid={`online-status-${i}`} className={`text-[10px] uppercase tracking-wider inline-flex items-center gap-1 ${expiring ? "text-[var(--hl-amber)]" : "text-[var(--hl-muted)]"}`}><Clock size={10} /> {dl}d left · exp {String(k.expires_at).slice(0, 10)}</span>
                          ) : (
                            <span className="text-[10px] uppercase tracking-wider text-[var(--hl-muted)]">No expiry</span>
                          )}
                          {k.email_sent_at && <span className="text-[10px] text-[var(--hl-muted)] inline-flex items-center gap-1"><Send size={10} /> emailed</span>}
                        </div>
                      </div>
                      {(k.expires_at || k.revoked || k.expired) && (
                        <button data-testid={`online-renew-${i}`} disabled={busy === k.key} onClick={() => renewOnline(k.key)} className="h-8 px-2 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:bg-white/10 disabled:opacity-40" title={`Renew ${renewDays} days`}><RefreshCw size={14} className={busy === k.key ? "animate-spin" : ""} /></button>
                      )}
                      {k.email && (
                        <button data-testid={`online-resend-${i}`} disabled={busy === k.key} onClick={() => resendEmail(k.key)} className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] hover:text-white hover:bg-white/10 disabled:opacity-40" title="Re-send welcome email"><Mail size={14} /></button>
                      )}
                      <button onClick={() => copy(k.key)} className="h-8 px-2 grid place-items-center rounded text-[var(--hl-muted)] hover:text-white hover:bg-white/10 text-xs" title="Copy"><Copy size={14} />{copied === k.key ? "✓" : ""}</button>
                      <button data-testid={`online-revoke-${i}`} onClick={() => revokeOnline(k.key, !k.revoked)} className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:bg-white/10" title={k.revoked ? "Un-revoke" : "Revoke"}><Ban size={14} /></button>
                      <button data-testid={`online-delete-${i}`} onClick={() => deleteOnline(k.key)} className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:bg-white/10" title="Delete"><Trash2 size={14} /></button>
                    </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-[var(--hl-muted)]">Online keys can be revoked anytime, capped to a number of computers, and given an expiry date. Add a DJ email to auto-send their key. Tap <RefreshCw size={10} className="inline" /> to renew a key 90 more days. DJs must be online at least once to activate.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 bg-black/30 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-xs">
                  <span className="flex items-center gap-2 text-[var(--hl-muted)]"><MonitorSmartphone size={14} /> This computer: <span className="font-display tracking-wider text-[var(--hl-text)]" data-testid="keymgr-device-id">{deviceId ? deviceId.slice(0, 16) + "…" : "…"}</span></span>
                  <button onClick={() => copy(deviceId)} className="text-[var(--hl-muted)] hover:text-white"><Copy size={13} /></button>
                </div>
                {!issuer ? (
                  <div className="space-y-3" data-testid="keymgr-register">
                    <div className="flex items-center gap-2 text-[var(--hl-amber)]"><Lock size={16} /> Lock key generation to this computer</div>
                    <p className="text-sm text-[var(--hl-muted)]">Register THIS computer as the only machine allowed to create offline keys.</p>
                    <button data-testid="keymgr-register-button" onClick={registerThisComputer} className="w-full py-2.5 rounded-lg hl-fire-gradient text-white font-600">Register this computer as the key-issuing machine</button>
                  </div>
                ) : !authorized ? (
                  <div className="rounded-lg border border-[var(--hl-onair)] bg-[rgba(255,23,68,0.1)] text-[var(--hl-onair)] px-4 py-4 text-sm" data-testid="keymgr-locked">
                    <div className="flex items-center gap-2 font-600 mb-1"><Lock size={16} /> Key generation is locked</div>
                    Offline keys can only be created on the studio owner's registered computer.
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-2">
                      <div className="flex-1">
                        <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">DJ name</label>
                        <input data-testid="keymgr-dj-name" value={dj} onChange={(e) => setDj(e.target.value)} onKeyDown={(e) => e.key === "Enter" && issueLocal()} placeholder="e.g. DJ Nightrider" className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]" />
                      </div>
                      <button data-testid="keymgr-generate" onClick={issueLocal} className="flex items-center gap-2 px-4 py-2.5 rounded-lg hl-fire-gradient text-white font-600"><Plus size={16} /> Generate</button>
                    </div>
                    <div className="max-h-[240px] overflow-y-auto hl-scroll space-y-2" data-testid="keymgr-list">
                      {keys.length === 0 && <div className="text-center text-[var(--hl-muted)] text-sm py-6">No keys issued yet.</div>}
                      {keys.map((k, i) => (
                        <div key={i} data-testid={`keymgr-row-${i}`} className="flex items-center gap-3 bg-[var(--hl-panel-2)] border border-[var(--hl-line)] rounded-lg px-3 py-2">
                          <div className="min-w-0 flex-1"><div className="font-600 truncate">{k.dj}</div><div className="font-display tracking-widest text-sm text-[var(--hl-amber)]">{k.key}</div></div>
                          <button onClick={() => copy(k.key)} data-testid={`keymgr-copy-${i}`} className="h-8 px-2 grid place-items-center rounded text-[var(--hl-muted)] hover:text-white hover:bg-white/10 text-xs"><Copy size={14} /></button>
                          <button onClick={() => persist(keys.filter((_, idx) => idx !== i))} data-testid={`keymgr-remove-${i}`} className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:bg-white/10"><Trash2 size={14} /></button>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-[var(--hl-muted)]">Offline keys work with no server but can't be revoked. Use Online keys for revocable/expiring licenses.</p>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
