import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "@/App.css";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import TrackList from "@/components/TrackList";
import PlayerBar from "@/components/PlayerBar";
import CuePanel from "@/components/CuePanel";
import TrackEditor from "@/components/TrackEditor";
import ScheduleModal from "@/components/ScheduleModal";
import ExportPlaylistModal from "@/components/ExportPlaylistModal";
import BatchExportModal from "@/components/BatchExportModal";
import BulkTagModal from "@/components/BulkTagModal";
import JingleBar from "@/components/JingleBar";
import VoiceRecorder from "@/components/VoiceRecorder";
import LicenseGate from "@/components/LicenseGate";
import KeyManager from "@/components/KeyManager";
import CustomFxModal from "@/components/CustomFxModal";
import { MobileMiniPlayer } from "@/components/MobileMiniPlayer";
import { InstallPrompt } from "@/components/InstallPrompt";
import { LicenseStatus } from "@/components/LicenseStatus";
import { IdCard, X } from "lucide-react";
import AudioEngine from "@/lib/audioEngine";
import { platform } from "@/lib/platform";
import { putBlob } from "@/lib/db";
import { api } from "@/lib/api";
import { decodeToBuffer, detectSilence, computePeaks } from "@/lib/audioProcessing";
import { deriveNames, parseFilename } from "@/lib/id3";

