// Local history of Cloud Handoff shares (sent + received) so DJs can reopen past
// handoffs and get warned before a link they sent expires. Stored per-device.
const KEY = "hotlive95_cloud_history";
const DISMISS_KEY = "hotlive95_expiry_dismissed";

export function loadHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function addHistory(entry) {
  if (!entry?.code) return;
  const list = loadHistory().filter((h) => !(h.code === entry.code && h.dir === entry.dir));
  list.unshift({ at: new Date().toISOString(), ...entry });
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
}

export function removeHistory(code, dir) {
  const list = loadHistory().filter((h) => !(h.code === code && h.dir === dir));
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function loadDismissed() {
  try {
    const list = JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function dismissExpiry(code) {
  const list = loadDismissed();
  if (!list.includes(code)) list.push(code);
  localStorage.setItem(DISMISS_KEY, JSON.stringify(list));
}
