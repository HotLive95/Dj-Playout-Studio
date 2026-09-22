import React, { useEffect, useState } from "react";
import { Download, X, Share, MonitorDown, Radio } from "lucide-react";
import { installStore, isStandalone, detectPlatform } from "../lib/installStore";

const STEPS = {
  windows: [
    'Click the install icon (a monitor with a down-arrow) at the right edge of the address bar, or open the ⋮ menu → "Install Hot Live 95…".',
    'Confirm — the studio opens in its own window and lands on your desktop / Start menu.',
  ],
  mac: [
    'In Chrome/Edge: click the install icon in the address bar, or ⋮ menu → "Install Hot Live 95…". In Safari: File → "Add to Dock".',
    "The studio launches like a native app from Launchpad / the Dock.",
  ],
  ios: [
    "Open this page in Safari.",
    "Tap the Share button (the square with an up-arrow).",
    'Scroll down and tap "Add to Home Screen", then Add.',
  ],
  android: [
    'Open the ⋮ menu in Chrome and tap "Install app" / "Add to Home screen".',
    "Confirm — the studio installs like a native app.",
  ],
  desktop: [
    'In Chrome or Edge, open the ⋮ menu and choose "Install Hot Live 95…", or use the install icon in the address bar.',
  ],
};

const PLATFORM_LABEL = {
  windows: "Windows",
  mac: "Mac",
  ios: "iPad / iPhone",
  android: "Android",
  desktop: "this device",
};

export default function InstallButton({ variant = "header" }) {
  const [hasPrompt, setHasPrompt] = useState(installStore.hasPrompt());
  const [showHelp, setShowHelp] = useState(false);
  const [installed, setInstalled] = useState(isStandalone());

  useEffect(() => {
    const unsub = installStore.subscribe(() => {
      setHasPrompt(installStore.hasPrompt());
      setInstalled(isStandalone());
    });
    return unsub;
  }, []);

  if (installed) return null;

  const onClick = async () => {
    if (hasPrompt) {
      const ok = await installStore.prompt();
      if (!ok) setShowHelp(true);
    } else {
      setShowHelp(true);
    }
  };

  const plat = detectPlatform();
  const steps = STEPS[plat] || STEPS.desktop;

  return (
    <>
      {variant === "sidebar" ? (
        <button
          data-testid="install-app-sidebar"
          onClick={onClick}
          className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-xs font-700 border border-[var(--hl-cue)] text-[var(--hl-cue)] bg-[rgba(58,160,255,0.08)] hover:bg-[rgba(58,160,255,0.16)] transition"
          title="Install this studio on your device (Windows, Mac, iPad, Android)"
        >
          <MonitorDown size={15} /> Install to this device
        </button>
      ) : (
        <button
          data-testid="install-app-header"
          onClick={onClick}
          className="h-9 px-3 flex items-center gap-1.5 rounded-md border border-[var(--hl-cue)] text-[var(--hl-cue)] bg-[rgba(58,160,255,0.08)] hover:bg-[rgba(58,160,255,0.16)] text-xs font-700 transition"
          title="Install this studio on your device (Windows, Mac, iPad, Android)"
        >
          <Download size={15} /> <span className="hidden sm:inline">Install app</span>
        </button>
      )}

      {showHelp && (
        <div
          className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm grid place-items-center p-4"
          data-testid="install-help-modal"
          onMouseDown={(e) => e.target === e.currentTarget && setShowHelp(false)}
        >
          <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 grid place-items-center rounded-lg hl-fire-gradient">
                  <Radio size={16} className="text-white" />
                </div>
                <h2 className="font-display text-lg">Install on {PLATFORM_LABEL[plat]}</h2>
              </div>
              <button
                data-testid="install-help-close"
                onClick={() => setShowHelp(false)}
                className="h-8 w-8 grid place-items-center rounded hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {hasPrompt && (
                <button
                  data-testid="install-help-prompt"
                  onClick={async () => {
                    await installStore.prompt();
                    setShowHelp(false);
                  }}
                  className="w-full h-11 rounded-lg hl-fire-gradient text-white font-700 flex items-center justify-center gap-2"
                >
                  <Download size={17} /> Install now
                </button>
              )}
              <ol className="space-y-2.5" data-testid="install-help-steps">
                {steps.map((s, i) => (
                  <li key={i} className="flex gap-3 text-sm text-[var(--hl-text)]">
                    <span className="shrink-0 h-6 w-6 grid place-items-center rounded-full bg-[var(--hl-cue)] text-black text-xs font-700">
                      {i + 1}
                    </span>
                    <span className="leading-relaxed">
                      {plat === "ios" && i === 1 ? (
                        <>
                          Tap the <Share size={13} className="inline -mt-0.5 text-[var(--hl-cue)]" /> Share button
                          (the square with an up-arrow).
                        </>
                      ) : (
                        s
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-[var(--hl-muted)] leading-relaxed">
                Once installed, Hot Live 95 launches full-screen like a native app and keeps working
                offline from your device.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
