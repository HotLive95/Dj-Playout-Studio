# Changelog — Hot Live 95 DJ Playout Studio

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
