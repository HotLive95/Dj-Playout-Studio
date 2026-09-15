# Hot Live 95 — DJ Playout Studio (PRD)

## Original problem statement
Build an app to create a music playlist for LIVE radio playout: upload MP3 & WAV
files, easily rearrange them, and easily remove/replace files. Must be a
**downloadable offline desktop app** that can be shared with DJs on a **flash drive**
for "Hot Live 95 Detroit A.I. Radio".

## User choices (2026-06)
- True offline desktop app (.exe for Windows / .dmg for Mac) — Electron
- Target both Windows and Mac
- Features: multiple playlists (save/load), track duration + total time,
  crossfade/gapless, auto-play next, play/pause/next/prev + progress bar
- Playlists + audio persist automatically (stored on the flash drive)
- Branding: Hot Live 95 logo, dark "radio console" style, fiery orange/red

## Architecture
- `frontend/` — React (CRA/craco) UI = the player. Runs in a browser (preview +
  QA) AND is bundled inside Electron. Storage abstraction in `src/lib/platform.js`:
  - Browser mode: audio blobs in IndexedDB (`src/lib/db.js`), playlist metadata in
    localStorage (`hotlive95_state`).
  - Electron mode: files copied to `<flashdrive>/HotLive95Data/media`, state.json on
    disk, served via custom `hlmedia://` protocol.
  - `src/lib/audioEngine.js` — dual `<audio>` element crossfade + autoplay engine.
- `electron/` — Electron wrapper (`main.js`, `preload.js`), electron-builder config
  in `package.json`, `build.sh`, icons in `build-assets/`.
- No backend / MongoDB / auth used (fully client-side, offline).

## Implemented (2026-06) — all verified by testing agent (12/12 flows, 100%)
- Playlist create / rename / delete / switch (multiple playlists)
- Add MP3/WAV (multi-select), per-track duration + total runtime
- Drag-and-drop reorder, remove, replace-in-place
- Play/pause/next/prev, seek bar, volume/mute
- Auto-play next + adjustable crossfade (1–10s)
- Auto-persist across sessions/reloads
- Hot Live 95 dark radio-console UI + generated logo/icon
- Electron wrapper packages successfully (asar bundles UI+main+preload+icons);
  build scripts + BUILD_GUIDE.md for Windows .exe (portable) and Mac .dmg

## Backlog / Next
- P1: Waveform display + auto cue-point (trim leading/trailing silence)
- P2: Save/export a playlist as a portable file to share between DJs
- P2: Mic/voice-track ducking during talk breaks
- P2: Scheduling / clock automation for unattended playout

## Update 2 (2026-06) — verified by testing agent (16/16 assertions, 100%)
- Cue / headphone pre-listen: independent preview channel per track + Air-out / Cue-out
  device routing (setSinkId). Files: `audioEngine.js` (cue element + sinks), `CuePanel.js`.
- Live hotkeys: Space play/pause, ←/→ prev/next, ↑/↓ volume, C stop-cue (ignored while typing).
- Drag MP3/WAV from the OS into the playlist (browser + Electron via `import-paths` IPC).
- Signed-build support: env-driven Windows (CSC_LINK) + macOS notarization (`notarize.js`,
  entitlements, hardened runtime); documented in BUILD_GUIDE.md.
- Logo refreshed to the flame emblem wordmark ("HOT LIVE 95 / DETROIT · A.I. RADIO").
