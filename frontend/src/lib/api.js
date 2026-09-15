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

  adminCreate: (token, dj, maxDevices, expiresAt, email) =>
    post("/api/admin/keys", { dj, email, max_devices: maxDevices, expires_at: expiresAt }, token),
  adminRenew: (token, key, days) => post(`/api/admin/keys/${key}/renew`, { days }, token),
  adminResendEmail: (token, key) => post(`/api/admin/keys/${key}/resend-email`, {}, token),
  adminRunExpiryCheck: (token) => post(`/api/admin/run-expiry-check`, {}, token),
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
