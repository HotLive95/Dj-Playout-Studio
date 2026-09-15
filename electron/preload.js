const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("hotlive", {
  isElectron: true,
  pickFiles: () => ipcRenderer.invoke("pick-files"),
  loadState: () => ipcRenderer.invoke("load-state"),
  saveState: (state) => ipcRenderer.invoke("save-state", state),
  deleteFile: (filePath) => ipcRenderer.invoke("delete-file", filePath),
});
