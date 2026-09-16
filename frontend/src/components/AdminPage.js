import React, { useState } from "react";
import { Lock, ShieldCheck, Radio, IdCard, Play, LogOut } from "lucide-react";
import KeyManager, { ADMIN_PASS } from "./KeyManager";

const SESSION_KEY = "hotlive95_admin_ok";

// Passkey-protected admin console (route: /admin). One login, then the full
// Key Manager (generate/email/renew/revoke keys + usage dashboard) plus quick
// links. Session-remembered so a refresh doesn't ask again.
export default function AdminPage() {
  const [authed, setAuthed] = useState(() => sessionStorage.getItem(SESSION_KEY) === "1");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");

  const submit = (e) => {
    e.preventDefault();
    if (pass === ADMIN_PASS) {
      sessionStorage.setItem(SESSION_KEY, "1");
      setAuthed(true);
      setErr("");
    } else {
      setErr("Wrong passkey. Try again.");
    }
  };

  const logout = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthed(false);
    setPass("");
  };

  if (!authed) {
    return (
      <div className="min-h-screen bg-[var(--hl-bg)] text-[var(--hl-text)] relative grid place-items-center p-5" data-testid="admin-login">
        <div className="pointer-events-none absolute inset-0 opacity-60" style={{ background: "radial-gradient(800px 400px at 50% -10%, rgba(255,90,31,0.18), transparent 60%)" }} />
        <form onSubmit={submit} className="relative z-10 w-full max-w-sm hl-panel rounded-2xl p-7 text-center">
          <div className="h-14 w-14 mx-auto grid place-items-center rounded-2xl hl-fire-gradient mb-4">
            <Lock size={24} className="text-white" />
          </div>
          <h1 className="font-display text-2xl tracking-wide">HOT LIVE 95 — Admin</h1>
          <p className="text-[11px] uppercase tracking-[0.3em] text-[var(--hl-muted)] mt-1 mb-6">Enter your passkey</p>
          <input
            data-testid="admin-passkey-input"
            type="password"
            autoFocus
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="Admin passkey"
            className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-4 py-3 text-center tracking-widest outline-none focus:border-[var(--hl-fire)]"
          />
          {err && <div className="text-[var(--hl-onair)] text-sm mt-3" data-testid="admin-login-error">{err}</div>}
          <button data-testid="admin-login-submit" type="submit" className="mt-5 w-full py-3 rounded-lg hl-fire-gradient text-white font-600 flex items-center justify-center gap-2">
            <ShieldCheck size={16} /> Enter Admin
          </button>
          <a href="/" className="mt-4 inline-block text-xs text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">← Back to the Studio app</a>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--hl-bg)] text-[var(--hl-text)] relative" data-testid="admin-page">
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: "radial-gradient(800px 380px at 50% -10%, rgba(255,90,31,0.15), transparent 60%)" }} />
      <div className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[var(--hl-line)]">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 grid place-items-center rounded-xl hl-fire-gradient"><Radio size={18} className="text-white" /></div>
          <div>
            <div className="font-display text-lg tracking-wide leading-none">HOT LIVE 95 — Admin Console</div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--hl-muted)]">Key generator · dashboard · settings</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <a href="/live" data-testid="admin-link-live" className="inline-flex items-center gap-1.5 text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"><Play size={13} /> Listen Live</a>
          <a href="/license" data-testid="admin-link-license" className="inline-flex items-center gap-1.5 text-[var(--hl-muted)] hover:text-[var(--hl-fire)]"><IdCard size={13} /> License lookup</a>
          <a href="/" className="text-[var(--hl-muted)] hover:text-[var(--hl-fire)]">Studio app</a>
          <button data-testid="admin-logout" onClick={logout} className="inline-flex items-center gap-1.5 text-[var(--hl-muted)] hover:text-[var(--hl-onair)]"><LogOut size={13} /> Lock</button>
        </div>
      </div>
      {/* Key Manager, pre-authed so it opens straight to the generator + dashboard */}
      <KeyManager skipAuth onClose={() => { window.location.href = "/"; }} />
    </div>
  );
}
