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
- P2: MP3 export via Web Worker for very long tracks
- P2: License-key activation + per-device lock (anti-piracy) — offered to user
- P2: Validate imported .hlp.json schema; validate schedule end > start

## Update 4 (2026-06) — verified by testing agent (8/8 flows, 100%)
- Main waveform on the on-air seek bar (PlayerBar renders `Waveform` from decoded peaks,
  cached per track; click-to-seek). `computePeaks` in `audioProcessing.js`.
- Voice tracking: `VoiceRecorder.js` records via MediaRecorder, decodes to WAV, inserts at a
  chosen playlist position (`saveVoiceTrack` in `App.js`).
- Weekly scheduler: `ScheduleModal.js` adds day-of-week toggles; scheduler skips days not
  selected (empty = every day).
- Instant jingles: `JingleBar.js` — 6 assignable pads, click or number keys 1-6 fire drops
  over the music on independent audio elements; persisted in saved state.

## Update 3 (2026-06) — verified by testing agent (16/16 assertions, 100%)
- Track Editor: trim in/out + multi-section cut + auto-trim silence; preview; export
  WAV/MP3 (client-side, `audioProcessing.js` using `@breezystack/lamejs`); Save-to-playlist
  or Download. Files: `TrackEditor.js`, `Waveform.js`.
- Waveform view inside editor (canvas, `Waveform.js`).
- Silence Trim playout toggle — engine skips leading/trailing dead air using
  per-track leadIn/tailStart (`detectSilence`), wired in `audioEngine.js`.
- Share Playlists: export current playlist to self-contained `.hlp.json` (base64 audio)
  and import it back (`exportPlaylist`/`importPlaylist` in `App.js`). Round-trip verified.
- Talk Ducking: manual TALK button (+ hotkey T) and live mic auto-duck (getUserMedia +
  AnalyserNode RMS) — `engine.setDuck`, mic effect in `App.js`.
- Scheduled auto start/stop per show (per-playlist `schedule`, 1s scheduler tick),
  `ScheduleModal.js`. Persists across reloads.
- YouTube ripper: intentionally SKIPPED per user (ToS/offline constraints).
- Electron: added `import-paths` and `save-media` IPC for OS drag-import + saving edits.

## Update 2 (2026-06) — verified by testing agent (16/16 assertions, 100%)
- Cue / headphone pre-listen: independent preview channel per track + Air-out / Cue-out
  device routing (setSinkId). Files: `audioEngine.js` (cue element + sinks), `CuePanel.js`.
- Live hotkeys: Space play/pause, ←/→ prev/next, ↑/↓ volume, C stop-cue (ignored while typing).
- Drag MP3/WAV from the OS into the playlist (browser + Electron via `import-paths` IPC).
- Signed-build support: env-driven Windows (CSC_LINK) + macOS notarization (`notarize.js`,
  entitlements, hardened runtime); documented in BUILD_GUIDE.md.
- Logo refreshed to the flame emblem wordmark ("HOT LIVE 95 / DETROIT · A.I. RADIO").
