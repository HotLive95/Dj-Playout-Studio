const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hotlive", {
  isElectron: true,
  pickFiles: () => ipcRenderer.invoke("pick-files"),
  importPaths: (paths) => ipcRenderer.invoke("import-paths", paths),
  saveMedia: (name, bytes) => ipcRenderer.invoke("save-media", name, bytes),
  loadState: () => ipcRenderer.invoke("load-state"),
  saveState: (state) => ipcRenderer.invoke("save-state", state),
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),
});
