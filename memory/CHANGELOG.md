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

##  — Broadcast reliability upgrades
- Test connection: new backend POST /api/broadcast/test verifies the radio.co SHOUTcast v1 login (no audio) and returns the real server reply; new "Test connection" button in GoLiveModal.
- Guided setup: checklist (Live Anytime on, station powered, source port = base+1, Live/DJ password) shown in the Go Live panel whenever a login/test is refused.
- Retry on refusal: App auto-retries a refused/unreachable login up to 3 times, 8s apart, with a "Retrying login… (n/3)" banner + Stop trying; clears on success/live.
- PlayerBar: crossfade-seconds <select> now uses static <option> children (removed the dynamic {s}s map) to eliminate the "<span> cannot be a child of <option>" hydration warning. Verified NONE in console.
- All verified in preview via screenshot flow.

##  — Broadcast: presets, meter, slot auto-wait, now-playing
- Connection Presets: save/load/delete named radio.co stations (localStorage hotlive95_radioco_presets); one-tap chip loads all fields.
- Level Meter On Test: engine startInputMeter/getInputMeterLevel/stopInputMeter (AnalyserNode on program master + optional mic); Test connection now shows a live input-level bar for ~10s with a "no signal" hint.
- Slot Auto-Wait: "Keep trying until my slot opens" toggle -> unlimited login retries every 15s (vs 3x/8s normal) until radio.co accepts, then auto go-live; banner + button reflect autoWait mode.
- Now-Playing Push: already wired (meta sent on every track change while live via WS -> backend admin.cgi updinfo); added "sent to radio.co" confirmation under the on-air now-playing line.
- Verified in preview desktop + mobile (390px, no overflow).

##  — Broadcast: quick-launch, metadata format, go-live chime, pre-flight test
- Preset Quick-Launch: each saved station chip has a Radio button that loads it and goes live in one tap (goPreset -> onStart with the preset config).
- Metadata Format: "How the song shows to listeners" select (Artist — Title / Title — Artist / Title only), stored in cfg.metaFormat; App formatTrackMeta() applies it to now-playing display + the meta pushed to radio.co.
- Auto-Wait Notify: GoLiveModal plays a two-tone go-live chime and flashes the on-air panel (hl-golive-flash CSS) the moment state transitions to live.
- Test Before Schedule: Arm now runs an async pre-flight connection test; a bad login is shown immediately (red result + checklist) and the schedule is NOT armed until the test passes. Arm shows a "Checking…" spinner.
- Verified in preview: meta-format switch, quick-launch button, and Arm-blocks-on-bad-login all confirmed.

##  — Scheduling ahead + pre-slot connection test
- Persistent multi-show lineup: schedules stored in localStorage (hotlive95_schedules) as a list; DJs can add multiple shows days in advance, each with label + playlist + start/end + a config snapshot (host/port/password/bitrate/mic/autoWait/metaFormat). Survives app restart. Remove per show.
- Scheduler: single App interval auto-goes-live at each shows start (loads its playlist, uses its saved config, honours autoWait) while the studio stays open on the device, and auto-stops at end. Prunes shows >1 day done.
- Smarter Test connection: backend /broadcast/test now returns {ok, reachable, status}. reachable=true + not_in_slot => amber INFO ("host/port correct; not accepting a source now — normal before your slot; will connect at your scheduled time"). unreachable => red. This lets DJs validate host/port/reachability BEFORE their slot (radio.co returns the same "Invalid password" for wrong-pw and out-of-slot, so we cannot distinguish — messaging reflects that).
- Add-to-lineup runs the test first; blocks only when radio.co is UNREACHABLE (bad host/port), otherwise allows scheduling ahead even though radio.co refuses a source now.
- CONSTRAINT (told to user, chose option C): browser/PWA streams from the device, so scheduled shows need the studio open on that machine. True unattended-while-closed 24/7 broadcast = server-side playout = separate future project (roadmap).
- Verified in preview: amber reachable message, show added to lineup, persisted across reload.

##  — Independent 24/7 station (Option B): Icecast/Liquidsoap
- Backend relay+test now speak Icecast SOURCE with configurable username + mount (defaults source + /), on top of SHOUTcast v1 fallback. Confirmed radio.co = Liquidsoap harbor (401 realm) — Icecast handshake returns real HTTP codes (401 bad password vs 403 slot).
- Added _update_icecast_meta (Icecast /admin/metadata) and mode-aware now-playing push in the WS relay.
- GoLiveModal: new "Own server (Icecast/AzuraCast/Liquidsoap)" section with DJ username + mount, threaded through cfgObj, go(), runTest(), goPreset(), presets, addToLineup, and App scheduler config snapshot.
- Server package /app/broadcast-server/: docker-compose.yml (Icecast moul/icecast + Liquidsoap savonet/liquidsoap 2.2.5), radio.liq (AutoDJ /music + live harbor :8005 /live with shared HARBOR_PASSWORD + optional per-DJ DJS list + crossfade + fallback -> Icecast /stream), .env.example, README.md with full VPS deploy + studio setup steps.
- CONSTRAINT: the always-on Icecast/Liquidsoap server MUST run on a dedicated VPS (cannot run in the Emergent app pod). Studio is the live client. radio.liq per-DJ auth is UNTESTED here (no Liquidsoap runtime); shared HARBOR_PASSWORD path is the safe default.
- Verified in preview: own-server username/mount UI + test classification (bad_password/unreachable), no overflow.

