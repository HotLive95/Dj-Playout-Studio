// Backup helpers for Hot Live 95 DJ Playout Studio.
// - On desktop Chromium (File System Access API) the DJ can connect a folder
//   once; we persist the directory handle in IndexedDB and write playlist files
//   into it automatically. On iPad/iOS Safari (no FSA) the studio falls back to
//   the one-tap "Back Up All" that downloads the files (DJ picks iCloud Drive).
const DB_NAME = "hotlive95_backup";
const STORE = "handles";
const KEY = "dir";

export function fsaSupported() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, val) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function ensurePermission(handle, mode = "readwrite") {
  if (!handle) return false;
  try {
    const opts = { mode };
    if ((await handle.queryPermission(opts)) === "granted") return true;
    if ((await handle.requestPermission(opts)) === "granted") return true;
  } catch {
    /* older impls */
  }
  return false;
}

// Prompt the DJ to pick a backup folder; persist the handle for next time.
export async function pickBackupDir() {
  if (!fsaSupported()) return null;
  const handle = await window.showDirectoryPicker({ id: "hotlive95-backup", mode: "readwrite" });
  if (handle) await idbSet(KEY, handle);
  return handle;
}

// Return the saved folder handle if we still have read/write permission.
export async function getBackupDir({ prompt = false } = {}) {
  if (!fsaSupported()) return null;
  const handle = await idbGet(KEY);
  if (!handle) return null;
  const ok = prompt ? await ensurePermission(handle) : (await handle.queryPermission({ mode: "readwrite" })) === "granted";
  return ok ? handle : { handle, needsPermission: true };
}

export async function forgetBackupDir() {
  await idbDel(KEY);
}

// Write one file (overwrites) into the connected folder.
export async function writeFileToDir(dirHandle, filename, blob) {
  const fh = await dirHandle.getFileHandle(filename, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
}

// Read all .hl95playlist files from the connected folder as File objects.
export async function listBackupFilesFSA(dirHandle) {
  const out = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === "file" && /\.hl95playlist$/i.test(name)) {
      try {
        out.push(await handle.getFile());
      } catch {
        /* skip */
      }
    }
  }
  return out;
}
