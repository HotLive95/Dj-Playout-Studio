import React, { useState, useEffect, useRef } from "react";
import { Cloud, X, UploadCloud, DownloadCloud, Copy, Check, Loader2 } from "lucide-react";

// Cloud Handoff: send the whole show to the server and get a short code + link
// a co-host can open to import — no file passing. Online-only (needs internet +
// the backend); shows are capped at 50 MB and links expire after 30 days.
export default function CloudHandoffModal({ initialCode, onUpload, onReceive, onClose }) {
  const [tab, setTab] = useState(initialCode ? "receive" : "send");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // {code, expires_at, size}
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(initialCode || "");
  const [received, setReceived] = useState(false);

  const link = result
    ? `${window.location.origin}/show?code=${result.code}`
    : "";

  const doUpload = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await onUpload();
      setResult(res);
    } catch (e) {
      setError(e.message || "Upload failed. Check your internet connection and try again.");
    }
    setBusy(false);
  };

  const doReceive = async () => {
    const c = (code || "").trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setError("");
    try {
      await onReceive(c);
      setReceived(true);
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

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  };

  const fmtSize = (b) => (b ? `${(b / (1024 * 1024)).toFixed(1)} MB` : "");

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="cloud-handoff-modal"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden flex flex-col">
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
          <button
            data-testid="cloud-tab-send"
            onClick={() => setTab("send")}
            className={`flex-1 py-2.5 text-sm font-600 flex items-center justify-center gap-2 ${
              tab === "send"
                ? "text-[var(--hl-fire)] border-b-2 border-[var(--hl-fire)]"
                : "text-[var(--hl-muted)]"
            }`}
          >
            <UploadCloud size={15} /> Send
          </button>
          <button
            data-testid="cloud-tab-receive"
            onClick={() => setTab("receive")}
            className={`flex-1 py-2.5 text-sm font-600 flex items-center justify-center gap-2 ${
              tab === "receive"
                ? "text-[var(--hl-fire)] border-b-2 border-[var(--hl-fire)]"
                : "text-[var(--hl-muted)]"
            }`}
          >
            <DownloadCloud size={15} /> Receive
          </button>
        </div>

        <div className="p-5 space-y-4">
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
                      {fmtSize(result.size)} · expires{" "}
                      {new Date(result.expires_at).toLocaleDateString()}
                    </div>
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
                      onClick={copyLink}
                      className="h-9 px-3 grid place-items-center rounded-lg border border-[var(--hl-line)] hover:border-[var(--hl-fire)] text-sm flex-row gap-1.5"
                    >
                      {copied ? <Check size={15} className="text-[var(--hl-cue)]" /> : <Copy size={15} />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--hl-muted)] text-center">
                    Your co-host opens the link, or types this code under the Receive tab.
                  </p>
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
                    onClick={doReceive}
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
        </div>
      </div>
    </div>
  );
}
