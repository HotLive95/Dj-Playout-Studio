// Platform abstraction: runs in the browser (preview/testing) and inside
// Electron (offline desktop build for the flash drive). The same React app
// powers both; only storage + file access differ.
import { getBlob, deleteBlob } from "./db";

const isElectron =
  typeof window !== "undefined" && !!window.hotlive && window.hotlive.isElectron;

const urlCache = new Map();

export const platform = {
  isElectron,

  async loadState() {
    if (isElectron) {
      try {
        return await window.hotlive.loadState();
      } catch {
        return null;
      }
    }
    try {
      return JSON.parse(localStorage.getItem("hotlive95_state") || "null");
    } catch {
      return null;
    }
  },

  async saveState(state) {
    if (isElectron) {
      try {
        await window.hotlive.saveState(state);
      } catch {
        /* ignore */
      }
      return;
    }
    localStorage.setItem("hotlive95_state", JSON.stringify(state));
  },

  async getLicense() {
    if (isElectron) {
      try {
        return await window.hotlive.getLicense();
      } catch {
        return null;
      }
    }
    try {
      return JSON.parse(localStorage.getItem("hotlive95_license") || "null");
    } catch {
      return null;
    }
  },

  async setLicense(lic) {
    if (isElectron) {
      try {
        await window.hotlive.setLicense(lic);
      } catch {
        /* ignore */
      }
      return;
    }
    localStorage.setItem("hotlive95_license", JSON.stringify(lic));
  },

  async getDeviceId() {
    if (isElectron) {
      try {
        return await window.hotlive.getDeviceId();
      } catch {
        return "electron-unknown";
      }
    }
    let id = localStorage.getItem("hotlive95_device");
    if (!id) {
      id = (crypto.randomUUID && crypto.randomUUID()) || `dev-${Date.now()}-${Math.random()}`;
      localStorage.setItem("hotlive95_device", id);
    }
    return id;
  },

  // Electron only: native dialog -> copies files to the flash-drive data folder.
  async importViaDialog() {
    if (isElectron) return await window.hotlive.pickFiles();
    return null;
  },

  // Electron only: import files dragged from the OS by their paths.
  async importPaths(paths) {
    if (isElectron) return await window.hotlive.importPaths(paths);
    return null;
  },

  // Electron only: write an edited/imported blob to the media folder.
  async saveMedia(name, blob) {
    if (isElectron) {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return await window.hotlive.saveMedia(name, bytes);
    }
    return null;
  },

  async getUrl(track) {
    if (!track) return null;
    if (track.path) {
      // Fixed host + the FULL native path encoded into one path segment. This
      // avoids the drive letter (E:, F:) being parsed as the URL authority,
      // which Chromium lowercases and strips the colon from — breaking file
      // resolution for portable .exe copies run from a flash drive on Windows.
      return `hlmedia://local/${encodeURIComponent(track.path)}`;
    }
    if (urlCache.has(track.id)) return urlCache.get(track.id);
    const blob = await getBlob(track.id);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlCache.set(track.id, url);
    return url;
  },

  async deleteFile(track) {
    if (isElectron && track.path) {
      try {
        await window.hotlive.deleteFile(track.path);
      } catch {
        /* ignore */
      }
      return;
    }
    if (urlCache.has(track.id)) {
      URL.revokeObjectURL(urlCache.get(track.id));
      urlCache.delete(track.id);
    }
    await deleteBlob(track.id);
  },
};
