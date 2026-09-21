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
  Plus,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
} from "lucide-react";
import { loadHistory, removeHistory, loadNoteTemplates, saveNoteTemplate, removeNoteTemplate, NOTE_TAGS } from "../lib/cloudHistory";

// Cloud Handoff: send the whole show to the server and get a short code + link
// (with a scannable QR) a co-host can open to import — no file passing. Online
// only; shows are capped at 50 MB and links expire after 30 days. A Library tab
// lists past sent/received handoffs so they can be reopened.
export default function CloudHandoffModal({ initialCode, onUpload, onReceive, onStats, onClose }) {
  const [tab, setTab] = useState(initialCode ? "receive" : "send");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // {code, expires_at, size}
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(initialCode || "");
  const [received, setReceived] = useState(false);
  const [history, setHistory] = useState(loadHistory);
  const [sendPin, setSendPin] = useState("");
  const [sendEmail, setSendEmail] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [receivePin, setReceivePin] = useState("");
  const [pinNeeded, setPinNeeded] = useState(false);
  const [receivedNote, setReceivedNote] = useState("");
  const [templates, setTemplates] = useState(loadNoteTemplates);
  const [stats, setStats] = useState({});
  const [tplTag, setTplTag] = useState("");
  const [tplFilter, setTplFilter] = useState("All");

  const linkFor = (c) => `${window.location.origin}/show?code=${c}`;
  const link = result ? linkFor(result.code) : "";

  const doUpload = async () => {
    if (sendPin && !/^[0-9]{4,6}$/.test(sendPin)) {
      setError("PIN must be 4–6 digits (or leave it blank).");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await onUpload({ pin: sendPin || null, email: sendEmail || null, note: sendNote || "" });
      setResult(res);
      setHistory(loadHistory());
    } catch (e) {
      setError(e.message || "Upload failed. Check your internet connection and try again.");
    }
    setBusy(false);
  };

  const doReceive = async (codeArg, pinArg) => {
    const c = (codeArg ?? code ?? "").trim().toUpperCase();
    if (!c) return;
    setCode(c);
    setTab("receive");
    setBusy(true);
    setError("");
    try {
      const note = await onReceive(c, pinArg ?? receivePin ?? null);
      setReceivedNote(note || "");
      setReceived(true);
      setPinNeeded(false);
      setHistory(loadHistory());
    } catch (e) {
      if (e.status === 401) {
        setPinNeeded(true);
        setError("This show is PIN-protected. Enter the PIN your co-host set.");
      } else if (e.status === 403) {
        setPinNeeded(true);
        setError("That PIN is incorrect. Try again.");
      } else if (e.status === 429) {
        setError("Too many PIN attempts — wait a few minutes and try again.");
      } else {
        setError(e.message || "Could not load that show. Double-check the code.");
      }
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

  // Fetch open-counts for Library entries when that tab is shown.
  useEffect(() => {
    if (tab !== "library" || !onStats) return;
    let cancelled = false;
    (async () => {
      for (const h of history) {
        try {
          const s = await onStats(h.code);
          if (!cancelled) setStats((prev) => ({ ...prev, [h.code]: s.opens }));
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, history]);

  const insertTemplate = (t) => setSendNote((prev) => (prev ? `${prev}\n${t}` : t));
  const saveCurrentTemplate = () => {
    if (!sendNote.trim()) return;
    setTemplates(saveNoteTemplate(sendNote, tplTag));
  };
  const deleteTemplate = (t) => setTemplates(removeNoteTemplate(t));
  const usedTplTags = [...new Set(templates.map((t) => t.tag).filter(Boolean))];
  const visibleTemplates = templates.filter((t) => tplFilter === "All" || (t.tag || "") === tplFilter);


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
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                      PIN (optional)
                    </label>
                    <input
                      data-testid="cloud-send-pin"
                      value={sendPin}
                      onChange={(e) => setSendPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      placeholder="4–6 digits — only a co-host with the PIN can open it"
                      className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                    />
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                      Note for your co-host (optional)
                    </label>
                    <textarea
                      data-testid="cloud-send-note"
                      value={sendNote}
                      onChange={(e) => setSendNote(e.target.value.slice(0, 400))}
                      rows={2}
                      placeholder="e.g. Open with the promo, then run the drive-time set…"
                      className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)] resize-none"
                    />
                    <div className="mt-1.5 space-y-1.5" data-testid="cloud-note-templates">
                      {usedTplTags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5" data-testid="cloud-note-tag-filters">
                          {["All", ...usedTplTags].map((tg) => (
                            <button
                              key={tg}
                              data-testid={`cloud-note-tag-filter-${tg}`}
                              onClick={() => setTplFilter(tg)}
                              className={`text-[10px] rounded-full px-2 py-0.5 border transition ${
                                tplFilter === tg
                                  ? "border-[var(--hl-cue)] text-[var(--hl-cue)] bg-[rgba(58,160,255,0.12)]"
                                  : "border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-white"
                              }`}
                            >
                              {tg}
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {visibleTemplates.map((t) => (
                          <span
                            key={t.text}
                            className="group inline-flex items-center gap-1 text-[11px] rounded-full pl-2.5 pr-1 py-1 border border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-white hover:border-[var(--hl-fire)]"
                          >
                            <button
                              data-testid={`cloud-note-template-${t.text.slice(0, 16)}`}
                              onClick={() => insertTemplate(t.text)}
                              className="max-w-[170px] truncate"
                              title={`Insert: ${t.text}`}
                            >
                              {t.tag ? <span className="text-[var(--hl-cue)] mr-1">[{t.tag}]</span> : null}
                              {t.text}
                            </button>
                            <button
                              onClick={() => deleteTemplate(t.text)}
                              className="h-4 w-4 grid place-items-center rounded-full opacity-50 hover:opacity-100 hover:text-[var(--hl-onair)]"
                              title="Remove template"
                            >
                              <X size={11} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          data-testid="cloud-note-template-tag"
                          value={tplTag}
                          onChange={(e) => setTplTag(e.target.value)}
                          className="bg-black/40 border border-[var(--hl-line)] rounded px-2 py-1 text-[11px] outline-none focus:border-[var(--hl-fire)]"
                        >
                          <option value="">No tag</option>
                          {NOTE_TAGS.map((tg) => (
                            <option key={tg} value={tg}>
                              {tg}
                            </option>
                          ))}
                        </select>
                        <button
                          data-testid="cloud-note-save-template"
                          onClick={saveCurrentTemplate}
                          disabled={!sendNote.trim()}
                          className="text-[11px] rounded-full px-2.5 py-1 border border-dashed border-[var(--hl-line)] text-[var(--hl-muted)] hover:text-[var(--hl-fire)] hover:border-[var(--hl-fire)] disabled:opacity-40 inline-flex items-center gap-1"
                        >
                          <Plus size={11} /> Save as template
                        </button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                      Email me before it expires (optional)
                    </label>
                    <input
                      data-testid="cloud-send-email"
                      value={sendEmail}
                      onChange={(e) => setSendEmail(e.target.value)}
                      type="email"
                      placeholder="you@email.com"
                      className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                    />
                  </div>
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
                      {result.protected ? " · PIN-protected 🔒" : ""}
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
                  {receivedNote && (
                    <div
                      className="mt-3 text-left text-sm bg-[rgba(255,171,0,0.1)] border border-[var(--hl-amber)] rounded-lg px-3 py-2 text-[var(--hl-amber)]"
                      data-testid="cloud-received-note"
                    >
                      <span className="font-600">Note from sender:</span> {receivedNote}
                    </div>
                  )}
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
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase());
                      setPinNeeded(false);
                    }}
                    onKeyDown={(e) => e.key === "Enter" && doReceive()}
                    placeholder="ABC123"
                    maxLength={8}
                    className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-3 text-center text-2xl font-display tracking-[0.3em] outline-none focus:border-[var(--hl-fire)]"
                  />
                  {pinNeeded && (
                    <input
                      data-testid="cloud-receive-pin"
                      value={receivePin}
                      onChange={(e) => setReceivePin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => e.key === "Enter" && doReceive(code, receivePin)}
                      inputMode="numeric"
                      autoFocus
                      placeholder="Enter PIN"
                      className="w-full bg-black/50 border border-[var(--hl-cue)] rounded-lg px-3 py-3 text-center text-xl font-display tracking-[0.3em] outline-none focus:border-[var(--hl-fire)]"
                    />
                  )}
                  <button
                    data-testid="cloud-receive-button"
                    onClick={() => doReceive(code, pinNeeded ? receivePin : null)}
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
                        <div className="text-[11px] text-[var(--hl-muted)] flex items-center gap-1.5 flex-wrap">
                          <span>{h.dir === "sent" ? "Sent" : "Received"}</span>
                          {h.expires_at ? <span>· {expiryLabel(h.expires_at)}</span> : null}
                          {stats[h.code] != null && (
                            <span
                              className="inline-flex items-center gap-1 text-[var(--hl-cue)]"
                              data-testid={`cloud-library-opens-${h.dir}-${h.code}`}
                            >
                              · <Eye size={11} /> opened {stats[h.code]}×
                            </span>
                          )}
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
