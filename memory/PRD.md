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

## Update 6 (2026-06) — verified via UI E2E
- Device Locking: keys bind to a machine fingerprint (Electron `get-device-id` from
  hardware/OS; browser random id). Copied folder on another PC forces re-activation
  (`App.js` license load compares `deviceId`; `LicenseGate` shows locked notice). Verified.
- Cue Auto-Fade: `⌇ Fade` toggle — engine ramps volume down over `cueFadeSeconds` before
  the Out cue / track end (`audioEngine.setCueAutoFade` + `_onTime`).
- FX Presets: Voice FX now includes Radio / Telephone / Stadium (plus Echo/Reverb) via
  filters/waveshaper/convolver in `buildMicGraph`.
- Key Manager (admin): 🔑 header button → passphrase → generate + track keys per DJ.
  Key generation is LOCKED to the owner's registered computer (`KeyManager.js`,
  `KEY_ISSUER_DEVICE` / registered issuer). Verified owner-can-generate + other-machine-blocked.

## Update 14 (2026-06) — stabilization pass (code review + fixes, verified 100%)
- HIGH: audioEngine `_startCrossfade` now fades toward `_effVol()` and re-asserts the duck on the
  new active element at fade end, and cancels a running `_volRaf` at fade start — fixes music
  jumping back to full volume over the DJ's voice on every crossfade during talk/mic/jingle duck.
- MEDIUM: backend startup scheduler task retained in `_scheduler_task` (no GC) + cancelled on shutdown.
- MEDIUM: `ListenLivePage` adds error/stalled/playing/ended listeners (resets playing, shows error).
- LOW: `process_expiry` materializes the query via `.to_list()` before mutating (no double auto-renew);
  `admin_create_key` inserts the key BEFORE sending the welcome email; jingle Audio elements released
  (`src=""`) on end/stop.
- Regression: /app/test_reports/iteration_8.json — backend 17/17 pytest PASS (incl. new
  insert-before-email + no-double-auto-renew tests), frontend 100% testable. No flashing (SW stays
  unregistered in dev). The dev-only `<span> in <option>` console warning is NOT from our source
  (every <option> is plain text) — injected by the test browser tooling; nothing to fix.

## Update 13 (2026-06) — verified
- PWA / installable phone version: added `public/manifest.json` (standalone, theme #ff5a1f,
  icons 192/512 + maskable generated from the app icon/emblem), mobile meta tags + apple-touch-icon
  in `index.html`, and a service worker (`public/sw.js`) registered in `index.js` (skipped in Electron;
  API & hlmedia always pass through, app-shell cached). Verified: manifest loads, SW registers,
  icons 200. DJs open the hosted link on a phone → "Add to Home Screen" → launches standalone.
  NOTE: requires the frontend to be deployed/hosted to be reachable on DJs' phones.

## Update 12 (2026-06) — verified
- Jingle Duck Depth dial: `settings.jingleDuckDepth` (0–0.8), slider in JingleBar; duck level = 1-depth.
- Jingle Duck Speed dial: `settings.jingleDuckMs` (60–900ms), slider in JingleBar; `engine.setDuck(active, level, ms)`
  ramps dip + recover at this speed. Both persist in saved state.

## Update 11 (2026-06) — verified
- Playlist backdrop: replaced carbon-fiber + old emblem with the user's flame+play emblem,
  isolated to transparent (black square & border stripped via PIL) → `/public/hl-emblem.png`,
  faint watermark behind the scrolling track list (`.hl-watermark`).
- Jingle volume: each assigned pad has its own amber volume slider (`jingle-volume-{i}`);
  `j.volume` stored per pad and applied in `playJingle` (`a.volume`).
- QR welcome email: welcome email now embeds an inline QR (cid:licenseqr, generated with
  `qrcode`) + an "Open my license page" button/link to `${PUBLIC_APP_URL}/license?key=...`.
  Env: PUBLIC_APP_URL. Verified email_sent:True with attachment.

## Update 10 (2026-06) — backend curl-verified + UI E2E
- QR License Link: each online key has a QR button (KeyManager) → modal shows a scannable
  QR (`qrcode.react`) to `${origin}/license?key=...` so DJs open their status page on a phone.
- Alert Lead Time: owner dropdown 7/14/30 persisted in Mongo `settings` doc
  (`GET/POST /api/admin/settings`); `process_expiry` uses it (fallback EXPIRY_ALERT_DAYS).
- Auto-Renew: per-key toggle (`POST /api/admin/keys/{key}/auto-renew {enabled, days}`); the
  daily pass auto-extends flagged keys near expiry by their stored days (set to the current
  renew-length dropdown value when enabled) and emails the owner. Verified: 3d key → 92d.
- Playlist window skin: carbon-fiber CSS texture (`.hl-carbon`) + faint flame-emblem watermark
  (`/public/hl-emblem.png`, transparent) behind the track list; tracks scroll over it.
