# 🔥 Hot Live 95 — DJ Playout Studio

An **offline desktop app** for Hot Live 95 Detroit A.I. Radio DJs. Build MP3/WAV
playlists for live playout, rearrange them by drag-and-drop, and remove/replace
tracks in seconds. Everything is saved automatically so your show is ready when
you are. Runs fully offline and can be shared with your DJs on a flash drive.

## What it does
- 🎵 **Load MP3 & WAV files** into playlists
- ↕️ **Drag-and-drop reorder** tracks
- ♻️ **Remove or replace** any track in one click
- 📻 **Live playout controls**: play / pause / next / previous + seek bar
- ⏭️ **Auto-play** the next track (continuous playout)
- 🎚️ **Crossfade** between tracks (1–10s, adjustable)
- ⏱️ **Per-track duration + total show runtime**
- 🗂️ **Multiple playlists** (create / rename / delete)
- 💾 **Auto-save** — playlists + audio persist between sessions (and on the flash drive)

---

## For DJs — just run it
Copy the app onto your flash drive and hand it to your DJs.

- **Windows:** double-click **`HotLive95-Playout-Portable.exe`** — no install needed, runs straight from the stick.
- **Mac:** open **`HotLive95-Playout.dmg`** and drag the app to Applications (or run it from the drive).

Your playlists and imported audio are stored in a `HotLive95Data` folder next to the app, so they travel with the flash drive.

---

## Building the shareable app
See **[BUILD_GUIDE.md](./BUILD_GUIDE.md)** for step-by-step instructions to produce
the Windows `.exe` and the Mac `.dmg`.

## Project layout
```
frontend/   React UI (the player) — also runs in a browser for preview
electron/   Electron wrapper that turns the UI into the offline desktop app
```
