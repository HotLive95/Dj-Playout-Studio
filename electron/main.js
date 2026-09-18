// Hot Live 95 — DJ Playout Studio  |  Electron main process (offline desktop app)
const { app, BrowserWindow, ipcMain, dialog, protocol, net } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

// Register our media scheme as privileged so the renderer can stream local audio.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "hlmedia",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
]);

// All playlists + audio live in a "HotLive95Data" folder. When the app runs as a
// portable .exe from a flash drive, PORTABLE_EXECUTABLE_DIR points to the drive,
// so the whole show travels with the stick.
function dataDir() {
  const base = process.env.PORTABLE_EXECUTABLE_DIR || app.getPath("userData");
  const dir = path.join(base, "HotLive95Data");
  fs.mkdirSync(path.join(dir, "media"), { recursive: true });
  return dir;
}
const statePath = () => path.join(dataDir(), "state.json");
const mediaDir = () => path.join(dataDir(), "media");

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: "#0a0a0c",
    title: "Hot Live 95 — DJ Playout Studio",
    icon: path.join(
      __dirname,
      "build-assets",
      process.platform === "win32" ? "icon.ico" : "icon.png"
    ),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  protocol.handle("hlmedia", (request) => {
    try {
      // URL form: hlmedia://local/<encodeURIComponent(full native path)>
      const u = new URL(request.url);
      let filePath = decodeURIComponent(u.pathname.replace(/^\//, ""));
      // Auto re-link: if the stored path no longer resolves (e.g. the flash drive
      // was assigned a different letter), fall back to the same file (by name) in
      // the CURRENT data folder — so shows never break when the stick moves.
      if (!fs.existsSync(filePath)) {
        const alt = path.join(mediaDir(), path.basename(filePath));
        if (fs.existsSync(alt)) filePath = alt;
      }
      // pathToFileURL correctly handles Windows drive letters/backslashes and
      // POSIX absolute paths, so files resolve from any flash-drive letter.
      return net.fetch(pathToFileURL(filePath).href);
    } catch {
      return new Response("", { status: 404 });
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ---- IPC: file picking, persistence, deletion ----
ipcMain.handle("pick-files", async () => {
  const res = await dialog.showOpenDialog({
    title: "Add MP3 / WAV files",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Audio", extensions: ["mp3", "wav"] }],
  });
  if (res.canceled) return [];
  return res.filePaths.map((fp) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext = path.extname(fp) || ".mp3";
    const dest = path.join(mediaDir(), id + ext);
    fs.copyFileSync(fp, dest);
    const stat = fs.statSync(dest);
    return { id, name: path.basename(fp), path: dest, size: stat.size };
  });
});

// Import files dragged from the OS into the playlist (copies to the data folder).
ipcMain.handle("import-paths", async (_e, paths) => {
  const out = [];
  for (const fp of paths || []) {
    try {
      const ext = path.extname(fp).toLowerCase();
      if (ext !== ".mp3" && ext !== ".wav") continue;
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const dest = path.join(mediaDir(), id + ext);
      fs.copyFileSync(fp, dest);
      const stat = fs.statSync(dest);
      out.push({ id, name: path.basename(fp), path: dest, size: stat.size });
    } catch {
      /* skip bad file */
    }
  }
  return out;
});

// Save an edited/imported audio buffer (Uint8Array) to the media folder.
ipcMain.handle("save-media", async (_e, name, bytes) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ext = path.extname(name) || ".wav";
  const dest = path.join(mediaDir(), id + ext);
  fs.writeFileSync(dest, Buffer.from(bytes));
  const stat = fs.statSync(dest);
  return { id, name, path: dest, size: stat.size };
});

ipcMain.handle("load-state", async () => {
  try {
    return JSON.parse(fs.readFileSync(statePath(), "utf-8"));
  } catch {
    return null;
  }
});

ipcMain.handle("save-state", async (_e, state) => {
  try {
    fs.writeFileSync(statePath(), JSON.stringify(state));
  } catch {
    /* ignore */
  }
  return true;
});

ipcMain.handle("delete-file", async (_e, p) => {
  try {
    fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
  return true;
});

// Whether a track's file exists — at its stored path, or (auto re-link) by the
// same filename in the current data folder if the drive letter changed.
ipcMain.handle("file-exists", async (_e, p) => {
  try {
    if (p && fs.existsSync(p)) return true;
    if (p && fs.existsSync(path.join(mediaDir(), path.basename(p)))) return true;
  } catch {
    /* ignore */
  }
  return false;
});

const licensePath = () => path.join(dataDir(), "license.json");
ipcMain.handle("get-license", async () => {
  try {
    return JSON.parse(fs.readFileSync(licensePath(), "utf-8"));
  } catch {
    return null;
  }
});
ipcMain.handle("set-license", async (_e, lic) => {
  try {
    fs.writeFileSync(licensePath(), JSON.stringify(lic));
  } catch {
    /* ignore */
  }
  return true;
});

// Machine fingerprint derived from hardware/OS (NOT stored in the app folder, so a
// copied folder on another PC yields a different id and must re-activate).
ipcMain.handle("get-device-id", async () => {
  let cpu = "";
  try {
    cpu = (os.cpus()[0] || {}).model || "";
  } catch {
    cpu = "";
  }
  const raw = [os.hostname(), os.platform(), os.arch(), cpu, os.totalmem(), os.userInfo().username].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
});
