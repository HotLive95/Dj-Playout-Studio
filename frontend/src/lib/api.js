// Licensing API (optional online activation). Falls back to offline keys when the
// server is unreachable, so the flash-drive app still works with no internet.
const BASE = process.env.REACT_APP_BACKEND_URL;

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

  adminCreate: (token, dj, maxDevices, expiresAt) =>
    post("/api/admin/keys", { dj, max_devices: maxDevices, expires_at: expiresAt }, token),
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
