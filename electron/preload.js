const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

// The studio owner deploys the licensing backend and drops its public URL into
// `HotLive95Data/license-server.txt` on the flash drive (or sets HL_LICENSE_SERVER).
// DJs' copies then activate/validate against that hosted server over the internet.
function readLicenseServer() {
  try {
    if (process.env.HL_LICENSE_SERVER) return process.env.HL_LICENSE_SERVER.trim();
    const base = process.env.PORTABLE_EXECUTABLE_DIR || "";
    const p = path.join(base, "HotLive95Data", "license-server.txt");
    return fs.readFileSync(p, "utf-8").trim();
  } catch {
    return "";
  }
}

contextBridge.exposeInMainWorld("hotlive", {
  isElectron: true,
  licenseServer: readLicenseServer(),
  pickFiles: () => ipcRenderer.invoke("pick-files"),
  importPaths: (paths) => ipcRenderer.invoke("import-paths", paths),
  saveMedia: (name, bytes) => ipcRenderer.invoke("save-media", name, bytes),
  loadState: () => ipcRenderer.invoke("load-state"),
  saveState: (state) => ipcRenderer.invoke("save-state", state),
  getLicense: () => ipcRenderer.invoke("get-license"),
  setLicense: (lic) => ipcRenderer.invoke("set-license", lic),
  getDeviceId: () => ipcRenderer.invoke("get-device-id"),
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),
});