- Scroll window: track list capped to ~6 rows (maxHeight 27rem) then scrolls.
- Jingle pads: drag-and-drop audio files from the OS onto a pad to assign/replace; remove (✕)
  button always visible.
- Verified sender: SENDER_EMAIL can be a verified Resend domain address. NOTE: hotlive95.com is
  NOT yet verified in Resend, so it's kept as `onboarding@resend.dev` (works) until the owner
  verifies the domain, then flip SENDER_EMAIL to `Hot Live 95 <Dinthestreets@hotlive95.com>`.

## Update 9 (2026-06) — backend curl-verified + UI E2E
- Expiry Alerts: backend daily scheduler (`check_expiring`, startup asyncio loop, 12h) emails
  OWNER_EMAIL once per key when it enters the ≤7-day window (`expiry_alert_for` flag re-arms on
  renew). Manual trigger `POST /api/admin/run-expiry-check`. Env: OWNER_EMAIL, EXPIRY_ALERT_DAYS.
  Verified: alerts_sent:1 for an in-window key.
- DJ Self-Serve: public `POST /api/status {key, device_id?}` returns dj/expiry/days_left/
  device summary (no admin token, no raw device_ids). `LicenseStatus.js` reusable component used
  in (a) in-app "My License" header modal and (b) public route `/license?key=` (`LicenseStatusPage.js`,
  react-router-dom v7 added in `index.js`). Verified on /license page.
- Renew Length: KeyManager dropdown 30/90/180/365 (default 90) feeds `adminRenew(key, days)`.
  Verified renew 365 → +365d.

## Update 8 (2026-06) — backend curl-verified + UI E2E
- Usage Dashboard: Key Manager online tab shows summary cards — Active DJs, Computers
  online, Total keys, Expiring ≤14d. Backend `/api/admin/keys` now returns `active_devices`,
  `days_left`, `expired`, `email_sent_at`, `last_activated_at`. Rows show device count, email,
  days-left countdown, and an "emailed" badge.
- Auto Renew: `POST /api/admin/keys/{key}/renew` extends expiry by RENEW_DAYS (default 90)
  from max(now, current expiry) and un-revokes. One-click ↻ button per key.
- Activation Emails (Resend): `send_welcome_email` sends a branded HTML welcome + key on
  create when a DJ email is provided; `POST /api/admin/keys/{key}/resend-email` re-sends.
  Graceful no-op (email_sent:false) when RESEND_API_KEY is empty. Env: RESEND_API_KEY,
  SENDER_EMAIL, RENEW_DAYS. **Needs a Resend API key in backend/.env to actually deliver.**
- Deploy/hosted licensing prep: `lib/api.js` BASE resolves `window.hotlive.licenseServer`
  first (Electron), falling back to REACT_APP_BACKEND_URL. `electron/preload.js` reads the
  hosted backend URL from `HotLive95Data/license-server.txt` (or HL_LICENSE_SERVER env) so DJ
  copies activate/validate against the owner's deployed backend over the internet.

## Update 7 (2026-06) — backend curl-verified + UI E2E
- Online Activation (optional): FastAPI + MongoDB licensing service (`backend/server.py`):
  `/api/activate`, `/api/validate`, admin `/api/admin/keys` (create/list/revoke/free-device/delete,
  `X-Admin-Token`). Frontend tries online first, falls back to offline checksum keys when the
  server is unreachable (`lib/api.js`, `App.activateLicense`). Revoked/expired/cap enforced.
- Key Expiry: per-key `expires_at`; enforced server-side (activate/validate) and locally on load.
- Fade Length: `settings.cueFadeSeconds` slider (0.5–8s) wired to `engine.setCueAutoFade(on,sec)`.
- Custom FX Slot: `CustomFxModal.js` (highpass/lowpass/drive/echo/reverb) saved to
  `settings.customFx`; `buildMicGraph` builds a live chain for the "Custom" preset.
- Key Manager gained an Online (revocable) tab alongside the device-locked Offline generator.

## Backlog / Next
- P2: MP3 export via Web Worker for very long tracks
- P2: Validate imported .hlp.json schema; validate schedule end > start
- P2: Optional per-device license binding + online activation (stronger anti-piracy)

## Update 5 (2026-06) — verified by testing agent (100%)
- License Lock: offline activation gate (`license.js` checksum keys, `LicenseGate.js`),
  persisted via `platform.getLicense/setLicense` (+ Electron license.json IPC). Key
  generator `electron/tools/genkeys.js`. NOTE: soft/casual protection (secret is in
  client code) — pair with the © agreement + code signing.
- Legal Notice: © license agreement + agree checkbox on first launch (in `LicenseGate.js`).
- Main Waveform Cues: per-track manual cueIn/cueOut markers on the on-air waveform;
  engine starts at cueIn and auto-advances at cueOut (`audioEngine.js`, `PlayerBar.js`,
  `Waveform.js` markers).
- Instant Voice FX: MIC live-to-air button + Voice FX select (Off/Echo/Reverb) via Web
  Audio (`buildMicGraph`/`makeImpulse` in `App.js`), ducks music while live.

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
