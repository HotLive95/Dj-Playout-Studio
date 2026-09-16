import React, { useEffect, useState } from "react";
import { Download, X, Share, Radio } from "lucide-react";

const DISMISS_KEY = "hotlive95_a2hs_dismissed";

// Friendly "Add to Home Screen" tip for phone DJs so the studio launches like a
// native app. Android/Chrome uses the real beforeinstallprompt (one-tap install);
// iOS Safari (which has no such event) gets short Share → Add to Home Screen steps.
// Shows on phones only, once, and remembers dismissal.
export const InstallPrompt = () => {
  const [deferred, setDeferred] = useState(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent || "";
    const ios = /iphone|ipad|ipod/i.test(ua);
    const isSafari = /safari/i.test(ua) && !/crios|fxios|android/i.test(ua);
    if (ios && isSafari) {
      setIsIOS(true);
      setShow(true);
      return;
    }

    const onBip = (e) => {
      e.preventDefault();
      setDeferred(e);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    dismiss();
  };

  if (!show) return null;

  return (
    <div
      data-testid="install-prompt"
      className="md:hidden fixed left-3 right-3 bottom-[74px] z-50 rounded-xl border border-[var(--hl-fire)] bg-[var(--hl-panel)]/98 backdrop-blur-md shadow-2xl p-3"
    >
      <button
        data-testid="install-prompt-dismiss"
        onClick={dismiss}
        className="absolute top-2 right-2 h-7 w-7 grid place-items-center rounded-md text-[var(--hl-muted)] active:bg-white/10"
        title="Not now"
      >
        <X size={16} />
      </button>
      <div className="flex items-start gap-3 pr-6">
        <div className="h-10 w-10 shrink-0 rounded-lg hl-fire-gradient grid place-items-center">
          <Radio size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-display text-sm font-700 tracking-wide">
            Install Hot Live 95
          </div>
          {isIOS ? (
            <p className="text-xs text-[var(--hl-muted)] mt-1 leading-relaxed">
              Tap the{" "}
              <Share size={12} className="inline -mt-0.5 text-[var(--hl-fire)]" /> Share button,
              then <span className="text-[var(--hl-text)]">Add to Home Screen</span> to launch the
              studio like an app.
            </p>
          ) : (
            <p className="text-xs text-[var(--hl-muted)] mt-1 leading-relaxed">
              Add the studio to your home screen for one-tap, full-screen access on the go.
            </p>
          )}
          {!isIOS && (
            <button
              data-testid="install-prompt-install"
              onClick={install}
              className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg hl-fire-gradient text-white text-xs font-700 active:brightness-110"
            >
              <Download size={14} /> Add to Home Screen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
