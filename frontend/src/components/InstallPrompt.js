import React, { useEffect, useState } from "react";
import { Download, X, Share, Radio, MonitorDown } from "lucide-react";
import { installStore, isStandalone, detectPlatform } from "../lib/installStore";

const DISMISS_KEY = "hotlive95_a2hs_dismissed";

const STEP_TEXT = {
  windows: 'Click the install icon in the address bar, or the ⋮ menu → "Install Hot Live 95…".',
  mac: 'Chrome/Edge: install icon in the address bar (or ⋮ → Install). Safari: File → "Add to Dock".',
  ios: "Tap the Share button, then “Add to Home Screen”.",
  android: 'Open the ⋮ menu and tap "Install app".',
  desktop: 'Open the browser ⋮ menu and choose "Install Hot Live 95…".',
};
const PLAT_LABEL = { windows: "Windows", mac: "Mac", ios: "iPad / iPhone", android: "Android", desktop: "your device" };

// First-run, full-screen welcome that makes installing the studio obvious on
// every device. One-tap install on Chrome/Edge (beforeinstallprompt); other
// platforms get short steps. Shows once, then remembers dismissal.
export const InstallPrompt = () => {
  const [show, setShow] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(installStore.hasPrompt());
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    if (isStandalone()) return;
    const t = setTimeout(() => setShow(true), 600);
    const unsub = installStore.subscribe(() => setHasPrompt(installStore.hasPrompt()));
    return () => {
      clearTimeout(t);
      unsub();
    };
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  };

  const install = async () => {
    if (hasPrompt) {
      await installStore.prompt();
      dismiss();
    } else {
      setShowSteps(true);
    }
  };

  if (!show) return null;
  const plat = detectPlatform();

  return (
    <div
      data-testid="install-prompt"
      className="fixed inset-0 z-[70] grid place-items-center p-4 bg-black/80 backdrop-blur-md"
    >
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--hl-fire)] bg-[var(--hl-panel)] shadow-2xl overflow-hidden">
        <button
          data-testid="install-prompt-dismiss"
          onClick={dismiss}
          className="absolute top-3 right-3 h-8 w-8 grid place-items-center rounded-lg text-[var(--hl-muted)] hover:bg-white/10"
          title="Maybe later"
        >
          <X size={18} />
        </button>
        <div className="hl-fire-gradient h-1.5 w-full" />
        <div className="p-6 text-center">
          <div className="mx-auto h-16 w-16 grid place-items-center rounded-2xl hl-fire-gradient mb-4">
            <Radio size={30} className="text-white" />
          </div>
          <div className="font-display text-2xl font-700 tracking-wide">Install Hot Live 95</div>
          <p className="text-sm text-[var(--hl-muted)] mt-2 leading-relaxed">
            Add the studio to <span className="text-[var(--hl-text)]">{PLAT_LABEL[plat]}</span> for full-screen,
            one-tap launch that keeps working offline — perfect for live shows.
          </p>

          {!showSteps ? (
            <div className="mt-5 space-y-2.5">
              <button
                data-testid="install-prompt-install"
                onClick={install}
                className="w-full h-12 rounded-xl hl-fire-gradient text-white font-700 flex items-center justify-center gap-2 active:brightness-110"
              >
                {plat === "ios" ? <Share size={18} /> : <Download size={18} />} Install to this device
              </button>
              <button
                data-testid="install-prompt-later"
                onClick={dismiss}
                className="w-full h-10 rounded-xl border border-[var(--hl-line)] text-sm text-[var(--hl-muted)] hover:text-white hover:border-white"
              >
                Maybe later
              </button>
            </div>
          ) : (
            <div className="mt-5 text-left rounded-xl border border-[var(--hl-line)] p-4" data-testid="install-prompt-steps">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-cue)] mb-2">
                <MonitorDown size={14} /> How to install on {PLAT_LABEL[plat]}
              </div>
              <p className="text-sm leading-relaxed">
                {plat === "ios" ? (
                  <>
                    Tap the <Share size={13} className="inline -mt-0.5 text-[var(--hl-fire)]" /> Share button, then{" "}
                    <span className="text-[var(--hl-text)]">Add to Home Screen</span>.
                  </>
                ) : (
                  STEP_TEXT[plat] || STEP_TEXT.desktop
                )}
              </p>
              <button
                data-testid="install-prompt-steps-done"
                onClick={dismiss}
                className="mt-4 w-full h-10 rounded-xl hl-fire-gradient text-white font-700"
              >
                Got it
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
