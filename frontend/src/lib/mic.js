// Microphone device selection + auto-route to a connected Bluetooth mic.
const KEY = "hotlive95_mic_device";

export const getPreferredMicId = () => {
  try {
    return localStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
};

export const setPreferredMicId = (id) => {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
};

// Base capture constraints (broadcast-quality: no processing) + optional device.
export const micConstraints = (extra = {}) => {
  const id = getPreferredMicId();
  const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...extra };
  if (id) base.deviceId = { exact: id };
  return base;
};

export const listMics = async () => {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Microphone ${i + 1}` }));
  } catch {
    return [];
  }
};

const BT_HINTS = ["bluetooth", "airpods", "buds", "headset", "hands-free", "wireless", "bt "];
export const isBluetoothLabel = (label = "") => {
  const l = label.toLowerCase();
  return BT_HINTS.some((h) => l.includes(h));
};

// Pick the best default when none chosen: a Bluetooth mic if present.
export const autoBluetoothMic = (mics) => mics.find((m) => isBluetoothLabel(m.label)) || null;
