# Changelog — Hot Live 95 DJ Playout Studio

## 2026-06 — Broadcast: auto-stop, archive→playlist, health alerts, listener graph
UI + regression 100% (iteration_32).
- **Auto-stop at end time**: the schedule now takes an optional end time; the app
  auto-stops the broadcast when it's reached (unattended shows wrap cleanly).
- **Archive → Playlist**: any saved broadcast can be added back into the current
  playlist as a re-airable track (blob copied to a new track id).
- **Health Alerts**: a flashing banner + optional beep the moment dropouts/buffering
  start while live (toggle `Sound an alert if the stream drops out`).
- **Listener Graph**: an in-panel sparkline of the radio.co listener count over the
  show, with the peak labelled.

## 2026-06 — Broadcast: Auto-DJ handoff, health, archive library, metadata
UI + regression 100% (iteration_31).
- **Now-Playing metadata**: the live "Artist - Title" is already pushed to
  radio.co; radio.co auto-matches cover art from that title. NOTE: custom album
  art cannot be pushed from a live SHOUTcast v1 source (protocol carries only the
  title string) — this is a radio.co/protocol limit, not an app gap.
- **Auto DJ Handoff** (`GoLiveModal` + App schedule): a scheduled go-live can pick
  a playlist that auto-loads and starts playback (`playIndex(0)`) the moment it
  goes on air.
- **Broadcast Health** (`audioEngine.getBroadcastHealth`): live indicator showing
  measured kbps, buffered backpressure and drop count → Stable / Buffering /
  Dropouts / Reconnecting.
- **Archive Library**: broadcasts are now stored in-app (IndexedDB + a dated list
  in localStorage `hotlive95_broadcasts`) with in-panel preview / download /
  delete, instead of only auto-downloading.

## 2026-06 — Broadcast enhancements (reconnect, listeners, archive, schedule)
UI + regression 100% (iteration_30); relay/station endpoints verified.
- **Auto Reconnect** (`audioEngine.js`): on an unexpected drop the engine keeps
  the audio graph, reopens the WS with exponential backoff (2→30s, max 10 tries)
  and a fresh encoder; the Go Live panel shows a live "Reconnecting in Ns
  (attempt N)" countdown.
- **Listener Count**: optional Station ID field; backend
  `GET /api/broadcast/station-status?station_id=` proxies radio.co's public
  status (`listeners.total`), polled every 15s while on air.
- **Stream Archive**: each broadcast is recorded (MediaRecorder on the broadcast
  mix) and auto-downloaded as a dated `HotLive95 Broadcast YYYY-MM-DD HH-MM.webm`
  on stop.
- **Scheduled Go-Live**: arm a datetime; the app auto-starts the broadcast from
  the saved config at that time (hands-free), with an armed/countdown + cancel.

## 2026-06 — Live broadcast to radio.co (Go Live)
Backend relay proven end-to-end (real radio.co SHOUTcast v1 handshake returned
live; 32KB MP3 forwarded byte-for-byte to a fake SHOUTcast server). UI +
regression 100% (iteration_29). In-browser capture is standard ScriptProcessor;
final on-air check is the operator's to run on their own station.
- **Backend** (`server.py`): `WS /api/broadcast/ws` — receives a config JSON then
  MP3 bytes over WSS, opens a raw asyncio TCP SHOUTcast v1 source to radio.co
  (password → OK2 → icy headers → stream), forwards audio, and best-effort
  now-playing metadata via `admin.cgi?mode=updinfo`. Verified port = base+1
  (5189 for denim.radio.co). No secrets stored server-side; the DJ's creds come
  from the client per-session.
- **Engine** (`audioEngine.js`): taps the program master (`_recMaster`) into a
  broadcast sub-mix (+ optional mic), encodes to MP3 in real time
  (`@breezystack/lamejs`, ScriptProcessor) and streams over the WS.
  `startBroadcast`/`stopBroadcast`/`sendBroadcastMeta`/`getBroadcastLevel`.