##  — Own-server extras: VPS guide, listener count, player, profiles
- Backend GET /api/broadcast/icecast-status (host/port/mount OR stream=url) -> parses status-json.xsl, returns listeners for the mount (or total).
- ListenLivePage (/live): stream URL now overridable via ?stream= (falls back to REACT_APP_STATION_STREAM_URL); shows live listener count via icecast-status; verified renders with a custom stream URL.
- GoLiveModal: on-air listener count now works for own-server (isOwnServer poll of icecast-status), new Listener port field in the Own server section, listeners row shows for own-server too.
- Server Profiles: existing saveable presets already switch full configs (incl username/mount/listenerPort) in one tap; added a radio.co vs own badge on each chip.
- Files: /app/broadcast-server/VPS-SETUP.md (DigitalOcean + Hetzner tailored to hotlive95dj.com, firewall, DNS, deploy), Caddyfile (HTTPS reverse proxy for stream.hotlive95dj.com), plus append-caddy snippet in the guide.
- Verified: icecast-status graceful on bad host; radio.co test intact; /live player renders with ?stream=.

## 2026-09-23 — Player embed + auto stream URL + profile import/export
- GoLiveModal "Share & embed the web player": save a public stream URL (localStorage hotlive95_stream_url), copyable share link (${origin}/live?stream=...) and a ready <iframe> embed snippet (uses window.location.origin so it points at prod once deployed).
- Auto Stream URL: ListenLivePage /live now falls back ?stream= -> localStorage hotlive95_stream_url -> env, so the plain /live link works after saving once.
- Profile Import/Export: Export downloads hotlive95-dj-profiles.json (all presets); Import merges from file (dedupe by label, cap 24).
- Verified in preview: buttons present, embed section generates correct URL-encoded iframe, no overflow.

##  — One-tap station check + Icecast-only setup
- Backend: /api/broadcast/icecast-status now returns live (bool) = whether a source is currently connected to the mount (presence in status-json.xsl).
- GoLiveModal Share&Embed: new "Is my station live?" button -> pings icecast-status for the saved stream URL, shows 🟢 On air + listeners / amber server-up-no-source / red offline (go-live-station-check testid).
- Server package: added docker-compose.icecast-only.yml (moul/icecast, port 8000 = both listeners and DJ source) for the simple no-Liquidsoap path; VPS-SETUP.md now leads with an ICECAST-ONLY quick start (studio streams direct to Icecast at :8000 mount /stream, user source).
- Verified: live field logic in place, one-tap check shows offline correctly pre-deploy, mobile layout clean.

##  — AzuraCast support
- Backend GET /api/broadcast/azuracast-status (url OR base+station) -> parses AzuraCast /api/nowplaying: {ok, live (is_online), listeners.current, nowPlaying (song.text)}. Verified against demo.azuracast.com (live/1 listener/now-playing).
- GoLiveModal Own server: new "AzuraCast now-playing URL" field (statsUrl) persisted in cfg + presets (save/load/quick-launch). When set, the "Is my station live?" check and the on-air listener poll use azuracast-status; else Icecast status-json.
- saveStreamUrl now also stores hotlive95_status_url; /live player uses ?status= / saved status url -> azuracast-status for live listeners + now-playing (fallback to icecast-status/stream).
- VPS-SETUP.md: added AzuraCast one-command install section (docker.sh) + exact studio field mapping (DJ/streamer port, listen URL, now-playing API URL).
- Verified in preview: AzuraCast stats field + station check show On air + listener count from real AzuraCast API.

