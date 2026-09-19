# Hot Live 95 — Desktop Build (Windows .exe / Mac .dmg)

This app ships as an **offline desktop app** that runs from a USB flash drive.
You don't need your own PC or Mac to build it — GitHub's cloud machines do it for you.

## 1. Push the code to GitHub
In Emergent, use **Save → Save to GitHub** and pick a repository/branch (e.g. `main`).

## 2. Let the build run
Pushing to `main`/`master` automatically runs the **"Build Desktop Apps"** workflow
(`.github/workflows/build-desktop.yml`). You can also trigger it from the repo's
**Actions** tab → *Build Desktop Apps* → **Run workflow**.

The workflow:
1. Builds the web UI (`frontend`, with relative paths for offline use).
2. Copies it into the Electron shell (`electron/renderer`).
3. Packages a Windows portable **.exe** and a Mac **.dmg** + **.zip**.

## 3. Download your apps
Open the finished workflow run and download the artifacts:
- **hotlive95-windows** → `HotLive95-Playout-Portable.exe`
- **hotlive95-mac** → `HotLive95-Playout-*.dmg`

Copy the file onto your flash drive and run it. All playlists and audio are stored
next to the app in a `HotLive95Data/` folder, so the whole show travels on the stick.

> Tip: pushing a version tag like `v1.0.0` also publishes the files on a **Releases** page.

## Optional — turn on online features (licensing, now-playing, transcription)
The desktop app works fully offline. To enable the online features, deploy the
backend (Emergent **Deploy**) and drop its public URL into a text file on the drive:

```
HotLive95Data/license-server.txt      →  https://your-backend-url
```

(Or set the `HL_LICENSE_SERVER` environment variable.) DJs' copies then activate and
sync against that server. Nothing is baked into the build, so you never rebuild to
change the server.

## Optional — code signing
Builds are **unsigned** by default (on Mac: right-click → Open the first time).
To sign/notarize later, add the standard Apple/Windows certificate secrets to the
repo; `electron/notarize.js` runs automatically when Apple credentials are present.

## Build locally (advanced)
If you have Node 20 installed:

```bash
cd electron
./build.sh win     # or: mac / linux / (no arg = current OS)
```

Output lands in `electron/dist/`.
