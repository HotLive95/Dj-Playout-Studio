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

  // Electron only: opens a native dialog, copies files to the flash-drive data
  // folder, and returns track descriptors. Browser uses an <input> instead.
  async importViaDialog() {
    if (isElectron) {
      return await window.hotlive.pickFiles();
    }
    return null;
  },

  async getUrl(track) {
    if (!track) return null;
    if (track.path) {
      return `hlmedia://${encodeURI(track.path.replace(/\\/g, "/"))}`;
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
