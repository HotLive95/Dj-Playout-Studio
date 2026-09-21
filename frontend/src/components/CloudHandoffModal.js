import React, { useState, useEffect, useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import {
  Cloud,
  X,
  UploadCloud,
  DownloadCloud,
  Copy,
  Check,
  Loader2,
  Library,
  RotateCcw,
  Trash2,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { loadHistory, removeHistory } from "../lib/cloudHistory";

// Cloud Handoff: send the whole show to the server and get a short code + link
// (with a scannable QR) a co-host can open to import — no file passing. Online
// only; shows are capped at 50 MB and links expire after 30 days. A Library tab
// lists past sent/received handoffs so they can be reopened.
export default function CloudHandoffModal({ initialCode, onUpload, onReceive, onClose }) {
  const [tab, setTab] = useState(initialCode ? "receive" : "send");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // {code, expires_at, size}
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(initialCode || "");
  const [received, setReceived] = useState(false);
  const [history, setHistory] = useState(loadHistory);

  const linkFor = (c) => `${window.location.origin}/show?code=${c}`;
  const link = result ? linkFor(result.code) : "";

  const doUpload = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await onUpload();
      setResult(res);
      setHistory(loadHistory());
    } catch (e) {
      setError(e.message || "Upload failed. Check your internet connection and try again.");
    }
    setBusy(false);
  };

  const doReceive = async (codeArg) => {
    const c = (codeArg ?? code ?? "").trim().toUpperCase();
    if (!c) return;
    setCode(c);
    setTab("receive");
    setBusy(true);
    setError("");
    try {
      await onReceive(c);
      setReceived(true);
      setHistory(loadHistory());
    } catch (e) {
      setError(e.message || "Could not load that show. Double-check the code.");
    }
    setBusy(false);
  };

  // Auto-fetch when arriving from a share link (guarded so it fires only once,
  // even under React StrictMode's double-mount in dev).
  const didAutoFetch = useRef(false);
  useEffect(() => {
    if (initialCode && !didAutoFetch.current) {
      didAutoFetch.current = true;
      doReceive();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyLink = async (l, key) => {
    try {
      await navigator.clipboard.writeText(l);
      setCopied(key ?? "main");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const removeEntry = (c, dir) => {
    removeHistory(c, dir);
    setHistory(loadHistory());
  };

  const fmtSize = (b) => (b ? `${(b / (1024 * 1024)).toFixed(1)} MB` : "");
  const expiryLabel = (iso) => {
    if (!iso) return "";
    const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
    if (days < 0) return "expired";
    if (days === 0) return "expires today";
    return `expires in ${days} day${days === 1 ? "" : "s"}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="cloud-handoff-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Cloud size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Cloud Handoff</h2>
          </div>
          <button
            data-testid="cloud-close"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-[var(--hl-line)]">
          {[
            { id: "send", label: "Send", Icon: UploadCloud },
            { id: "receive", label: "Receive", Icon: DownloadCloud },
            { id: "library", label: "Library", Icon: Library },
          ].map(({ id, label, Icon }) => (
            <button
              key={id}
              data-testid={`cloud-tab-${id}`}
              onClick={() => setTab(id)}
              className={`flex-1 py-2.5 text-sm font-600 flex items-center justify-center gap-2 ${
                tab === id
                  ? "text-[var(--hl-fire)] border-b-2 border-[var(--hl-fire)]"
                  : "text-[var(--hl-muted)]"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="text-sm text-[var(--hl-onair)] text-center" data-testid="cloud-error">
              {error}
            </div>
          )}

          {tab === "send" && (
            <>
              {!result ? (
                <>
                  <p className="text-sm text-[var(--hl-muted)]">
                    Upload your whole show (all playlists, jingles, and voice takes) and get a short
                    code + link to send a co-host. Online only · 50 MB max · link expires in 30 days.
                  </p>
                  <button
                    data-testid="cloud-upload-button"
                    onClick={doUpload}
                    disabled={busy}
                    className="w-full h-11 rounded-lg hl-fire-gradient text-white font-600 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {busy ? <Loader2 size={17} className="animate-spin" /> : <UploadCloud size={17} />}
                    {busy ? "Uploading show…" : "Upload & get share link"}
                  </button>
                </>
              ) : (
                <div className="space-y-3" data-testid="cloud-upload-result">
                  <div className="text-center">
                    <div className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                      Share code
                    </div>
                    <div
                      className="font-display text-4xl font-700 tracking-[0.3em] text-[var(--hl-fire)] mt-1"
                      data-testid="cloud-share-code"
                    >
                      {result.code}
                    </div>
                    <div className="text-[11px] text-[var(--hl-muted)] mt-1">
                      {fmtSize(result.size)} · {expiryLabel(result.expires_at)}
                    </div>
                  </div>
                  <div className="grid place-items-center">
                    <div className="bg-white p-2.5 rounded-xl" data-testid="cloud-qr">
                      <QRCodeCanvas value={link} size={148} includeMargin={false} />
                    </div>
                    <p className="text-[11px] text-[var(--hl-muted)] mt-2 text-center">
                      Scan with a phone camera to open the show.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      data-testid="cloud-share-link"
                      readOnly
                      value={link}
                      className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none"
                    />
                    <button
                      data-testid="cloud-copy-link"
                      onClick={() => copyLink(link, "main")}
                      className="h-9 px-3 grid place-items-center rounded-lg border border-[var(--hl-line)] hover:border-[var(--hl-fire)] text-sm flex-row gap-1.5"
                    >
                      {copied === "main" ? (
                        <Check size={15} className="text-[var(--hl-cue)]" />
                      ) : (
                        <Copy size={15} />
                      )}
                      {copied === "main" ? "Copied" : "Copy"}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {tab === "receive" && (
            <>
              {received ? (
                <div className="text-center py-4" data-testid="cloud-received">
                  <Check size={28} className="mx-auto text-[var(--hl-cue)]" />
                  <p className="text-sm mt-2">Show loaded into your studio.</p>
                  <button
                    onClick={onClose}
                    className="mt-4 px-4 py-2 rounded-lg hl-fire-gradient text-white font-600 text-sm"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--hl-muted)]">
                    Enter the share code your co-host sent you to load their whole show.
                  </p>
                  <input
                    data-testid="cloud-code-input"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && doReceive()}
                    placeholder="ABC123"
                    maxLength={8}
                    className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-3 text-center text-2xl font-display tracking-[0.3em] outline-none focus:border-[var(--hl-fire)]"
                  />
                  <button
                    data-testid="cloud-receive-button"
                    onClick={() => doReceive()}
                    disabled={busy || !code.trim()}
                    className="w-full h-11 rounded-lg hl-fire-gradient text-white font-600 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {busy ? <Loader2 size={17} className="animate-spin" /> : <DownloadCloud size={17} />}
                    {busy ? "Loading show…" : "Load show"}
                  </button>
                </>
              )}
            </>
          )}

          {tab === "library" && (
            <div data-testid="cloud-library">
              {history.length === 0 ? (
                <div className="text-center text-[var(--hl-muted)] text-sm py-10" data-testid="cloud-library-empty">
                  <Library size={22} className="mx-auto mb-2 opacity-60" />
                  No handoffs yet. Shows you send or receive appear here so you can reopen them.
                </div>
              ) : (
                <div className="space-y-2">
                  {history.map((h) => (
                    <div
                      key={`${h.dir}-${h.code}`}
                      data-testid={`cloud-library-item-${h.dir}-${h.code}`}
                      className="rounded-xl border border-[var(--hl-line)] bg-black/30 p-3 flex items-center gap-3"
                    >
                      <div
                        className={`h-8 w-8 shrink-0 grid place-items-center rounded-full ${
                          h.dir === "sent"
                            ? "text-[var(--hl-fire)] bg-[rgba(255,90,31,0.12)]"
                            : "text-[var(--hl-cue)] bg-[rgba(58,160,255,0.12)]"
                        }`}
                        title={h.dir === "sent" ? "You sent this" : "You received this"}
                      >
                        {h.dir === "sent" ? <ArrowUpRight size={15} /> : <ArrowDownLeft size={15} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-display font-700 tracking-wider">{h.code}</div>
                        <div className="text-[11px] text-[var(--hl-muted)]">
                          {h.dir === "sent" ? "Sent" : "Received"}
                          {h.expires_at ? ` · ${expiryLabel(h.expires_at)}` : ""}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          data-testid={`cloud-library-reopen-${h.dir}-${h.code}`}
                          onClick={() => doReceive(h.code)}
                          className="h-8 px-2.5 grid place-items-center rounded-lg border border-[var(--hl-line)] text-[var(--hl-cue)] hover:border-[var(--hl-cue)] text-xs font-600 flex-row gap-1"
                          title="Reopen this show"
                        >
                          <RotateCcw size={13} /> Reopen
                        </button>
                        <button
                          data-testid={`cloud-library-copy-${h.dir}-${h.code}`}
                          onClick={() => copyLink(linkFor(h.code), h.code)}
                          className="h-8 w-8 grid place-items-center rounded-lg text-[var(--hl-muted)] hover:text-[var(--hl-amber)] hover:bg-white/10"
                          title="Copy link"
                        >
                          {copied === h.code ? <Check size={14} className="text-[var(--hl-cue)]" /> : <Copy size={14} />}
                        </button>
                        <button
                          data-testid={`cloud-library-remove-${h.dir}-${h.code}`}
                          onClick={() => removeEntry(h.code, h.dir)}
                          className="h-8 w-8 grid place-items-center rounded-lg text-[var(--hl-muted)] hover:text-[var(--hl-onair)] hover:bg-white/10"
                          title="Remove from library"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
