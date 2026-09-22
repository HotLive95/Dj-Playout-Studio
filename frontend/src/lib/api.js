// Licensing API (optional online activation). Falls back to offline keys when the
// server is unreachable, so the flash-drive app still works with no internet.
// In the packaged Electron app, window.hotlive.licenseServer (from license-server.txt
// or the HL_LICENSE_SERVER env) points DJs at the owner's hosted backend.
const BASE =
  (typeof window !== "undefined" && window.hotlive && window.hotlive.licenseServer) ||
  process.env.REACT_APP_BACKEND_URL;

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { "X-Admin-Token": token } : {}) },
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const api = {
  activate: (key, deviceId) => post("/api/activate", { key, device_id: deviceId }),
  validate: (key, deviceId) => post("/api/validate", { key, device_id: deviceId }),
  status: (key, deviceId) => post("/api/status", { key, device_id: deviceId || null }),

  getNowPlaying: async () => {
    const res = await fetch(`${BASE}/api/nowplaying`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  setNowPlaying: (title, artist, art, next) =>
    post("/api/nowplaying", {
      title,
      artist,
      art,
      next_title: next?.title || null,
      next_artist: next?.artist || null,
      next_art: next?.art || null,
    }),

  transcribe: async (blob, filename = "take.webm") => {
    const fd = new FormData();
    fd.append("file", blob, filename);
    const res = await fetch(`${BASE}/api/transcribe`, { method: "POST", body: fd });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  // Cloud Handoff: upload a whole show, get a short code + expiry back.
  uploadShow: async (payload, pin, email, alertOnOpen) => {
    const res = await fetch(`${BASE}/api/shows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, pin: pin || null, email: email || null, alert_on_open: alertOnOpen !== false }),
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.detail) msg = j.detail;
      } catch {
        /* ignore */
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },
  // Resumable chunked upload so large (up to 500 MB) shares go through the browser.
  uploadShowChunked: async (payloadObj, pin, email, alertOnOpen, onProgress) => {
    const raw = new TextEncoder().encode(JSON.stringify(payloadObj));
    const total = raw.length;
    const parse = async (res, fallback) => {
      let msg = fallback || `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.detail) msg = j.detail;
      } catch {
        /* ignore */
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    };
    const initRes = await fetch(`${BASE}/api/shows/upload/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_size: total, total_chunks: 1 }),
    });
    if (!initRes.ok) await parse(initRes);
    const { upload_id, chunk_size } = await initRes.json();
    const CHUNK = chunk_size || 5 * 1024 * 1024;
    const totalChunks = Math.max(1, Math.ceil(total / CHUNK));
    for (let i = 0; i < totalChunks; i++) {
      const slice = raw.slice(i * CHUNK, Math.min(total, (i + 1) * CHUNK));
      // eslint-disable-next-line no-await-in-loop
      const cRes = await fetch(`${BASE}/api/shows/upload/${upload_id}/chunk`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream", "X-Chunk-Index": String(i) },
        body: slice,
      });
      if (!cRes.ok) await parse(cRes, "Upload interrupted — check your connection and try again.");
      if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 96));
    }
    const done = await fetch(`${BASE}/api/shows/upload/${upload_id}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: pin || null, email: email || null, alert_on_open: alertOnOpen !== false }),
    });
    if (!done.ok) await parse(done);
    if (onProgress) onProgress(100);
    return done.json();
  },
  fetchShow: async (code, pin) => {
    const res = await fetch(`${BASE}/api/shows/${encodeURIComponent(code)}`, {
      headers: pin ? { "X-Show-PIN": pin } : {},
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.detail) msg = j.detail;
      } catch {
        /* ignore */
      }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.json();
  },
  extendShow: async (code) => {
    const res = await fetch(`${BASE}/api/shows/${encodeURIComponent(code)}/extend`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  showStats: async (code) => {
    const res = await fetch(`${BASE}/api/shows/${encodeURIComponent(code)}/stats`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },

  adminCreate: (token, dj, maxDevices, expiresAt, email) =>
    post("/api/admin/keys", { dj, email, max_devices: maxDevices, expires_at: expiresAt }, token),
  adminRenew: (token, key, days) => post(`/api/admin/keys/${key}/renew`, { days }, token),
  adminAutoRenew: (token, key, enabled, days) => post(`/api/admin/keys/${key}/auto-renew`, { enabled, days }, token),
  adminResendEmail: (token, key) => post(`/api/admin/keys/${key}/resend-email`, {}, token),
  adminRunExpiryCheck: (token) => post(`/api/admin/run-expiry-check`, {}, token),
  adminGetSettings: async (token) => {
    const res = await fetch(`${BASE}/api/admin/settings`, { headers: { "X-Admin-Token": token } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  adminSetSettings: (token, alertLeadDays) => post(`/api/admin/settings`, { alert_lead_days: alertLeadDays }, token),
  adminList: async (token) => {
    const res = await fetch(`${BASE}/api/admin/keys`, { headers: { "X-Admin-Token": token } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  adminRevoke: (token, key, revoked) => post(`/api/admin/keys/${key}/revoke`, { revoked }, token),
  adminFreeDevice: async (token, key, deviceId) => {
    const res = await fetch(`${BASE}/api/admin/keys/${key}/devices/${deviceId}`, {
      method: "DELETE",
      headers: { "X-Admin-Token": token },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  adminDelete: async (token, key) => {
    const res = await fetch(`${BASE}/api/admin/keys/${key}`, {
      method: "DELETE",
      headers: { "X-Admin-Token": token },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};