##  — DO command sheet, live badge, AzuraCast auto-fill, QR
- Backend GET /api/broadcast/azuracast-resolve (parses public/nowplaying/listen/station URL -> host, listenUrl, nowPlayingUrl, name via /api/nowplaying). Verified vs demo.azuracast.com.
- GoLiveModal Own server: "AzuraCast auto-fill" (paste station URL -> fills host, stream URL, now-playing URL, name). QR (qrcode.react QRCodeCanvas) "scan-to-listen" in Share & embed for the share link.
- ListenLivePage /live: live badge now reflects real station status (stationLive from azuracast/icecast status): green LIVE / grey OFFLINE; also shows listeners + now-playing from AzuraCast. Verified badge=LIVE, 1 listener, now-playing from demo.
- /app/broadcast-server/DIGITALOCEAN-AZURACAST.md: end-to-end droplet command sheet (create, DNS, ufw, docker.sh install, HTTPS via LetsEncrypt, station/DJ setup, studio connect, update cmds).
- Verified in preview (mobile 390): auto-fill, QR canvas, player live badge all working against AzuraCast demo API.

## Update 38 (2026-06) — 5 broadcast features + Flame-Play logo (verified 100%, iteration_38)
- Brand: header + LicenseGate logo swapped from the mic/city logo to the user's Flame Play button
  emblem, background+drop-shadow removed via PIL flood-fill (only the rounded dark tile kept, transparent
  corners). New asset /app/frontend/public/flame-play-logo.png (used in Header.js + LicenseGate.js).
- Task 1 — Live-to-All Hotkey (Ctrl+Shift+L): App.js airAllRef.current toggles simulcast to EVERY
  configured station at once (or stops all if already on air); prompts + opens Broadcast Center if no
  station is set up. Keydown branch added before the input guard so it works globally. StationsModal
  global bar shows a 'Ctrl+Shift+L' kbd hint (data-testid broadcast-hotkey-hint).
- Task 2 — Ducking (Multi-Channel, GLOBAL level): lib/multiChannel.js adds a duckable `musicGain` node
  (src -> musicGain -> gain) so the mic is never ducked; setDuckLevel(level) + setMic ramp musicGain to
  the global level (setTargetAtTime 0.08s) the moment a channel's mic opens. MultiChannelStudio header
  has a global 'Mic Ducking' dip slider (mc-duck-bar/mc-duck-slider/mc-duck-value, 0-95%, persisted in
  localStorage hotlive95_mc_duck; music gain = 1 - dip). Channel shows 'Music ducked for mic' indicator
  (mc-ducking-<id>) while its mic is open.
- Task 3 — Per-Channel Schedule: each MultiChannelStudio channel has an Auto-start section
  (mc-sched-enable-<id> toggle -> mc-sched-time-<id> HH:MM + mc-sched-golive-<id> 'Live' toggle). A 10s
  interval per channel starts that channel's program from the top (engine.playIndex(id,0)) at the set
  time daily, and optionally takes it live. Persisted in localStorage hotlive95_mc_schedules.
- Task 4 — Player Themes (/live): ListenLivePage supports ?theme=compact|full + an on-page toggle
  (live-theme-toggle: live-theme-full 'Card' / live-theme-compact 'Bar'), persisted in
  hotlive95_live_theme. Compact = slim horizontal player bar (live-compact-bar). StationsModal share
  row has a per-station Skin toggle (station-skin-full/-compact-<id>) that appends &theme=compact to the
  copied /live link + embed (embed sizes adjust to 640x120 for the bar).
- Task 5 — Listener CSV Export: StationCard records listener samples ({t,listeners,nowPlaying}) each
  status poll into listenerLogRef; 'Listener CSV' button (station-export-listeners-<id>) downloads
  <station>_listeners_<stamp>.csv (disabled until samples exist — stays disabled in preview since there
  is no real status server).
- Verified: testing agent iteration_38 — frontend 100%, all 5 tasks pass, no crashes. Real Icecast/
  AzuraCast live still can't be reached in preview (no server) — connecting/error is expected. The
  <span> in <option> hydration warning is preview-tooling injected, not our source.

## Fix (2026-06) — Saved playlist files greyed-out in Load picker after reinstall (iPad/iOS)
- Root cause: Sidebar.js Load <input type=file> used accept=".hl95playout,.hl95playlist,.hlp.json,
  .json,application/json". iOS/iPadOS (and some desktop) file pickers grey out files whose custom
  extension (.hl95playlist / .hl95playout) they don't recognize, so DJs couldn't select their own
  saved files after reinstalling. Confirmed on user's iPad (Files picker showed the .hl95playlist
  greyed until fix, selectable after).
- Fix: changed the Load input accept to "*/*" so the saved files are always selectable on every
  platform. The importPlaylist/applyImport handler already validates JSON content and shows a friendly
  error for wrong files, so widening accept is safe. Import format unchanged (single + multi-part).
- Note for support: web/PWA auto-saved playlists live in IndexedDB+localStorage and are wiped on
  uninstall — DJs must use the per-playlist Save button to export .hl95playlist files (which re-import
  via Load). Large playlists split into "part X of N" — all parts must be loaded together to restore.
- Deployed to production.
