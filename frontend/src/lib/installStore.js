// Captures the PWA install prompt globally (the beforeinstallprompt event fires
// once, early), so any "Install app" button can offer one-tap install on
// Chrome/Edge. Other platforms (iPad Safari, etc.) fall back to instructions.
let deferred = null;
const subs = new Set();
const notify = () => subs.forEach((fn) => fn());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true);

export const detectPlatform = () => {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/(macintosh)/i.test(ua) && "ontouchend" in document);
  if (isIOS) return "ios";
  if (/android/i.test(ua)) return "android";
  if (/mac/i.test(ua)) return "mac";
  if (/win/i.test(ua)) return "windows";
  return "desktop";
};

export const installStore = {
  hasPrompt: () => !!deferred,
  subscribe: (fn) => {
    subs.add(fn);
    return () => subs.delete(fn);
  },
  async prompt() {
    if (!deferred) return false;
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    deferred = null;
    notify();
    return true;
  },
};
