import React, { useState, useEffect } from "react";
import { X, KeyRound, Copy, Trash2, Plus, ShieldQuestion, MonitorSmartphone, Lock } from "lucide-react";
import { generateKey } from "../lib/license";
import { platform } from "../lib/platform";

// Owner-only admin passphrase. Change this in code before distributing.
const ADMIN_PASS = "hotlive95admin";
// OPTIONAL: hard-bind key generation to ONE computer for distributed builds.
// Leave "" to let the first computer register itself. To lock it before you hand
// the app to DJs: open Key Manager on YOUR computer, copy the "This computer" ID
// shown below, paste it here, then rebuild the app you give out.
const KEY_ISSUER_DEVICE = "";
const STORE = "hotlive95_keys";
const ISSUER_STORE = "hotlive95_issuer";

export default function KeyManager({ onClose }) {
  const [unlocked, setUnlocked] = useState(false);
  const [pass, setPass] = useState("");
  const [passErr, setPassErr] = useState("");
  const [keys, setKeys] = useState([]);
  const [dj, setDj] = useState("");
  const [copied, setCopied] = useState(null);
  const [deviceId, setDeviceId] = useState("");
  const [issuer, setIssuer] = useState(KEY_ISSUER_DEVICE || localStorage.getItem(ISSUER_STORE) || "");

  useEffect(() => {
    try {
      setKeys(JSON.parse(localStorage.getItem(STORE) || "[]"));
    } catch {
      setKeys([]);
    }
    platform.getDeviceId().then(setDeviceId);
  }, []);

  const persist = (next) => {
    setKeys(next);
    localStorage.setItem(STORE, JSON.stringify(next));
  };

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

  const issue = () => {
    if (!authorized) return;
    const entry = { key: generateKey(), dj: dj.trim() || "Unassigned", createdAt: new Date().toISOString() };
    persist([entry, ...keys]);
    setDj("");
  };

  const remove = (i) => persist(keys.filter((_, idx) => idx !== i));
  const copy = (k) => {
    navigator.clipboard?.writeText(k);
    setCopied(k);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4"
      data-testid="key-manager-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-xl hl-panel rounded-2xl overflow-hidden">
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
            <div className="flex items-center gap-2 text-[var(--hl-muted)]">
              <ShieldQuestion size={16} /> Enter the admin passphrase to manage keys.
            </div>
            <input
              type="password"
              data-testid="admin-pass-input"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && tryUnlock()}
              placeholder="Admin passphrase"
              className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]"
            />
            {passErr && <div className="text-[var(--hl-onair)] text-sm" data-testid="admin-pass-error">{passErr}</div>}
            <button
              data-testid="admin-unlock-button"
              onClick={tryUnlock}
              className="w-full py-2.5 rounded-lg hl-fire-gradient text-white font-600"
            >
              Unlock
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* This computer id */}
            <div className="flex items-center justify-between gap-2 bg-black/30 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-[var(--hl-muted)]">
                <MonitorSmartphone size={14} /> This computer:
                <span className="font-display tracking-wider text-[var(--hl-text)]" data-testid="keymgr-device-id">
                  {deviceId ? deviceId.slice(0, 16) + "…" : "…"}
                </span>
              </span>
              <button onClick={() => copy(deviceId)} className="text-[var(--hl-muted)] hover:text-white" title="Copy full ID">
                <Copy size={13} /> {copied === deviceId ? "Copied" : ""}
              </button>
            </div>

            {!issuer ? (
              // No issuing machine set yet — let this computer claim it.
              <div className="space-y-3" data-testid="keymgr-register">
                <div className="flex items-center gap-2 text-[var(--hl-amber)]">
                  <Lock size={16} /> Lock key generation to this computer
                </div>
                <p className="text-sm text-[var(--hl-muted)]">
                  Register THIS computer as the only machine allowed to create activation keys.
                  Afterwards, the key maker won't work on any other computer.
                </p>
                <button
                  data-testid="keymgr-register-button"
                  onClick={registerThisComputer}
                  className="w-full py-2.5 rounded-lg hl-fire-gradient text-white font-600"
                >
                  Register this computer as the key-issuing machine
                </button>
              </div>
            ) : !authorized ? (
              // Issuer set to a different machine — blocked here.
              <div
                className="rounded-lg border border-[var(--hl-onair)] bg-[rgba(255,23,68,0.1)] text-[var(--hl-onair)] px-4 py-4 text-sm"
                data-testid="keymgr-locked"
              >
                <div className="flex items-center gap-2 font-600 mb-1">
                  <Lock size={16} /> Key generation is locked
                </div>
                Activation keys can only be created on the studio owner's registered computer. This
                is not that machine, so key generation is disabled here.
              </div>
            ) : (
              // Authorized issuing machine — full generator.
              <>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">DJ name</label>
                    <input
                      data-testid="keymgr-dj-name"
                      value={dj}
                      onChange={(e) => setDj(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && issue()}
                      placeholder="e.g. DJ Nightrider"
                      className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]"
                    />
                  </div>
                  <button
                    data-testid="keymgr-generate"
                    onClick={issue}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg hl-fire-gradient text-white font-600"
                  >
                    <Plus size={16} /> Generate key
                  </button>
                </div>

                <div className="max-h-[300px] overflow-y-auto hl-scroll space-y-2" data-testid="keymgr-list">
                  {keys.length === 0 && (
                    <div className="text-center text-[var(--hl-muted)] text-sm py-8">
                      No keys issued yet. Generate one for each DJ.
                    </div>
                  )}
                  {keys.map((k, i) => (
                    <div
                      key={i}
                      data-testid={`keymgr-row-${i}`}
                      className="flex items-center gap-3 bg-[var(--hl-panel-2)] border border-[var(--hl-line)] rounded-lg px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-600 truncate">{k.dj}</div>
                        <div className="font-display tracking-widest text-sm text-[var(--hl-amber)]">{k.key}</div>
                      </div>
                      <button
                        onClick={() => copy(k.key)}
                        className="h-8 px-2 grid place-items-center rounded text-[var(--hl-muted)] hover:text-white hover:bg-white/10 text-xs"
                        title="Copy key"
                        data-testid={`keymgr-copy-${i}`}
                      >
                        <Copy size={14} /> {copied === k.key ? "Copied" : ""}
                      </button>
                      <button
                        onClick={() => remove(i)}
                        className="h-8 w-8 grid place-items-center rounded text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:bg-white/10"
                        title="Remove"
                        data-testid={`keymgr-remove-${i}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--hl-muted)]">
                  This list is stored only on this computer. Give each DJ their key; they activate
                  once per machine (each key locks to the first computer it's used on).
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
