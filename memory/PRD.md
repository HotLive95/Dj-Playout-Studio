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

## Update 15 (2026-06) — admin/keygen pages
- New route `/keygen` (KeyGenPage): standalone key generator (Key Manager) accessible without the
  activation gate — bookmark to make keys without launching the studio.
- New route `/admin` (AdminPage): passkey-gated admin console. Own full-page passkey login
  (session-remembered via sessionStorage), then embeds `<KeyManager skipAuth>` (generator + usage
  dashboard + renew/auto-renew/QR/revoke/settings) plus a top bar linking to /live, /license, the
  Studio app, and a Lock button. Passkey = ADMIN_PASS ("Hotlive95dj1108**", exported from KeyManager.js; matches backend ADMIN_TOKEN).
- KeyManager gained a `skipAuth` prop (initializes unlocked) so the admin page gates once with no double prompt.

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

## Update 14 (2026-06) — verified
- Admin passkey changed from `hotlive95admin` to `Hotlive95dj1108**` (frontend KeyManager.js ADMIN_PASS,
  backend .env ADMIN_TOKEN + server default, tests). Verified: old rejected 401, new accepted 200.
- Email sender switched to `Hot Live 95 <Dinthestreets@hotlive95dj.com>` (owner's Resend domain now verified).
- Activation gate (LicenseGate.js): added an "Admin · Manage codes" tab in the footer that opens the
  passkey-protected KeyManager (activation-code generator) without needing a valid key first.
- Mobile responsiveness: the fixed-height desktop console now stacks on phones. App root scrolls
  vertically (min-h-screen md:h-screen + overflow-x-hidden); sidebar stacks above track list
  (flex-col md:flex-row, sidebar w-full max-h-[45vh]); JingleBar/CuePanel/PlayerBar wrap
  (flex-wrap md:flex-nowrap, px-3 md:px-6, transport/right controls w-full md:w-1/3). No horizontal
  page scroll at 390px or 1920px; desktop layout unchanged.
- Flashing/refresh-loop fix (index.js dev branch): unregister() alone did NOT release the SW already
  CONTROLLING the loaded page (it kept serving stale shell). Now: unregister all + clear all caches +
  a single sessionStorage-guarded window.location.reload() when a controller exists, to load
  uncontrolled. Verified with a simulated stuck SW: before has/controller=True → after has/controller=False,
  one guarded reload, then stable (no loop).
- Mobile mini-player: new `components/MobileMiniPlayer.js` — slim sticky bottom transport bar
  (track name + prev/play-pause/next + thin progress) shown on phones only (`md:hidden`, fixed bottom-0).
  Wired in App.js with app-root `pb-16 md:pb-0` so it never covers the full PlayerBar. Verified:
  present & pinned to viewport bottom at 390px, hidden at 1920px.
- Mini-player cue (Update 14b): added a Headphones button to MobileMiniPlayer that pre-listens the
  current track (`cueCurrent` in App.js: cuePlay(currentTrack), or cueToggle if already cueing it);
  goes amber while cueing. Verified present at 390px.
- Install prompt: new `components/InstallPrompt.js` — dismissible "Add to Home Screen" tip, phones only
  (`md:hidden`, fixed above the mini-player). Android/Chrome uses real `beforeinstallprompt` (one-tap
  install button); iOS Safari gets Share → Add to Home Screen steps (UA-detected). Skips when already
  standalone; remembers dismissal in localStorage `hotlive95_a2hs_dismissed`. Rendered in App.js.
  Verified: iOS banner shows with correct copy, dismiss hides + persists.

## Update 15 (2026-06) — verified
- Mobile compaction: jingle pads now render as a 3-col wrapping grid on phones (all 6 pads visible,
  no horizontal scroll) via `grid grid-cols-3 md:flex` on the pad container; sidebar max-h reduced to
  30vh and main min-h to 38vh on mobile so the JingleBar/CuePanel/PlayerBar sit closer and are reachable.
- Shuffle / random playback: new `settings.shuffle` (default false) + PlayerBar "Shuffle" toggle
  (data-testid `shuffle-toggle`; Xfade icon changed to Waves so Shuffle icon is distinct). Engine gains
  `setShuffle`, `_hasNext`, `_nextIndex` (random, no immediate repeat, cycles all before repeating via
  a `_recent` bag). All 4 advance paths (next(), _onTime early-end, crossfade, _onEnded) use the new
  helpers. Verified via node logic test (/tmp/shuffle_test.js): no-repeat+full-coverage n=5, n=1 no next,
  n=2 alternates, sequential still stops at end. UI toggle verified on mobile.

## Update 16 (2026-06) — verified
- Mobile page scroller: root cause of "can't scroll / doesn't fit" was `body { overflow:hidden }` +
  `html,body,#root { height:100% }` locking the page. Added a `@media (max-width:767px)` override in
  index.css: height:auto/min-height:100% + body overflow-y:auto (touch scrolling). Desktop unchanged.
  Verified: page scrollable at 390px, no horizontal scroll.
- Shuffle on mobile mini-player: added a Shuffle button (data-testid `mini-shuffle-button`) wired to
  the same `settings.shuffle` / `toggleShuffle`.
- Shuffle whole show: new `settings.shuffleAll` (default false) + Sidebar footer toggle
  (data-testid `shuffle-all-toggle`). When on, queueTracks becomes every track across ALL playlists
  (dedup, in order) and shuffle is force-enabled, so the engine randomizes across the whole show.
  Verified: toggles active on mobile.

## Update 17 (2026-06) — verified
- Shuffle indicator: PlayerBar now-playing area shows a badge (data-testid `shuffle-indicator`) —
  "SHUFFLE ON" when shuffle is on, "SHUFFLE ALL" when shuffleAll is on — so DJs know why tracks are random.
- Sleep timer: new `components/SleepTimer.js` (Moon button in PlayerBar right controls, opens an
  upward menu with 15/30/45/60/90/120 min). App.js holds `sleepEndsAt`/`sleepRemaining` with a 500ms
  interval; at zero it calls the engine's new `fadeOutStop(6)` which ramps the on-air track to silence
  over ~6s then pauses (restores volume for next play). Engine guards crossfade/advance with a
  `_stopping` flag during the fade; togglePlay/playIndex cancel any pending sleep fade and un-mute.
  Verified on desktop: badge shows, menu opens, 15-min countdown ticks (14:59), cancel clears it.

## Update 18 (2026-06) — verified
- Custom sleep length: SleepTimer menu now has a number input + "Set custom" so DJs can enter any
  minutes (1-600) instead of only presets. Verified: entering 7 → 6:59 countdown.
- Fade-In Wake: new `components/WakeTimer.js` (Sunrise button in PlayerBar) with a `type=time` input.
  App.js holds `wakeAt`/`wakeLabel`; a 1s interval fires `engine.fadeInStart(6)` at the set time
  (computes next occurrence — today if still ahead, else tomorrow), starting playout from the top if
  nothing is loaded and ramping volume 0→full over ~6s. Engine `fadeInStart` reuses the sleep-fade raf.
  Verified: set 06:30 → button shows 06:30; cancel clears.

## Update 19 (2026-06) — verified
- In/Out cursor default: `setCueIn` now seeks the engine to the in point (parks the playhead there), and
  the engine resets the playhead back to `cueIn` (or 0) whenever playback reaches the Out cue / track end
  without auto-advancing (`_onTime` effEnd branch + `_onEnded`). So the cursor defaults to the In point
  until cues are cleared. Verified: In@0:02, Out@0:04 → on reaching Out, playback stops and playhead resets to 0:02.
- Draggable trim handles: `Waveform.js` gains `onInChange`/`onOutChange` and pointer-drag handles
  (data-testid `trim-handle-in`/`trim-handle-out`, 16px hit area, amber grips). TrackEditor wires them to
  setInPoint/setOutPoint; the editor already loops/stops playback within [in,out]. Verified: dragging set
  In 0:02 / Out 0:06, Keep 0:04 of 0:08.
- Track search: Header has a search field (data-testid `track-search-input` + clear). App holds `search`
  state passed to TrackList, which filters the current playlist by name while PRESERVING original indices
  (so reorder/edit/remove/testids stay correct; drag disabled while filtering). Shows "N of M match" and a
  `no-search-results` state. Verified: "sunrise" → rows 1 & 4, "2 of 4 match".

## Update 20 (2026-06) — verified
- Hotkeys I / O: added to the live keydown handler (App.js) via `cueInRef`/`cueOutRef` (refs so the
  empty-dep effect calls the latest setCueIn/setCueOut). Guarded by the existing input/select/textarea
  check so typing in the search box won't trigger them. Verified: 'i'→cueIn, 'o'→cueOut set + markers.
- Cue-on-waveform: `Waveform.js` renders draggable cue handles in COMPACT mode (data-testid
  `cue-handle-in`/`cue-handle-out`) driven by `onCueDrag(label, frac)`. PlayerBar maps drags to new
  `onSetCueInAt`/`onSetCueOutAt` (App.js `setCueInAt`/`setCueOutAt`, time-based, clamped so in<out).
  Verified: dragging in-handle moved cueIn 0.97→2.43s (clamped under out).
- Search across all playlists: TrackList now also receives `playlists` + `onSelectPlaylist`; when a query
  is active it shows an "In other playlists (N)" section (data-testid `other-playlist-results`,
  `open-playlist-{id}`) listing matches from other playlists with an Open button that switches the
  current playlist. Verified: "sunrise" → current match + Evening Drive match, Open switches playlist.

## Update 21 (2026-06) — verified
- Unlimited tracks per playlist: there was never a data cap; the track list had a hard-coded
  `maxHeight: 27rem` that shrank it into a small scroll box past ~6 tracks. Removed that inline cap and
  gave the track-scroll `flex-1 min-h-0 overflow-y-auto` + added `min-h-0` to the track-list-panel so on
  desktop the list fills the full console height and scrolls internally (bottom bars stay put), while on
  mobile the page scrolls. Verified with 30 tracks: desktop internal scroll (384/2073), jingle+player
  bars on-screen; mobile page scrollable.

## Update 22 (2026-06) — verified
- Loop Region: `settings.loopRegion` + PlayerBar "Loop" toggle (data-testid `loop-region-toggle`, Repeat1
  icon, in the cue-button group). Engine `setLoopRegion`; in `_onTime` when the playhead reaches the Out
  cue (effEnd) while looping it jumps back to cueIn (or 0) and keeps playing; `_onEnded` also loops the
  full track when no Out cue. Verified: In@1s/Out@3s + Loop → after 3.2s still ON AIR, playhead looped
  back to ~1s.
- Jump-to-Match: TrackList highlights the matched substring in track names via a `<mark>` (amber) and
  auto-scrolls the first match into view (`firstMatchRef` + scrollIntoView on query change). Applies to
  both current-playlist rows and other-playlist results. Verified: search "tone" → <mark>tone</mark>.
- No playlist cap: reconfirmed — unlimited tracks, list fills height and scrolls (Update 21).

## Update 23 (2026-06) — verified
- Track Editor zoom/percentage tool: new `zoom` (1×–30×) + `viewStart` state in TrackEditor. A Zoom
  slider (data-testid `editor-zoom`) with a % readout (`editor-zoom-readout`), a Pan slider
  (`editor-pan`, shown when zoom>1), and a Fit button (`editor-zoom-fit`). The visible waveform is a
  peaks slice of the window; `toWin`/`fromWin` map full-track fraction ↔ visible-window fraction so
  click-seek, the playhead, cut regions, and the draggable In/Out trim handles all stay accurate while
  zoomed. Zooming keeps the playhead centred in the new window. Verified: 100%→600% magnifies, pan
  appears, handle drag maps to sub-second precision, Fit resets to 100%.

## Update 24 (2026-06) — verified
- Scroll-wheel zoom: TrackEditor wraps the Waveform in a ref'd div with a non-passive `wheel` listener
  that zooms (1x-30x) anchored at the cursor's track position (recomputes viewStart to keep the cursor
  fixed). Verified 600%->750% on wheel-up.
- Millisecond readout: `formatMs` (m:ss.mmm) via `fmtCue` shows In/Out and cut times to the millisecond
  when zoom>1 (mm:ss otherwise). Verified Set In 0:00.000 / Set Out 0:08.000 at 600%.
- Nudge keys: `selectedCue` ('in'/'out') set by clicking Set In/Out or grabbing a trim handle
  (Waveform `onHandleSelect`). A capture-phase document keydown handler nudges the selected cue +/-10ms
  (Shift +/-100ms) with left/right arrows, preventDefault+stopPropagation so it preempts the app's global
  transport shortcuts while the editor is open. Selected cue button highlights amber + hint shown.
  Verified right x3 -> 0:00.030, left x1 -> 0:00.020.



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
- Verified sender: SENDER_EMAIL is now `Hot Live 95 <Dinthestreets@hotlive95dj.com>` (owner confirmed
  hotlive95dj.com is verified/green in Resend as of Jun 2026).

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
