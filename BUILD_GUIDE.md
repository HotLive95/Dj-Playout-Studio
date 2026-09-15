# 🛠️ Build Guide — Hot Live 95 Playout Studio (flash-drive app)

This turns the app into a shareable desktop program for your DJs. You build the
**Windows** version on a Windows PC and the **Mac** version on a Mac (this is how
all cross-platform desktop apps work — a Mac app can only be produced on a Mac).

Each build only takes a couple of minutes.

---

## 0. One-time setup (both platforms)
Install **Node.js LTS** (https://nodejs.org) and **Yarn** (`npm install -g yarn`).

Copy the whole project folder (the one containing `frontend/` and `electron/`) to
the machine you're building on.

---

## 🪟 Build the Windows app (.exe)
On a **Windows PC**, open **PowerShell** in the project folder and run:

```powershell
cd frontend
$env:PUBLIC_URL="./"; yarn install; yarn build
xcopy /E /I /Y build ..\electron\renderer
cd ..\electron
yarn install
yarn dist:win
```

Result in **`electron/dist`**:
- **`HotLive95-Playout-Portable.exe`** ← put THIS on the flash drive (no install, double-click to run)
- `HotLive95-Playout-Setup-1.0.0.exe` ← optional traditional installer

---

## 🍎 Build the Mac app (.dmg)
On a **Mac**, open **Terminal** in the project folder and run:

```bash
cd frontend
PUBLIC_URL=./ yarn install && yarn build
rm -rf ../electron/renderer && cp -r build ../electron/renderer
cd ../electron
yarn install
yarn dist:mac
```

Result in **`electron/dist`**:
- **`HotLive95-Playout-1.0.0.dmg`** ← share this with Mac DJs
- `Hot Live 95 Playout Studio-1.0.0-mac.zip` ← optional zipped app

> First launch on Mac: right-click the app → **Open** (it's unsigned, so this
> bypasses Gatekeeper the first time).

---

## ⚡ Shortcut script (Mac / Linux / Git-Bash on Windows)
From the `electron/` folder you can also run:
```bash
./build.sh win     # Windows portable + installer (run on Windows)
./build.sh mac     # macOS dmg + zip (run on Mac)
./build.sh linux   # Linux AppImage
./build.sh         # build for the current OS
```

---

## 📦 Putting it on the flash drive
1. Copy the built app (`HotLive95-Playout-Portable.exe` for Windows and/or the
   `.dmg` for Mac) onto the flash drive.
2. Hand it to your DJs. On first run a **`HotLive95Data`** folder is created next
   to the app to hold playlists + audio, so the whole show travels with the stick.

## 🔧 Notes
- The app is fully **offline** — no internet required at showtime.
- Supported audio: **.mp3** and **.wav**.
- Icons live in `electron/build-assets/` (`icon.png`, `icon.ico`). Replace them to rebrand.