- **UI**: header "Go Live" button (pulsing ON AIR when live) + `GoLiveModal`
  (host/port/password/bitrate/station-name/mic, live level meter, now-playing).
  Works on iPad too, because the browser relays through the backend rather than
  connecting to radio.co directly (a browser can't be a SHOUTcast source).

## 2026-06 (follow-up 2) — Pad Labels, Stem-to-Deck, Preset Sharing, Full-screen Install
Tested end-to-end (iteration_28.json): 100% pass, no bugs.
- **Pad Labels + Colour** (`JingleBar.js`): per-pad custom name + colour swatch
  (8 colours), persists across pages; `renameJingle`/`colorJingle` in App.
- **Stem To Deck** (`StemIsolator.js` + App `sendMixToDeck`): after recording a
  stem mix, "Send mix to standby deck" arms it on the standby deck for a live
  acappella/instrumental drop (TAKE to fire).
- **Preset Sharing** (`VoiceRecorder.js`): export/import Voice FX presets as a
  JSON file so a crew shares one booth sound.
- **Full-screen Install welcome** (`InstallPrompt.js`): first-run centered
  overlay with one-tap install (Chrome/Edge) or per-OS steps; shows once.

## 2026-06 (follow-up) — Stem Record, FX Presets, Pad Bank Pages
Tested end-to-end (iteration_27.json): 100% pass, no bugs.
- **Stem Record** (`StemIsolator.js`): "REC MIX" captures the live isolated mix
  (with fader/mute/solo automation) via a MediaStreamDestination on the graph
  master; recording persists across loop/seek/restart; on stop the webm is
  decoded → WAV and downloaded (`<track> - Stem Mix.wav`). Source select locked
  while recording.
- **FX Presets** (`VoiceRecorder.js`): one-tap save/load/delete of Pad +
  Compressor + Gate settings (`hotlive95_fx_presets`), UI in `voice-fx-presets`.
- **Pad Bank Pages** (`JingleBar.js` + App): jingle bar now holds 12 pads across
  2 pages with a page switcher; keyboard 1-6 maps to the active page.

## 2026-06 — Voice DSP, Stem Isolator, Install, 500MB uploads, Export-in-parts
Tested end-to-end by testing agent (iteration_26.json): 100% pass, no bugs.

- **Voice Booth DSP chain** (`VoiceRecorder.js`): added an always-on processing
  chain `mic → Input Pad (−24…+24 dB) → Compressor → makeup → Noise Gate` built
  by `buildMicChain()`. Toggling comp/gate only changes params (glitch-free
  live). Gate is driven inside `startDuckLoop` off the mic RMS/peak. Chain feeds
  BOTH the headphone monitor and the MediaRecorder, so takes are captured
  already processed. New UI panel `voice-fx-chain`.
- **Install button** (`InstallButton.js` + `lib/installStore.js`): prominent
  "Install app" in the header and "Install to this device" in the sidebar.
  Uses the captured `beforeinstallprompt` for one-tap install on Chrome/Edge;
  otherwise opens a per-OS instructions modal (Windows/Mac/iPad/Android).
- **Cloud Handoff 500 MB chunked upload**: backend `/api/shows/upload/init`,
  `/chunk`, `/complete` (GridFS assemble from 5 MB Mongo chunks). `SHOW_MAX_MB`
  default raised 200→500. Frontend `api.uploadShowChunked()` with progress;
  `CloudHandoffModal` shows a progress bar + %.
- **Export in parts** (`playlistExport.js` `exportPlaylistInParts()` +
  `ExportPlaylistModal`): "Split into device-friendly parts" checkbox with a
  max-minutes selector; renders each part and downloads a single `.zip`.
- **Stem Isolator** (`StemIsolator.js` + `lib/stemIsolator.js`): real-time,
  fully-offline DSP isolation (mid/side + multiband) into Vocals / Music / Bass
  / Drums with live mute/solo/level. "Send to pad" renders an isolated stem
  offline and loads it onto a jingle pad (stems → 6 pads). Per-stem WAV/MP3
  export. Opened from the header (Layers icon). App handler `assignStemToPad`.
  NOTE: this is DSP approximation, not AI source-separation — chosen to keep the
  app fully offline / flash-drive friendly with zero latency and no model
  download (communicated to and approved by the user).

### Known non-blocking
- Cloud upload progress bar may not visibly render for near-empty studios
  (completes before first repaint). Not user-facing.
- Carry-over React hydration warning `<span> cannot be a child of <option>`
  from the visual-editor injection in PlayerBar (pre-existing since iter 20-25).

##  — Broadcast button "does nothing" fix
- Root cause: on a radio.co source rejection, audioEngine emitted "error" then immediately called stopBroadcast() which emitted "stopped" -> App reset bcState to "idle", overwriting "error". Modal only renders the error when state==="error", so the message was swallowed and the click looked like it did nothing.
- Fix (frontend lib/audioEngine.js): stopBroadcast(silent) no longer emits "stopped" when called from an error path; error branch and reconnect-give-up now call stopBroadcast(true) first, then emit the error so it persists.
- Fix (backend server.py /broadcast/ws): handshake reads available bytes (read(1024)) instead of strict readuntil("\r\n\r\n"); accepts OK2/OK/HTTP 200; on failure surfaces the actual server reply (e.g. "Invalid password") in the error.
- Verified in preview: wrong password now shows "radio.co refused the source connection ... (server replied: Invalid password)".