const uid = () =>
  (crypto.randomUUID && crypto.randomUUID()) ||
  `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const defaultSettings = {
  autoplay: true,
  shuffle: false,
  crossfade: true,
  crossfadeSeconds: 3,
  shuffleAll: false,
  volume: 1,
  programSink: "",
  cueSink: "",
  trimSilence: false,
  loopRegion: false,
  autoDuck: false,
  voiceFx: "off",
  cueAutoFade: false,
  cueFadeSeconds: 1.5,
  jingleDuckDepth: 0.4,
  jingleDuckMs: 220,
  faderCurve: "smooth",
  syncLock: false,
  customFx: { highpass: 120, lowpass: 12000, drive: 0.2, echo: 0, reverb: 0 },
};

function makeImpulse(ctx, seconds = 2.2, decay = 2.5) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function buildMicGraph(ctx, source, fx, custom) {
  const out = ctx.createGain();
  out.gain.value = 0.9;

  if (fx === "custom") {
    const c = { highpass: 120, lowpass: 12000, drive: 0.2, echo: 0, reverb: 0, ...(custom || {}) };
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = c.highpass;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = c.lowpass;
    source.connect(hp);
    hp.connect(lp);
    let node = lp;
    if (c.drive > 0) {
      const ws = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      const amt = 1 + c.drive * 4;
      for (let i = 0; i < 256; i++) curve[i] = Math.tanh(((i / 255) * 2 - 1) * amt);
      ws.curve = curve;
      node.connect(ws);
      node = ws;
    }
    node.connect(out);
    if (c.echo > 0) {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.28;
      const fb = ctx.createGain();
      fb.gain.value = 0.3;
      const wet = ctx.createGain();
      wet.gain.value = c.echo;
      node.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(wet);
      wet.connect(out);
    }
    if (c.reverb > 0) {
      const conv = ctx.createConvolver();
      conv.buffer = makeImpulse(ctx, 2.4, 2.6);
      const wet = ctx.createGain();
      wet.gain.value = c.reverb;
      node.connect(conv);
      conv.connect(wet);
      wet.connect(out);
    }
    out.connect(ctx.destination);
    return;
  }

  const bandpass = (hp, lp) => {
    const h = ctx.createBiquadFilter();
    h.type = "highpass";
    h.frequency.value = hp;
    const l = ctx.createBiquadFilter();
    l.type = "lowpass";
    l.frequency.value = lp;
    h.connect(l);
    return { input: h, output: l };
  };

  if (fx === "echo") {
    const dry = ctx.createGain();
    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    source.connect(dry);
    dry.connect(out);
    source.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(out);
  } else if (fx === "reverb" || fx === "stadium") {
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx, fx === "stadium" ? 4.5 : 2.2, fx === "stadium" ? 3.2 : 2.5);
    const wet = ctx.createGain();
    wet.gain.value = fx === "stadium" ? 1.0 : 0.85;
    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    source.connect(dry);
    dry.connect(out);
    source.connect(conv);
    conv.connect(wet);
    if (fx === "stadium") {
      const delay = ctx.createDelay(1.0);
      delay.delayTime.value = 0.32;
      const fb = ctx.createGain();
      fb.gain.value = 0.3;
      wet.connect(delay);
      delay.connect(fb);
      fb.connect(delay);
      delay.connect(out);
    }
    wet.connect(out);
  } else if (fx === "telephone") {
    const bp = bandpass(400, 3000);
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 2.2);
    }
    drive.curve = curve;
    source.connect(bp.input);
    bp.output.connect(drive);
    drive.connect(out);
  } else if (fx === "radio") {
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 120;
    const presence = ctx.createBiquadFilter();
    presence.type = "peaking";
    presence.frequency.value = 3000;
    presence.Q.value = 1.1;
    presence.gain.value = 6;
    const drive = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * 2 - 1;
      curve[i] = Math.tanh(x * 1.6);
    }
    drive.curve = curve;
    source.connect(hp);
    hp.connect(presence);
    presence.connect(drive);
    drive.connect(out);
  } else {
    source.connect(out);
  }
  out.connect(ctx.destination);
}

function readDuration(src) {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.onloadedmetadata = () => resolve(audio.duration || 0);
    audio.onerror = () => resolve(0);
    audio.src = src;
  });
}

const blobToB64 = (blob) =>
  new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.readAsDataURL(blob);
  });

const b64ToBlob = (b64, type) => {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
};

function App() {
  const [tracks, setTracks] = useState({});
  const [playlists, setPlaylists] = useState([]);
  const [currentPlaylistId, setCurrentPlaylistId] = useState(null);
  const [settings, setSettings] = useState(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  const [currentTrackId, setCurrentTrackId] = useState(null);
  const [playback, setPlayback] = useState({ isPlaying: false, currentTime: 0, duration: 0 });
  const [cue, setCue] = useState({ trackId: null, isPlaying: false, currentTime: 0, duration: 0 });
  const [devices, setDevices] = useState([]);

  const [editorTrack, setEditorTrack] = useState(null);
  const [scheduleForId, setScheduleForId] = useState(null);
  const [exportForId, setExportForId] = useState(null);
  const [search, setSearch] = useState("");
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [talkActive, setTalkActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [banner, setBanner] = useState("");
  const [jingles, setJingles] = useState([]);
  const [jingleActive, setJingleActive] = useState(false);
  const [currentPeaks, setCurrentPeaks] = useState(null);
  const [micLive, setMicLive] = useState(false);
  const [license, setLicenseState] = useState(undefined);
  const [keyManagerOpen, setKeyManagerOpen] = useState(false);
  const [licenseStatusOpen, setLicenseStatusOpen] = useState(false);
  const [customFxOpen, setCustomFxOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [missingIds, setMissingIds] = useState(() => new Set());
  const [standby, setStandby] = useState({ trackId: null, faderPos: 0 });

  const engineRef = useRef(null);
  const micRef = useRef({ active: false });
  const micLiveRef = useRef({});
  const deviceIdRef = useRef(null);
  const schedRef = useRef({ start: {}, end: {} });
  const jinglesRef = useRef([]);
  const activeJinglesRef = useRef([]);
  const peaksCacheRef = useRef({});
  const playJingleRef = useRef(() => {});
  const cueInRef = useRef(() => {});
  const cueOutRef = useRef(() => {});
  const [autoStartPending, setAutoStartPending] = useState(null);
  jinglesRef.current = jingles;

  // ---- Load persisted state ----
  useEffect(() => {
    (async () => {
      const state = await platform.loadState();
      if (state) {
        setTracks(state.tracks || {});
        setPlaylists(state.playlists || []);
        setCurrentPlaylistId(state.currentPlaylistId || state.playlists?.[0]?.id || null);
        setSettings({ ...defaultSettings, ...(state.settings || {}), autoDuck: false });
        setJingles(state.jingles || []);
      }
      setLoaded(true);
    })();
  }, []);

  // ---- License (with device lock + optional online activation) ----
  useEffect(() => {
    (async () => {
      const dev = await platform.getDeviceId();
      deviceIdRef.current = dev;
      const l = await platform.getLicense();
      if (!l || !l.activated) {
        setLicenseState(l || {});
        return;
      }
      // Device lock
      if (l.deviceId && l.deviceId !== dev) {
        setLicenseState({ activated: false, legalAccepted: false, lockedNotice: true });
        return;
      }
      // Local expiry
      if (l.expiresAt && new Date(l.expiresAt) < new Date()) {
        setLicenseState({ activated: false, legalAccepted: false, expiredNotice: true });
        return;
      }
      // Online re-validation (best-effort; offline still works if server unreachable)
      if (l.online) {
        try {
          const r = await api.validate(l.key, dev);
          if (["revoked", "expired", "unknown", "not_registered"].includes(r.status)) {
            setLicenseState({ activated: false, legalAccepted: false, revokedNotice: r.status });
            return;
          }
        } catch {
          /* offline grace — keep working */
        }
      }
      setLicenseState(l);
    })();
  }, []);

  const activateLicense = async (key) => {
    const dev = deviceIdRef.current;
    // Try online first
    try {
      const r = await api.activate(key, dev);
      if (r.status === "ok") {
        const lic = {
          activated: true,
          key,
          deviceId: dev,
          online: true,
          dj: r.dj,
          expiresAt: r.expires_at,
          activatedAt: new Date().toISOString(),
          legalAccepted: false,
        };
        setLicenseState(lic);
        platform.setLicense(lic);
        return { ok: true };
      }
      if (r.status === "revoked") return { ok: false, message: "This key has been revoked." };
      if (r.status === "expired") return { ok: false, message: "This key has expired." };
      if (r.status === "cap_exceeded")
        return { ok: false, message: "This key has reached its device limit." };
      // status 'unknown' → not a server key; fall through to offline check
    } catch {
      /* server unreachable → offline path */
    }
    // Offline checksum validation
    const { validateKey } = await import("@/lib/license");
    if (validateKey(key)) {
      const lic = {
        activated: true,
        key,
        deviceId: dev,
        online: false,
        activatedAt: new Date().toISOString(),
        legalAccepted: false,
      };
      setLicenseState(lic);
      platform.setLicense(lic);
      return { ok: true };
    }
    return { ok: false, message: "That activation key isn't valid." };
  };
  const acceptLegal = () => {
    setLicenseState((l) => {
      const n = { ...l, legalAccepted: true };
      platform.setLicense(n);
      return n;
    });
  };

  // ---- Audio engine ----
  useEffect(() => {
    const engine = new AudioEngine(
      (s) => {
        setPlayback({ isPlaying: s.isPlaying, currentTime: s.currentTime, duration: s.duration });
        const t = engine.queue[s.index];
        setCurrentTrackId(t ? t.id : null);
      },
      (c) => setCue(c),
      (sb) => setStandby(sb)
    );
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  // ---- Apply settings to engine ----
  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.setAutoplay(settings.autoplay);
    e.setShuffle(settings.shuffle);
    e.setCrossfade(settings.crossfade, settings.crossfadeSeconds);
    e.setVolume(settings.volume);
    e.setMainSink(settings.programSink || "");
    e.setCueSink(settings.cueSink || "");
    e.setTrimSilence(settings.trimSilence);
    e.setLoopRegion(settings.loopRegion);
    e.setCueAutoFade(settings.cueAutoFade, settings.cueFadeSeconds);
    e.setFaderCurve(settings.faderCurve || "smooth");
    e.setSyncLock(!!settings.syncLock);
  }, [settings]);

  // ---- Ducking (manual Talk + mic auto-duck + jingle drops) ----
  useEffect(() => {
    const strong = talkActive || micActive || micLive;
    const jms = settings.jingleDuckMs ?? 220;
    if (strong) engineRef.current?.setDuck(true, 0.28, 220);
    else if (jingleActive) engineRef.current?.setDuck(true, 1 - (settings.jingleDuckDepth ?? 0.4), jms);
    else engineRef.current?.setDuck(false, undefined, jms);
  }, [talkActive, micActive, micLive, jingleActive, settings.jingleDuckDepth, settings.jingleDuckMs]);

  // ---- Mic live to air (with Voice FX) ----
  useEffect(() => {
    if (!micLive) {
      const m = micLiveRef.current;
      if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
      if (m.ctx) m.ctx.close();
      micLiveRef.current = {};
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        buildMicGraph(ctx, src, settings.voiceFx, settings.customFx);
        micLiveRef.current = { stream, ctx };
      } catch {
        setBanner("Microphone unavailable — mic to air turned off.");
        setMicLive(false);
      }
    })();
    return () => {
      cancelled = true;
      const m = micLiveRef.current;
      if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
      if (m.ctx) m.ctx.close();
      micLiveRef.current = {};
    };
  }, [micLive, settings.voiceFx, settings.customFx]);

  useEffect(() => {
    if (!settings.autoDuck) {
      const m = micRef.current;
      if (m.raf) cancelAnimationFrame(m.raf);
      if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
      if (m.ctx) m.ctx.close();
      micRef.current = { active: false };
      setMicActive(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        const ctx = new AC();
        const src = ctx.createMediaStreamSource(stream);
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        const data = new Uint8Array(an.frequencyBinCount);
        let quietSince = performance.now();
        micRef.current = { stream, ctx, active: false };
        const loop = () => {
          an.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          let next = micRef.current.active;
          if (rms > 0.06) {
            quietSince = performance.now();
            next = true;
          } else if (performance.now() - quietSince > 500) {
            next = false;
          }
          if (next !== micRef.current.active) {
            micRef.current.active = next;
            setMicActive(next);
          }
          micRef.current.raf = requestAnimationFrame(loop);
        };
        micRef.current.raf = requestAnimationFrame(loop);
      } catch {
        setBanner("Microphone access denied — auto-duck turned off.");
        setSettings((s) => ({ ...s, autoDuck: false }));
      }
    })();
    return () => {
      cancelled = true;
      const m = micRef.current;
      if (m.raf) cancelAnimationFrame(m.raf);
      if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
      if (m.ctx) m.ctx.close();
      micRef.current = { active: false };
    };
  }, [settings.autoDuck]);

  // ---- Enumerate audio output devices ----
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const load = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        setDevices(devs.filter((d) => d.kind === "audiooutput"));
      } catch {
        /* ignore */
      }
    };
    load();
    navigator.mediaDevices.addEventListener?.("devicechange", load);
    return () => navigator.mediaDevices.removeEventListener?.("devicechange", load);
  }, []);

  const currentPlaylist = useMemo(
    () => playlists.find((p) => p.id === currentPlaylistId) || null,
    [playlists, currentPlaylistId]
  );

  const queueTracks = useMemo(() => {
    if (settings.shuffleAll) {
      const seen = new Set();
      const out = [];
      for (const p of playlists) {
        for (const id of p.trackIds) {
          if (!seen.has(id) && tracks[id]) {
            seen.add(id);
            out.push(tracks[id]);
          }
        }
      }
      return out;
    }
    return currentPlaylist ? currentPlaylist.trackIds.map((id) => tracks[id]).filter(Boolean) : [];
  }, [settings.shuffleAll, playlists, currentPlaylist, tracks]);

  const getUrl = useCallback((t) => platform.getUrl(t), []);

  useEffect(() => {
    const e = engineRef.current;
    if (!e) return;
    e.syncQueue(queueTracks, getUrl, currentTrackId);
  }, [queueTracks, getUrl, currentTrackId]);

  // ---- Missing-file scan (badge + auto re-link status) ----
  const scanAvailability = useCallback(async (list) => {
    const missing = new Set();
    for (const t of list) {
      // eslint-disable-next-line no-await-in-loop
      const ok = await platform.exists(t);
      if (!ok) missing.add(t.id);
    }
    setMissingIds(missing);
  }, []);
  useEffect(() => {
    if (loaded) scanAvailability(queueTracks);
  }, [queueTracks, loaded, scanAvailability]);

  // ---- Broadcast now-playing (+ coming up) to the public /live page ----
  const nowTrack = currentTrackId ? tracks[currentTrackId] : null;
  useEffect(() => {
    if (!nowTrack) return;
    const next = standby.trackId ? tracks[standby.trackId] : null;
    api
      .setNowPlaying(
        nowTrack.title || nowTrack.name,
        nowTrack.artist || "",
        nowTrack.art || null,
        next ? { title: next.title || next.name, artist: next.artist || "", art: next.art || null } : null
      )
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackId, nowTrack?.title, nowTrack?.artist, nowTrack?.art, standby.trackId]);

  // ---- Persist ----
  useEffect(() => {
    if (!loaded) return;
    platform.saveState({ tracks, playlists, currentPlaylistId, settings, jingles });
  }, [tracks, playlists, currentPlaylistId, settings, jingles, loaded]);

  // ---- Background BPM detection for the current playlist (one track at a time) ----
  const bpmBusyRef = useRef(false);
  useEffect(() => {
    if (!loaded || bpmBusyRef.current) return;
    const eng = engineRef.current;
    if (!eng) return;
    const target = queueTracks.find((t) => t && t.bpm == null && !missingIds.has(t.id));
    if (!target) return;
    bpmBusyRef.current = true;
    let cancelled = false;
    (async () => {
      let bpm = null;
      try {
        bpm = await eng.bpmFor(target);
      } catch {
        /* ignore */
      }
      if (!cancelled) {
        setTracks((prev) =>
          prev[target.id] ? { ...prev, [target.id]: { ...prev[target.id], bpm: bpm || 0 } } : prev
        );
      }
      bpmBusyRef.current = false;
    })();
    return () => {
      cancelled = true;
    };
  }, [queueTracks, missingIds, loaded, tracks]);

  // ---- Waveform peaks for the on-air track ----
  useEffect(() => {
    let cancelled = false;
    const t = currentTrackId ? tracks[currentTrackId] : null;
    if (!t) {
      setCurrentPeaks(null);
      return;
    }
    if (peaksCacheRef.current[t.id]) {
      setCurrentPeaks(peaksCacheRef.current[t.id]);
      return;
    }
    setCurrentPeaks(null);
    (async () => {
      try {
        const url = await platform.getUrl(t);
        const buf = await decodeToBuffer(url);
        const pk = computePeaks(buf, 900);
        if (cancelled) return;
        peaksCacheRef.current[t.id] = pk;
        setCurrentPeaks(pk);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentTrackId, tracks]);

  // ---- Live hotkeys ----
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea" || e.target?.isContentEditable)
        return;
      const eng = engineRef.current;
      if (!eng) return;
      switch (e.code) {
        case "Space":
          e.preventDefault();
          eng.togglePlay();
          break;
        case "ArrowRight":
          e.preventDefault();
          eng.next();
          break;
        case "ArrowLeft":
          e.preventDefault();
          eng.prev();
          break;
        case "ArrowUp":
          e.preventDefault();
          setSettings((s) => ({ ...s, volume: Math.min(1, s.volume + 0.05) }));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSettings((s) => ({ ...s, volume: Math.max(0, s.volume - 0.05) }));
          break;
        case "KeyT":
          e.preventDefault();
          setTalkActive((v) => !v);
          break;
        case "KeyC":
          e.preventDefault();
          eng.cueStop();
          break;
        case "KeyI":
          e.preventDefault();
          cueInRef.current && cueInRef.current();
          break;
        case "KeyO":
          e.preventDefault();
          cueOutRef.current && cueOutRef.current();
          break;
        case "Backslash":
          e.preventDefault();
          if (eng.standbyArmed) eng.takeStandby();
          break;
        default:
          if (/^Digit[1-6]$/.test(e.code)) {
            e.preventDefault();
            playJingleRef.current(parseInt(e.code.slice(5), 10) - 1);
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- Scheduler (auto start/stop per show time) ----
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const cur = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const day = now.toDateString();
      playlists.forEach((pl) => {
        const s = pl.schedule;
        if (!s || !s.enabled) return;
        if (s.days && s.days.length && !s.days.includes(now.getDay())) return;
        if (s.start === cur && schedRef.current.start[pl.id] !== `${day} ${cur}`) {
          schedRef.current.start[pl.id] = `${day} ${cur}`;
          setCurrentPlaylistId(pl.id);
          setAutoStartPending(pl.id);
          setBanner(`⏱ Auto-started "${pl.name}"`);
        }
        if (s.autoStop !== false && s.end === cur && schedRef.current.end[pl.id] !== `${day} ${cur}`) {
          schedRef.current.end[pl.id] = `${day} ${cur}`;
          const e = engineRef.current;
          if (e && !e.active.paused) e.togglePlay();
          setBanner(`⏱ Show "${pl.name}" ended — playout stopped`);
        }
      });
    };
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [playlists]);

  useEffect(() => {
    if (autoStartPending && currentPlaylistId === autoStartPending && queueTracks.length) {
      engineRef.current?.playIndex(0);
      setAutoStartPending(null);
    }
  }, [autoStartPending, currentPlaylistId, queueTracks]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(""), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  // ---------------- Playlist actions ----------------
  const createPlaylist = (name) => {
    const pl = { id: uid(), name, trackIds: [] };
    setPlaylists((prev) => [...prev, pl]);
    setCurrentPlaylistId(pl.id);
  };
  const renamePlaylist = (id, name) =>
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
  const setSchedule = (id, schedule) =>
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, schedule } : p)));

  const deletePlaylist = (id) => {
    const pl = playlists.find((p) => p.id === id);
    const remaining = playlists.filter((p) => p.id !== id);
    setPlaylists(remaining);
    if (currentPlaylistId === id) setCurrentPlaylistId(remaining[0]?.id || null);
    if (pl) cleanupTracks(pl.trackIds, remaining);
  };

  const cleanupTracks = (candidateIds, remainingPlaylists) => {
    const stillUsed = new Set();
    remainingPlaylists.forEach((p) => p.trackIds.forEach((tid) => stillUsed.add(tid)));
    const toDelete = candidateIds.filter((tid) => !stillUsed.has(tid));
    if (toDelete.length === 0) return;
    setTracks((prev) => {
      const next = { ...prev };
      toDelete.forEach((tid) => {
        if (next[tid]) {
          platform.deleteFile(next[tid]);
          delete next[tid];
        }
      });
      return next;
    });
  };

  const appendTracksToCurrent = (newTracks, newIds) => {
    setTracks((prev) => ({ ...prev, ...newTracks }));
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id === currentPlaylistId ? { ...p, trackIds: [...p.trackIds, ...newIds] } : p
      )
    );
  };

  // ---------------- Import ----------------
  const addBrowserFiles = async (files) => {
    if (!currentPlaylist) return;
    const newTracks = {};
    const newIds = [];
    for (const file of files) {
      if (!/\.(mp3|wav|m4a)$/i.test(file.name)) continue;
      const id = uid();
      await putBlob(id, file);
      const url = URL.createObjectURL(file);
      const duration = await readDuration(url);
      URL.revokeObjectURL(url);
      const { title, artist, art } = await deriveNames(file, file.name);
      newTracks[id] = { id, name: file.name, size: file.size, type: file.type, duration, title, artist, art };
      newIds.push(id);
    }
    if (newIds.length) appendTracksToCurrent(newTracks, newIds);
  };

  const mergeDescriptors = async (picked) => {
    const newTracks = {};
    const newIds = [];
    for (const f of picked) {
      const id = f.id || uid();
      const url = await platform.getUrl({ ...f, id });
      const duration = url ? await readDuration(url) : 0;
      let blob = null;
      try {
        blob = url ? await (await fetch(url)).blob() : null;
      } catch {
        blob = null;
      }
      const { title, artist, art } = await deriveNames(blob, f.name);
      newTracks[id] = { id, name: f.name, size: f.size, path: f.path, duration, title, artist, art };
      newIds.push(id);
    }
    if (newIds.length) appendTracksToCurrent(newTracks, newIds);
  };

  const addDialogFiles = async () => {
    if (!currentPlaylist) return;
    const picked = await platform.importViaDialog();
    if (picked?.length) await mergeDescriptors(picked);
  };

  const handleDropFiles = async (fileList) => {
    if (!currentPlaylist) return;
    const files = Array.from(fileList).filter((f) => /\.(mp3|wav|m4a)$/i.test(f.name));
    if (!files.length) return;
    if (platform.isElectron && files[0].path) {
      const picked = await platform.importPaths(files.map((f) => f.path));
      if (picked?.length) await mergeDescriptors(picked);
    } else {
      await addBrowserFiles(files);
    }
  };

  // ---------------- Reorder / remove / replace ----------------
  const reorder = (from, to) => {
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== currentPlaylistId) return p;
        const ids = [...p.trackIds];
        const [moved] = ids.splice(from, 1);
        ids.splice(to, 0, moved);
        return { ...p, trackIds: ids };
      })
    );
  };

  const removeTrack = (index) => {
    if (!currentPlaylist) return;
    const removedId = currentPlaylist.trackIds[index];
    const nextPlaylists = playlists.map((p) =>
      p.id === currentPlaylistId ? { ...p, trackIds: p.trackIds.filter((_, i) => i !== index) } : p
    );
    setPlaylists(nextPlaylists);
    cleanupTracks([removedId], nextPlaylists);
  };

  // Edit Artist / Song Title shown in the studio track list.
  const updateTrackInfo = (trackId, info) => {
    setTracks((prev) =>
      prev[trackId] ? { ...prev, [trackId]: { ...prev[trackId], ...info } } : prev
    );
  };

  // Bulk-apply Title/Artist edits across the current playlist in one save.
  const bulkUpdateInfo = (updates) => {
    setTracks((prev) => {
      const next = { ...prev };
      for (const [id, info] of Object.entries(updates)) {
        if (next[id]) next[id] = { ...next[id], ...info };
      }
      return next;
    });
  };

  const replaceBrowserFile = async (index, file) => {
    if (!currentPlaylist) return;
    const oldId = currentPlaylist.trackIds[index];
    const id = uid();
    await putBlob(id, file);
    const url = URL.createObjectURL(file);
    const duration = await readDuration(url);
    URL.revokeObjectURL(url);
    const { title, artist, art } = await deriveNames(file, file.name);
    const newTrack = { id, name: file.name, size: file.size, type: file.type, duration, title, artist, art };
    setTracks((prev) => ({ ...prev, [id]: newTrack }));
    const nextPlaylists = playlists.map((p) =>
      p.id === currentPlaylistId
        ? { ...p, trackIds: p.trackIds.map((tid, i) => (i === index ? id : tid)) }
        : p
    );
    setPlaylists(nextPlaylists);
    cleanupTracks([oldId], nextPlaylists);
  };

  const replaceDialogFile = async (index) => {
    if (!currentPlaylist) return;
    const picked = await platform.importViaDialog();
    if (!picked?.length) return;
    const f = picked[0];
    const oldId = currentPlaylist.trackIds[index];
    const id = f.id || uid();
    const url = await platform.getUrl({ ...f, id });
    const duration = url ? await readDuration(url) : 0;
    let rblob = null;
    try {
      rblob = url ? await (await fetch(url)).blob() : null;
    } catch {
      rblob = null;
    }
    const { title, artist, art } = await deriveNames(rblob, f.name);
    const newTrack = { id, name: f.name, size: f.size, path: f.path, duration, title, artist, art };
    setTracks((prev) => ({ ...prev, [id]: newTrack }));
    const nextPlaylists = playlists.map((p) =>
      p.id === currentPlaylistId
        ? { ...p, trackIds: p.trackIds.map((tid, i) => (i === index ? id : tid)) }
        : p
    );
    setPlaylists(nextPlaylists);
    cleanupTracks([oldId], nextPlaylists);
  };

  // ---------------- Track editor save ----------------
  const saveEditedTrack = async (blob, name, format, duration) => {
    const { title, artist } = parseFilename(name);
    let meta;
    if (platform.isElectron) {
      const d = await platform.saveMedia(name, blob);
      meta = { id: d.id, name, path: d.path, size: d.size, duration, title, artist };
    } else {
      const id = uid();
      await putBlob(id, blob);
      meta = { id, name, type: format === "mp3" ? "audio/mpeg" : "audio/wav", duration, title, artist };
    }
    appendTracksToCurrent({ [meta.id]: meta }, [meta.id]);
    setBanner(`Saved "${name}" to ${currentPlaylist?.name}`);
  };

  // ---------------- Silence analysis ----------------
  const analyzeSilenceForCurrent = async () => {
    const targets = queueTracks.filter((t) => t.tailStart == null);
    if (!targets.length) return;
    setBanner("Analyzing silence for tight playout…");
    for (const t of targets) {
      try {
        const url = await platform.getUrl(t);
        const buf = await decodeToBuffer(url);
        const { leadIn, tailStart } = detectSilence(buf);
        setTracks((prev) => (prev[t.id] ? { ...prev, [t.id]: { ...prev[t.id], leadIn, tailStart } } : prev));
      } catch {
        /* ignore */
      }
    }
    setBanner("");
  };

  // ---------------- Share ----------------
  const exportPlaylist = async () => {
    if (!currentPlaylist || !currentPlaylist.trackIds.length) return;
    setBanner("Packaging playlist for sharing…");
    const out = { app: "hotlive95", version: 1, name: currentPlaylist.name, schedule: currentPlaylist.schedule, tracks: [] };
    for (const id of currentPlaylist.trackIds) {
      const t = tracks[id];
      if (!t) continue;
      const url = await platform.getUrl(t);
      const blob = await (await fetch(url)).blob();
      out.tracks.push({
        name: t.name,
        title: t.title,
        artist: t.artist,
        art: t.art,
        type: t.type || blob.type,
        duration: t.duration,
        leadIn: t.leadIn,
        tailStart: t.tailStart,
        data: await blobToB64(blob),
      });
    }
    const jsonBlob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(jsonBlob);
    a.download = `${currentPlaylist.name}.hlp.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    setBanner("");
  };

  const importPlaylist = async (file) => {
    setBanner("Importing shared playlist…");
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setBanner("That file is not a valid Hot Live 95 playlist.");
      return;
    }
    if (!data?.tracks) {
      setBanner("That file is not a valid Hot Live 95 playlist.");
      return;
    }
    const newTracks = {};
    const ids = [];
    for (const t of data.tracks) {
      const blob = b64ToBlob(t.data, t.type || "audio/mpeg");
      const derived = await deriveNames(blob, t.name);
      const names = {
        title: t.title || derived.title,
        artist: t.artist || derived.artist,
        art: t.art || derived.art,
      };
      let meta;
      if (platform.isElectron) {
        const d = await platform.saveMedia(t.name, blob);
        meta = { id: d.id, name: t.name, path: d.path, size: d.size, duration: t.duration, leadIn: t.leadIn, tailStart: t.tailStart, title: names.title, artist: names.artist, art: names.art };
      } else {
        const id = uid();
        await putBlob(id, blob);
        meta = { id, name: t.name, type: t.type, duration: t.duration, leadIn: t.leadIn, tailStart: t.tailStart, title: names.title, artist: names.artist, art: names.art };
      }
      newTracks[meta.id] = meta;
      ids.push(meta.id);
    }
    const pl = { id: uid(), name: data.name || "Imported Playlist", trackIds: ids, schedule: data.schedule };
    setTracks((prev) => ({ ...prev, ...newTracks }));
    setPlaylists((prev) => [...prev, pl]);
    setCurrentPlaylistId(pl.id);
    setBanner(`Imported "${pl.name}" (${ids.length} tracks)`);
  };

  // ---------------- Transport + cue + toggles ----------------
  const playTrack = (index) => engineRef.current?.playIndex(index);
  const togglePlay = () => engineRef.current?.togglePlay();
  const next = () => engineRef.current?.next();
  const prev = () => engineRef.current?.prev();
  const seek = (t) => engineRef.current?.seek(t);

  const cueTrack = (index) => {
    const t = queueTracks[index];
    if (t) engineRef.current?.cuePlay(t);
  };
  const cueToggle = () => engineRef.current?.cueToggle();
  const cueCurrent = () => {
    if (!currentTrackId) return;
    if (cue.trackId === currentTrackId) cueToggle();
    else {
      const t = tracks[currentTrackId];
      if (t) engineRef.current?.cuePlay(t);
    }
  };
  const cueStop = () => engineRef.current?.cueStop();
  const cueSeek = (t) => engineRef.current?.cueSeek(t);

  // ---- Standby deck + manual crossfader ----
  const armStandby = (index) => {
    const t = queueTracks[index];
    if (t) engineRef.current?.loadStandby(t);
  };
  const armStandbyFromCue = () => {
    if (!cue.trackId) return;
    const t = tracks[cue.trackId];
    if (t) engineRef.current?.loadStandby(t);
  };
  const setFader = (pos) => engineRef.current?.setFader(pos);
  const takeStandby = () => engineRef.current?.takeStandby();
  const clearStandby = () => engineRef.current?.clearStandby();
  const syncStandby = () => engineRef.current?.syncStandby();
  const nudgeStandby = (dir) => engineRef.current?.nudgeStandby(dir);
  const setFaderCurve = (c) => setSettings((s) => ({ ...s, faderCurve: c }));
  const toggleSyncLock = () => setSettings((s) => ({ ...s, syncLock: !s.syncLock }));
  const getBeat = useCallback(() => engineRef.current?.beatInfo(), []);

  const setVolume = (v) => setSettings((s) => ({ ...s, volume: v }));
  const toggleAutoplay = () => setSettings((s) => ({ ...s, autoplay: !s.autoplay }));
  const toggleShuffle = () => setSettings((s) => ({ ...s, shuffle: !s.shuffle }));
  const toggleShuffleAll = () =>
    setSettings((s) => {
      const on = !s.shuffleAll;
      return { ...s, shuffleAll: on, shuffle: on ? true : s.shuffle };
    });

  const [sleepEndsAt, setSleepEndsAt] = useState(null);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  useEffect(() => {
    if (!sleepEndsAt) {
      setSleepRemaining(0);
      return;
    }
    const tick = () => {
      const rem = sleepEndsAt - Date.now();
      if (rem <= 0) {
        engineRef.current?.fadeOutStop(6);
        setSleepEndsAt(null);
        setSleepRemaining(0);
      } else {
        setSleepRemaining(rem);
      }
    };
    tick();
    const iv = setInterval(tick, 500);
    return () => clearInterval(iv);
  }, [sleepEndsAt]);
  const startSleep = (minutes) => setSleepEndsAt(Date.now() + minutes * 60000);
  const cancelSleep = () => setSleepEndsAt(null);

  const [wakeAt, setWakeAt] = useState(null);
  const [wakeLabel, setWakeLabel] = useState("");
  useEffect(() => {
    if (!wakeAt) return;
    const iv = setInterval(() => {
      if (Date.now() >= wakeAt) {
        engineRef.current?.fadeInStart(6);
        setWakeAt(null);
        setWakeLabel("");
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [wakeAt]);
  const setWake = (timeStr) => {
    if (!timeStr) return;
    const [h, m] = timeStr.split(":").map(Number);
    const t = new Date();
    t.setHours(h, m, 0, 0);
    if (t.getTime() <= Date.now()) t.setDate(t.getDate() + 1);
    setWakeAt(t.getTime());
    setWakeLabel(timeStr);
  };
  const cancelWake = () => {
    setWakeAt(null);
    setWakeLabel("");
  };
  const toggleCrossfade = () => setSettings((s) => ({ ...s, crossfade: !s.crossfade }));
  const setCrossfadeSeconds = (n) => setSettings((s) => ({ ...s, crossfadeSeconds: n }));
  const setProgramSink = (id) => setSettings((s) => ({ ...s, programSink: id }));
  const setCueSink = (id) => setSettings((s) => ({ ...s, cueSink: id }));
  const toggleAutoDuck = () => setSettings((s) => ({ ...s, autoDuck: !s.autoDuck }));
  const setVoiceFx = (v) => setSettings((s) => ({ ...s, voiceFx: v }));
  const toggleMicLive = () => setMicLive((v) => !v);
  const toggleCueFade = () => setSettings((s) => ({ ...s, cueAutoFade: !s.cueAutoFade }));
  const setCueFadeSeconds = (n) => setSettings((s) => ({ ...s, cueFadeSeconds: n }));
  const saveCustomFx = (fx) => setSettings((s) => ({ ...s, customFx: fx, voiceFx: "custom" }));

  const setCueIn = () => {
    if (!currentTrackId) return;
    setTracks((prev) => ({ ...prev, [currentTrackId]: { ...prev[currentTrackId], cueIn: playback.currentTime } }));
    engineRef.current?.seek(playback.currentTime);
    setBanner("Start cue set — cursor parks here");
  };
  const setCueOut = () => {
    if (!currentTrackId) return;
    setTracks((prev) => ({ ...prev, [currentTrackId]: { ...prev[currentTrackId], cueOut: playback.currentTime } }));
    setBanner("End cue set");
  };
  const setCueInAt = (t) => {
    if (!currentTrackId) return;
    setTracks((prev) => ({ ...prev, [currentTrackId]: { ...prev[currentTrackId], cueIn: Math.max(0, t) } }));
  };
  const setCueOutAt = (t) => {
    if (!currentTrackId) return;
    setTracks((prev) => ({ ...prev, [currentTrackId]: { ...prev[currentTrackId], cueOut: Math.max(0, t) } }));
  };
  cueInRef.current = setCueIn;
  cueOutRef.current = setCueOut;
  const clearCues = () => {
    if (!currentTrackId) return;
    setTracks((prev) => ({ ...prev, [currentTrackId]: { ...prev[currentTrackId], cueIn: undefined, cueOut: undefined } }));
  };
  const toggleLoopRegion = () => setSettings((s) => ({ ...s, loopRegion: !s.loopRegion }));
  const toggleTrimSilence = () =>
    setSettings((s) => {
      const on = !s.trimSilence;
      if (on) analyzeSilenceForCurrent();
      return { ...s, trimSilence: on };
    });

  // ---------------- Voice track insert ----------------
  const saveVoiceTrack = async (blob, name, index, duration, transcript) => {
    const title = name.replace(/\.[^.]+$/, "");
    let meta;
    if (platform.isElectron) {
      const d = await platform.saveMedia(name, blob);
      meta = { id: d.id, name, path: d.path, size: d.size, duration, title, artist: "Voice", transcript: transcript || "" };
    } else {
      const id = uid();
      await putBlob(id, blob);
      meta = { id, name, type: "audio/wav", duration, title, artist: "Voice", transcript: transcript || "" };
    }
    setTracks((prev) => ({ ...prev, [meta.id]: meta }));
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== currentPlaylistId) return p;
        const ids = [...p.trackIds];
        ids.splice(Math.max(0, Math.min(index, ids.length)), 0, meta.id);
        return { ...p, trackIds: ids };
      })
    );
    setBanner(`Added voice track "${name}"`);
  };

  // ---------------- Jingles ----------------
  const assignJingleBrowser = async (index, file) => {
    const id = uid();
    await putBlob(id, file);
    const j = { id, name: file.name, type: file.type };
    setJingles((prev) => {
      const n = [...prev];
      n[index] = j;
      return n;
    });
  };
  const assignJingleDialog = async (index) => {
    const picked = await platform.importViaDialog();
    if (!picked?.length) return;
    const f = picked[0];
    const j = { id: f.id || uid(), name: f.name, path: f.path };
    setJingles((prev) => {
      const n = [...prev];
      n[index] = j;
      return n;
    });
  };
  // Load a jingle pad by dragging a playlist track onto it.
  const assignJingleFromTrack = async (index, trackId) => {
    const t = tracks[trackId];
    if (!t) return;
    let j;
    if (t.path) {
      j = { id: uid(), name: t.title || t.name, path: t.path };
    } else {
      const url = await platform.getUrl(t);
      let blob = null;
      try {
        blob = url ? await (await fetch(url)).blob() : null;
      } catch {
        blob = null;
      }
      const id = uid();
      if (blob) await putBlob(id, blob);
      j = { id, name: t.title || t.name, type: t.type };
    }
    setJingles((prev) => {
      const n = [...prev];
      n[index] = j;
      return n;
    });
    setBanner(`Loaded "${j.name}" to Pad ${index + 1}`);
  };

  const clearJingle = (index) =>
    setJingles((prev) => {
      const n = [...prev];
      n[index] = undefined;
      return n;
    });
  const playJingle = async (index) => {
    const j = jinglesRef.current[index];
    if (!j) return;
    const url = await platform.getUrl(j);
    if (!url) return;
    const a = new Audio(url);
    a.volume = typeof j.volume === "number" ? j.volume : 1;
    activeJinglesRef.current.push(a);
    setJingleActive(true);
    a.onended = () => {
      a.src = "";
      activeJinglesRef.current = activeJinglesRef.current.filter((x) => x !== a);
      if (activeJinglesRef.current.length === 0) setJingleActive(false);
    };
    try {
      await a.play();
    } catch {
      /* ignore */
    }
  };
  playJingleRef.current = playJingle;
  const setJingleVolume = (index, volume) =>
    setJingles((prev) => {
      const n = [...prev];
      if (n[index]) n[index] = { ...n[index], volume };
      return n;
    });
  const stopJingles = () => {
    activeJinglesRef.current.forEach((a) => {
      a.pause();
      a.src = "";
    });
    activeJinglesRef.current = [];
    setJingleActive(false);
  };

  const currentTrack = currentTrackId ? tracks[currentTrackId] : null;
  const cueTrackObj = cue.trackId ? tracks[cue.trackId] : null;
  const standbyTrackObj = standby.trackId ? tracks[standby.trackId] : null;
  const onAir = playback.isPlaying;

  const durationOf = useCallback(
    (pl) => pl.trackIds.reduce((sum, id) => sum + (tracks[id]?.duration || 0), 0),
    [tracks]
  );

  if (license === undefined) {
    return (
      <div
        className="h-screen w-screen hl-app-bg grid place-items-center text-[var(--hl-muted)]"
        data-testid="app-splash"
      >
        Loading…
      </div>
    );
  }
  if (!license.activated || !license.legalAccepted) {
    return (
      <LicenseGate license={license} onActivate={activateLicense} onAcceptLegal={acceptLegal} />
    );
  }

  return (
    <div className="min-h-screen md:h-screen w-full md:w-screen flex flex-col hl-app-bg overflow-x-hidden pb-16 md:pb-0" data-testid="app-root">
      <Header onAir={onAir} nowPlaying={currentTrack ? currentTrack.name : null} search={search} onSearch={setSearch} onOpenKeyManager={() => setKeyManagerOpen(true)} onOpenLicenseStatus={() => setLicenseStatusOpen(true)} />

      {banner && (
        <div
          className="px-4 py-2 text-center text-sm bg-[rgba(255,90,31,0.15)] border-b border-[var(--hl-fire)] text-[var(--hl-fire)]"
          data-testid="app-banner"
        >
          {banner}
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <Sidebar
          playlists={playlists}
          currentPlaylistId={currentPlaylistId}
          onSelect={setCurrentPlaylistId}
          onCreate={createPlaylist}
          onRename={renamePlaylist}
          onDelete={deletePlaylist}
          onSchedule={setScheduleForId}
          onExport={setExportForId}
          onImportPlaylist={importPlaylist}
          onBatchExport={() => setBatchOpen(true)}
          durationOf={durationOf}
          shuffleAll={settings.shuffleAll}
          onToggleShuffleAll={toggleShuffleAll}
        />
        <main className="flex-1 flex flex-col min-w-0 min-h-[38vh] md:min-h-0">
          <TrackList
            playlist={currentPlaylist}
            playlists={playlists}
            tracks={tracks}
            search={search}
            onSelectPlaylist={setCurrentPlaylistId}
            currentTrackId={currentTrackId}
            cueTrackId={cue.trackId}
            standbyTrackId={standby.trackId}
            isPlaying={playback.isPlaying}
            isElectron={platform.isElectron}
            onAddFiles={addBrowserFiles}
            onImportDialog={addDialogFiles}
            onDropFiles={handleDropFiles}
            onReorder={reorder}
            onRemove={removeTrack}
            onReplaceFiles={replaceBrowserFile}
            onReplaceDialog={replaceDialogFile}
            onPlayTrack={playTrack}
            onTogglePlay={togglePlay}
            onCueTrack={cueTrack}
            onArmStandby={armStandby}
            onEditTrack={(i) => setEditorTrack(queueTracks[i])}
            onExportPlaylist={exportPlaylist}
            onRecordVoice={() => setVoiceOpen(true)}
            missingIds={missingIds}
            onUpdateTrackInfo={updateTrackInfo}
            onRescan={() => scanAvailability(queueTracks)}
            onBulkEdit={() => setBulkOpen(true)}
          />
        </main>
      </div>

      <JingleBar
        jingles={jingles}
        isElectron={platform.isElectron}
        onAssignFile={assignJingleBrowser}
        onAssignDialog={assignJingleDialog}
        onAssignTrack={assignJingleFromTrack}
        onPlay={playJingle}
        onClear={clearJingle}
        onSetVolume={setJingleVolume}
        duckDepth={settings.jingleDuckDepth ?? 0.4}
        onSetDuckDepth={(d) => setSettings((s) => ({ ...s, jingleDuckDepth: d }))}
        duckMs={settings.jingleDuckMs ?? 220}
        onSetDuckMs={(ms) => setSettings((s) => ({ ...s, jingleDuckMs: ms }))}
        standbyTrack={standbyTrackObj}
        faderPos={standby.faderPos}
        onFader={setFader}
        onTake={takeStandby}
        onClearStandby={clearStandby}
        faderCurve={settings.faderCurve || "smooth"}
        onSetFaderCurve={setFaderCurve}
        onSync={syncStandby}
        onNudge={nudgeStandby}
        onairBpm={standby.onairBpm}
        standbyBpm={standby.standbyBpm}
        syncRate={standby.syncRate}
        syncLock={!!settings.syncLock}
        onToggleSyncLock={toggleSyncLock}
        getBeat={getBeat}
        onStop={stopJingles}
      />

      <CuePanel
        cueTrack={cueTrackObj}
        cue={cue}
        onToggle={cueToggle}
        onStop={cueStop}
        onSeek={cueSeek}
        devices={devices}
        programSink={settings.programSink}
        cueSink={settings.cueSink}
        onProgramSink={setProgramSink}
        onCueSink={setCueSink}
        onArmStandby={armStandbyFromCue}
      />

      <PlayerBar
        track={currentTrack}
        peaks={currentPeaks}
        isPlaying={playback.isPlaying}
        currentTime={playback.currentTime}
        duration={playback.duration}
        volume={settings.volume}
        autoplay={settings.autoplay}
        shuffle={settings.shuffle}
        shuffleAll={settings.shuffleAll}
        sleepRemaining={sleepRemaining}
        onStartSleep={startSleep}
        onCancelSleep={cancelSleep}
        wakeLabel={wakeLabel}
        onSetWake={setWake}
        onCancelWake={cancelWake}
        crossfade={settings.crossfade}
        crossfadeSeconds={settings.crossfadeSeconds}
        trimSilence={settings.trimSilence}
        loopRegion={settings.loopRegion}
        talkActive={talkActive}
        autoDuck={settings.autoDuck}
        micActive={micActive}
        micLive={micLive}
        voiceFx={settings.voiceFx}
        cueIn={currentTrack?.cueIn}
        cueOut={currentTrack?.cueOut}
        cueAutoFade={settings.cueAutoFade}
        cueFadeSeconds={settings.cueFadeSeconds}
        onTogglePlay={togglePlay}
        onNext={next}
        onPrev={prev}
        onSeek={seek}
        onVolume={setVolume}
        onToggleAutoplay={toggleAutoplay}
        onToggleShuffle={toggleShuffle}
        onToggleCrossfade={toggleCrossfade}
        onCrossfadeSeconds={setCrossfadeSeconds}
        onToggleTrimSilence={toggleTrimSilence}
        onToggleLoop={toggleLoopRegion}
        onToggleTalk={() => setTalkActive((v) => !v)}
        onToggleAutoDuck={toggleAutoDuck}
        onToggleMic={toggleMicLive}
        onVoiceFx={setVoiceFx}
        onSetCueIn={setCueIn}
        onSetCueOut={setCueOut}
        onSetCueInAt={setCueInAt}
        onSetCueOutAt={setCueOutAt}
        onClearCues={clearCues}
        onToggleCueFade={toggleCueFade}
        onCueFadeSeconds={setCueFadeSeconds}
        onEditCustomFx={() => setCustomFxOpen(true)}
      />

      <MobileMiniPlayer
        track={currentTrack}
        isPlaying={playback.isPlaying}
        currentTime={playback.currentTime}
        duration={playback.duration}
        cueing={cue.trackId === currentTrackId && cue.isPlaying}
        onCue={cueCurrent}
        shuffle={settings.shuffle}
        onToggleShuffle={toggleShuffle}
        onTogglePlay={togglePlay}
        onNext={next}
        onPrev={prev}
      />

      <InstallPrompt />

      {editorTrack && (
        <TrackEditor
          track={editorTrack}
          getUrl={getUrl}
          onClose={() => setEditorTrack(null)}
          onSave={saveEditedTrack}
        />
      )}

      {scheduleForId && (
        <ScheduleModal
          playlist={playlists.find((p) => p.id === scheduleForId)}
          onClose={() => setScheduleForId(null)}
          onSave={setSchedule}
        />
      )}

      {exportForId && (
        <ExportPlaylistModal
          playlist={playlists.find((p) => p.id === exportForId)}
          tracks={tracks}
          defaultCrossfade={settings.crossfade}
          crossfadeSeconds={settings.crossfadeSeconds}
          onClose={() => setExportForId(null)}
        />
      )}

      {batchOpen && (
        <BatchExportModal
          playlists={playlists}
          tracks={tracks}
          defaultCrossfade={settings.crossfade}
          crossfadeSeconds={settings.crossfadeSeconds}
          onClose={() => setBatchOpen(false)}
        />
      )}

      {bulkOpen && currentPlaylist && (
        <BulkTagModal
          playlist={currentPlaylist}
          tracks={tracks}
          getUrl={getUrl}
          onSaveAll={bulkUpdateInfo}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {voiceOpen && (
        <VoiceRecorder
          existingTracks={queueTracks}
          playlists={playlists}
          tracks={tracks}
          jingles={jingles}
          getUrl={getUrl}
          defaultIndex={
            currentTrackId
              ? queueTracks.findIndex((t) => t.id === currentTrackId) + 1
              : queueTracks.length
          }
          onClose={() => setVoiceOpen(false)}
          onSave={saveVoiceTrack}
        />
      )}

      {keyManagerOpen && <KeyManager onClose={() => setKeyManagerOpen(false)} />}

      {licenseStatusOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4" data-testid="license-status-modal" onMouseDown={(e) => e.target === e.currentTarget && setLicenseStatusOpen(false)}>
          <div className="w-full max-w-lg hl-panel rounded-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
              <div className="flex items-center gap-2">
                <IdCard size={18} className="text-[var(--hl-fire)]" />
                <h2 className="font-display text-lg">My License</h2>
              </div>
              <button data-testid="license-status-close" onClick={() => setLicenseStatusOpen(false)} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10"><X size={18} /></button>
            </div>
            <div className="p-5">
              <LicenseStatus defaultKey={license?.key || ""} />
            </div>
          </div>
        </div>
      )}

      {customFxOpen && (
        <CustomFxModal
          value={settings.customFx}
          onClose={() => setCustomFxOpen(false)}
          onSave={saveCustomFx}
        />
      )}
    </div>
  );
}

export default App;
