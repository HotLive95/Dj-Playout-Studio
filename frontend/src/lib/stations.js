// Multi-station model + persistence for Hot Live 95 DJ Playout Studio.
// A "station" bundles its live-source connection, public stream/status URLs and
// branding. Stations are stored locally and (their public parts) mirrored to the
// backend so each /live?station=<id> player shows the right branding + now-playing.
const LS_KEY = "hotlive95_stations";

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function blankStation(overrides = {}) {
  return {
    id: rid(),
    name: "New Station",
    tagline: "",
    color: "#ff5a1f",
    logo: null,
    host: "",
    port: 8000,
    password: "",
    username: "source",
    mount: "/",
    bitrate: 128,
    includeMic: true,
    streamUrl: "",
    statusUrl: "",
    ...overrides,
  };
}

function migrate() {
  const list = [];
  try {
    const presets = JSON.parse(localStorage.getItem("hotlive95_radioco_presets") || "[]");
    if (Array.isArray(presets)) {
      presets.forEach((p) =>
        list.push(
          blankStation({
            id: p.id || rid(),
            name: p.name || p.label || "Station",
            host: (p.host || "").trim(),
            port: Number(p.port) || 8000,
            password: p.password || "",
            username: (p.username || "").trim() || "source",
            mount: p.mount || "/",
            bitrate: Number(p.bitrate) || 128,
            includeMic: p.includeMic !== false,
            statusUrl: p.statsUrl || "",
          })
        )
      );
    }
  } catch {
    /* ignore */
  }
  // Fold in the single active connection + public stream/status URLs.
  try {
    const cfg = JSON.parse(localStorage.getItem("hotlive95_radioco") || "{}");
    const stream = localStorage.getItem("hotlive95_stream_url") || "";
    const status = localStorage.getItem("hotlive95_status_url") || "";
    const host = (cfg.host || "").trim();
    if (host || stream || status) {
      const match = list.find((s) => s.host === host && String(s.port) === String(cfg.port || ""));
      if (match) {
        if (!match.streamUrl && stream) match.streamUrl = stream;
        if (!match.statusUrl && status) match.statusUrl = status;
      } else if (host) {
        list.push(
          blankStation({
            name: cfg.name || "Hot Live 95",
            tagline: "Detroit · A.I. Radio",
            host,
            port: Number(cfg.port) || 8000,
            password: cfg.password || "",
            username: (cfg.username || "").trim() || "source",
            mount: cfg.mount || "/",
            bitrate: Number(cfg.bitrate) || 128,
            includeMic: cfg.includeMic !== false,
            streamUrl: stream,
            statusUrl: status,
          })
        );
      } else if (stream || status) {
        list.push(blankStation({ name: "Hot Live 95", tagline: "Detroit · A.I. Radio", streamUrl: stream, statusUrl: status }));
      }
    }
  } catch {
    /* ignore */
  }
  if (!list.length) list.push(blankStation({ name: "Hot Live 95", tagline: "Detroit · A.I. Radio" }));
  saveStations(list);
  return list;
}

export function loadStations() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) || "null");
    if (Array.isArray(raw)) return raw;
  } catch {
    /* ignore */
  }
  return migrate();
}

export function saveStations(list) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

// The config object the WSS relay / test endpoint expect.
export function stationWsConfig(s) {
  return {
    host: (s.host || "").trim(),
    port: Number(s.port) || 0,
    password: s.password || "",
    name: (s.name || "Live").trim(),
    genre: "Various",
    bitrate: Number(s.bitrate) || 128,
    username: (s.username || "").trim() || "source",
    mount: (s.mount || "/").trim() || "/",
  };
}

// Public fields mirrored to the backend for /live players.
export function stationPublic(s) {
  return {
    id: s.id,
    name: s.name || "",
    tagline: s.tagline || "",
    color: s.color || "#ff5a1f",
    logo: s.logo || null,
    stream_url: s.streamUrl || "",
    status_url: s.statusUrl || "",
  };
}

// Downscale an uploaded logo to a small square-ish data URL (branding only).
export function downscaleLogo(file, max = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        if (w > max || h > max) {
          const r = Math.min(max / w, max / h);
          w = Math.round(w * r);
          h = Math.round(h * r);
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
