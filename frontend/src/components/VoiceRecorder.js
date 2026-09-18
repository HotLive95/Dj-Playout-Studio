import React, { useRef, useState, useEffect } from "react";
import { Mic, Square, Play, Pause, Save, X, Circle, Music2, Headphones, AlertTriangle, Timer, Waves, Star, Trash2 } from "lucide-react";
import { formatTime } from "../lib/format";
import { audioCtx, bufferToWav, computePeaks } from "../lib/audioProcessing";

const PRESET_KEY = "hotlive95_bed_presets";
const loadPresets = () => {
  try {
    return JSON.parse(localStorage.getItem(PRESET_KEY) || "[]");
  } catch {
    return [];
  }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Voice-over booth: record a mic take over an optional music BED with headphone
// monitoring, a 3-2-1 count-in, live auto-ducking of the bed under your voice,
// a waveform trim before saving, and saveable bed presets.
export default function VoiceRecorder({
  existingTracks,
  defaultIndex,
  playlists = [],
  tracks = {},
  jingles = [],
  getUrl,
  onClose,
  onSave,
}) {
  const [status, setStatus] = useState("idle"); // idle | recording | recorded | error
  const [elapsed, setElapsed] = useState(0);
  const [name, setName] = useState(
    `Voice Track ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
  );
  const [insertIndex, setInsertIndex] = useState(defaultIndex ?? existingTracks.length);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(null);

  // --- Music bed + monitoring settings ---
  const [bedType, setBedType] = useState("none");
  const [bedPlaylistId, setBedPlaylistId] = useState(playlists[0]?.id || "");
  const [bedStartIndex, setBedStartIndex] = useState(0);
  const [bedJingleIndex, setBedJingleIndex] = useState(Math.max(0, jingles.findIndex((j) => !!j)));
  const [bedFile, setBedFile] = useState(null);
  const [bedVolume, setBedVolume] = useState(0.5);
  const [micMonitor, setMicMonitor] = useState(false);
  const [micMonitorVol, setMicMonitorVol] = useState(0.8);
  const [mixBed, setMixBed] = useState(false);
  const [bedNowPlaying, setBedNowPlaying] = useState("");
  const [countIn, setCountIn] = useState(true);
  const [autoDuck, setAutoDuck] = useState(true);
  const [duckDepth, setDuckDepth] = useState(0.6);
  const [loudnessMatch, setLoudnessMatch] = useState(true);
  const [bedFades, setBedFades] = useState(true);

  // --- Presets ---
  const [presets, setPresets] = useState(loadPresets);
  const [presetName, setPresetName] = useState("");

  // --- Trim + Punch (recorded) ---
  const [recBuffer, setRecBuffer] = useState(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [waveMode, setWaveMode] = useState("trim"); // trim | punch
  const [punchStart, setPunchStart] = useState(0);
  const [punchEnd, setPunchEnd] = useState(0);
  const [punching, setPunching] = useState(false);
  const waveRef = useRef(null);
  const dragHandleRef = useRef(null);

  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  const blobRef = useRef(null);
  const previewRef = useRef(null);
  const timerRef = useRef(null);
  const ctxRef = useRef(null);
  const micMonRef = useRef(null);
  const mixDestRef = useRef(null);
  const bedElRef = useRef(null);
  const bedGainRef = useRef(null);
  const bedItemsRef = useRef([]);
  const bedPosRef = useRef(0);
  const bedFileUrlRef = useRef(null);
  const duckRafRef = useRef(null);
  const bedBaseRef = useRef(bedVolume);
  const autoDuckRef = useRef(autoDuck);
  const duckDepthRef = useRef(duckDepth);
  const recStartRef = useRef(0);
  const fadingOutRef = useRef(false);
  const fadeOutStartRef = useRef(0);
  const mixBedRef = useRef(mixBed);
  const bedFadesRef = useRef(bedFades);
  const punchRef = useRef(false);
  const FADE_SEC = 1.2;

  useEffect(() => {
    return () => teardown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (micMonRef.current) micMonRef.current.gain.value = micMonitor ? micMonitorVol : 0;
  }, [micMonitor, micMonitorVol]);
  useEffect(() => {
    bedBaseRef.current = bedVolume;
  }, [bedVolume]);
  useEffect(() => {
    autoDuckRef.current = autoDuck;
  }, [autoDuck]);
  useEffect(() => {
    duckDepthRef.current = duckDepth;
  }, [duckDepth]);
  useEffect(() => {
    mixBedRef.current = mixBed;
  }, [mixBed]);
  useEffect(() => {
    bedFadesRef.current = bedFades;
  }, [bedFades]);

  // Redraw the trim/punch waveform.
  useEffect(() => {
    if (status !== "recorded" || !recBuffer || !waveRef.current) return;
    const c = waveRef.current;
    const ctx = c.getContext("2d");
    const W = (c.width = c.clientWidth * 2);
    const H = (c.height = c.clientHeight * 2);
    ctx.clearRect(0, 0, W, H);
    const peaks = computePeaks(recBuffer, Math.floor(W / 3));
    const dur = recBuffer.duration || 1;
    const isPunch = waveMode === "punch";
    const aS = isPunch ? punchStart : trimStart;
    const aE = isPunch ? punchEnd : trimEnd;
    const sX = (aS / dur) * W;
    const eX = (aE / dur) * W;
    const selColor = isPunch ? "#3aa0ff" : "#ff5a1f";
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / peaks.length) * W;
      const h = Math.max(2, peaks[i] * H * 0.9);
      ctx.fillStyle = x >= sX && x <= eX ? selColor : "#3a3a42";
      ctx.fillRect(x, (H - h) / 2, 2, h);
    }
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, sX, H);
    ctx.fillRect(eX, 0, W - eX, H);
  }, [status, recBuffer, trimStart, trimEnd, punchStart, punchEnd, waveMode]);

  const teardown = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (duckRafRef.current) cancelAnimationFrame(duckRafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (previewRef.current) previewRef.current.pause();
    if (bedElRef.current) {
      bedElRef.current.pause();
      bedElRef.current.onended = null;
    }
    if (bedFileUrlRef.current) {
      URL.revokeObjectURL(bedFileUrlRef.current);
      bedFileUrlRef.current = null;
    }
    try {
      if (ctxRef.current && ctxRef.current.state !== "closed") ctxRef.current.close();
    } catch {
      /* ignore */
    }
    ctxRef.current = null;
  };

  const buildBedItems = () => {
    if (bedType === "playlist") {
      const pl = playlists.find((p) => p.id === bedPlaylistId);
      if (!pl) return [];
      return pl.trackIds
        .slice(bedStartIndex)
        .map((id) => tracks[id])
        .filter(Boolean)
        .map((t) => ({ kind: "track", item: t, label: t.title || t.name }));
    }
    if (bedType === "jingle") {
      const j = jingles[bedJingleIndex];
      return j ? [{ kind: "track", item: j, label: j.name }] : [];
    }
    if (bedType === "upload" && bedFile) return [{ kind: "file", item: bedFile, label: bedFile.name }];
    return [];
  };

  const loadBedAt = async (pos) => {
    const items = bedItemsRef.current;
    const el = bedElRef.current;
    if (!items.length || !el) return;
    const n = items.length;
    const idx = ((pos % n) + n) % n;
    bedPosRef.current = idx;
    const it = items[idx];
    let url;
    if (it.kind === "file") {
      if (bedFileUrlRef.current) URL.revokeObjectURL(bedFileUrlRef.current);
      bedFileUrlRef.current = URL.createObjectURL(it.item);
      url = bedFileUrlRef.current;
    } else {
      url = await getUrl(it.item);
    }
    if (!url) return;
    setBedNowPlaying(it.label);
    el.src = url;
    try {
      el.currentTime = 0;
      await el.play();
    } catch {
      /* ignore */
    }
  };

  const beep = (ctx, freq = 880, dur = 0.12) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq;
    o.type = "sine";
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  };

  const startDuckLoop = (ctx, analyser) => {
    const data = new Uint8Array(analyser.fftSize);
    const loop = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      const talking = rms > 0.06;
      if (bedGainRef.current) {
        // Bed fade in at open / out at close (only relevant when the bed is
        // mixed into the recording).
        let env = 1;
        if (bedFadesRef.current && mixBedRef.current) {
          const t = ctx.currentTime - recStartRef.current;
          if (t < FADE_SEC) env = Math.max(0, t / FADE_SEC);
          if (fadingOutRef.current) {
            const ft = ctx.currentTime - fadeOutStartRef.current;
            env = Math.min(env, Math.max(0, 1 - ft / FADE_SEC));
          }
        }
        const base = bedBaseRef.current * env;
        const target = autoDuckRef.current && talking ? base * (1 - duckDepthRef.current) : base;
        bedGainRef.current.gain.setTargetAtTime(Math.max(0, target), ctx.currentTime, 0.08);
      }
      duckRafRef.current = requestAnimationFrame(loop);
    };
    duckRafRef.current = requestAnimationFrame(loop);
  };

  // RMS-based loudness normalization toward a broadcast target with a peak
  // ceiling, applied in-place to an AudioBuffer.
  const normalizeLoudness = (buf) => {
    const TARGET_RMS = 0.16; // ~ -16 dBFS RMS
    const CEILING = 0.97;
    let sum = 0;
    let n = 0;
    let peak = 0;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        sum += d[i] * d[i];
        n++;
        if (a > peak) peak = a;
      }
    }
    if (n === 0) return;
    const rms = Math.sqrt(sum / n);
    if (rms < 0.0005) return; // near silence — leave alone
    let gain = TARGET_RMS / rms;
    if (peak * gain > CEILING) gain = CEILING / peak;
    if (Math.abs(gain - 1) < 0.02) return;
    for (let ch = 0; ch < buf.numberOfChannels; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = Math.max(-1, Math.min(1, d[i] * gain));
    }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const micSrc = ctx.createMediaStreamSource(stream);
      const micMon = ctx.createGain();
      micMon.gain.value = micMonitor ? micMonitorVol : 0;
      micSrc.connect(micMon);
      micMon.connect(ctx.destination);
      micMonRef.current = micMon;

      const mixDest = ctx.createMediaStreamDestination();
      micSrc.connect(mixDest);
      mixDestRef.current = mixDest;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      micSrc.connect(analyser);

      const items = buildBedItems();
      bedItemsRef.current = items;
      bedPosRef.current = 0;
      if (items.length) {
        const el = new Audio();
        el.crossOrigin = "anonymous";
        el.preload = "auto";
        bedElRef.current = el;
        const bedSrc = ctx.createMediaElementSource(el);
        const bedGain = ctx.createGain();
        bedGain.gain.value = bedVolume;
        bedGainRef.current = bedGain;
        bedSrc.connect(bedGain);
        bedGain.connect(ctx.destination);
        if (mixBed) bedGain.connect(mixDest);
        el.onended = () => loadBedAt(bedPosRef.current + 1);
      }

      // 3-2-1 count-in (beeps in headphones, not recorded).
      if (countIn) {
        for (let c = 3; c >= 1; c--) {
          setCountdown(c);
          beep(ctx, c === 1 ? 1200 : 880, 0.14);
          // eslint-disable-next-line no-await-in-loop
          await wait(1000);
        }
        setCountdown(null);
        if (!ctxRef.current) return; // closed while counting
      }

      if (bedElRef.current) await loadBedAt(0);
      recStartRef.current = ctx.currentTime;
      fadingOutRef.current = false;
      punchRef.current = false;
      startDuckLoop(ctx, analyser);

      const rec = new MediaRecorder(mixDest.stream);
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        blobRef.current = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blobRef.current);
        previewRef.current = new Audio(url);
        previewRef.current.ontimeupdate = () => {
          if (previewRef.current && previewRef.current.currentTime >= trimEndRef.current) {
            previewRef.current.pause();
            setPlaying(false);
          }
        };
        previewRef.current.onended = () => setPlaying(false);
        try {
          const buf = await audioCtx().decodeAudioData((await blobRef.current.arrayBuffer()).slice(0));
          setRecBuffer(buf);
          setTrimStart(0);
          setTrimEnd(buf.duration);
          trimEndRef.current = buf.duration;
        } catch {
          /* preview only */
        }
        setStatus("recorded");
      };
      rec.start();
      recRef.current = rec;
      setStatus("recording");
      setElapsed(0);
      const t0 = Date.now();
      timerRef.current = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    } catch {
      setStatus("error");
      setCountdown(null);
      teardown();
    }
  };

  const trimEndRef = useRef(0);
  useEffect(() => {
    trimEndRef.current = trimEnd;
  }, [trimEnd]);

  const stopRec = async () => {
    // Bed fade-out tail: dip the bed to silence before actually stopping so the
    // recording captures a clean close (only when the bed is being mixed in).
    if (
      bedFadesRef.current &&
      mixBedRef.current &&
      bedGainRef.current &&
      recRef.current &&
      recRef.current.state === "recording"
    ) {
      fadeOutStartRef.current = ctxRef.current ? ctxRef.current.currentTime : 0;
      fadingOutRef.current = true;
      await wait(FADE_SEC * 1000);
    }
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (duckRafRef.current) cancelAnimationFrame(duckRafRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    if (bedElRef.current) bedElRef.current.pause();
    setBedNowPlaying("");
  };

  // Push-to-record: Space toggles start/stop while the booth is open.
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space") return;
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (countdown !== null) return;
      e.preventDefault();
      e.stopPropagation();
      if (status === "idle") startRec();
      else if (status === "recording") stopRec();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, countdown]);

  // ---- Punch-in: re-record just the selected section over the take ----
  const getCh = (buf, ch) => buf.getChannelData(Math.min(ch, buf.numberOfChannels - 1));
  const startPunch = async () => {
    if (punchEnd - punchStart < 0.05) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();
      const micSrc = ctx.createMediaStreamSource(stream);
      const micMon = ctx.createGain();
      micMon.gain.value = micMonitor ? micMonitorVol : 0;
      micSrc.connect(micMon);
      micMon.connect(ctx.destination);
      micMonRef.current = micMon;
      const mixDest = ctx.createMediaStreamDestination();
      micSrc.connect(mixDest);
      if (countIn) {
        for (let c = 3; c >= 1; c--) {
          setCountdown(c);
          beep(ctx, c === 1 ? 1200 : 880, 0.14);
          // eslint-disable-next-line no-await-in-loop
          await wait(1000);
        }
        setCountdown(null);
        if (!ctxRef.current) return;
      }
      const rec = new MediaRecorder(mixDest.stream);
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        await splicePunch(blob);
        setPunching(false);
      };
      rec.start();
      recRef.current = rec;
      setPunching(true);
      setElapsed(0);
      const t0 = Date.now();
      timerRef.current = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    } catch {
      setPunching(false);
      setCountdown(null);
      teardown();
    }
  };
  const stopPunch = () => {
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  };
  const splicePunch = async (blob) => {
    try {
      const ctx = audioCtx();
      const nb = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
      const base = recBuffer;
      const sr = base.sampleRate;
      const chs = base.numberOfChannels;
      const s = Math.max(0, Math.floor(punchStart * sr));
      const e = Math.min(base.length, Math.floor(punchEnd * sr));
      const headLen = s;
      const tailLen = base.length - e;
      const total = headLen + nb.length + tailLen;
      const out = ctx.createBuffer(chs, total, sr);
      for (let ch = 0; ch < chs; ch++) {
        const o = out.getChannelData(ch);
        o.set(getCh(base, ch).subarray(0, headLen), 0);
        o.set(getCh(nb, ch).subarray(0, nb.length), headLen);
        o.set(getCh(base, ch).subarray(e), headLen + nb.length);
      }
      const wav = bufferToWav(out);
      blobRef.current = wav;
      if (previewRef.current) previewRef.current.pause();
      const url = URL.createObjectURL(wav);
      previewRef.current = new Audio(url);
      previewRef.current.ontimeupdate = () => {
        if (previewRef.current && previewRef.current.currentTime >= trimEndRef.current) {
          previewRef.current.pause();
          setPlaying(false);
        }
      };
      previewRef.current.onended = () => setPlaying(false);
      setRecBuffer(out);
      setTrimStart(0);
      setTrimEnd(out.duration);
      trimEndRef.current = out.duration;
      setWaveMode("trim");
    } catch {
      /* ignore */
    }
  };

  const togglePreview = () => {
    const a = previewRef.current;
    if (!a) return;
    if (a.paused) {
      a.currentTime = trimStart;
      a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const save = async () => {
    if (!blobRef.current) return;
    setBusy(true);
    try {
      const ctx = audioCtx();
      const buf = recBuffer || (await ctx.decodeAudioData((await blobRef.current.arrayBuffer()).slice(0)));
      const sr = buf.sampleRate;
      const s = Math.max(0, Math.floor(trimStart * sr));
      const e = Math.min(buf.length, Math.floor((trimEnd || buf.duration) * sr));
      const len = Math.max(1, e - s);
      const out = ctx.createBuffer(buf.numberOfChannels, len, sr);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        out.getChannelData(ch).set(buf.getChannelData(ch).subarray(s, e));
      }
      const wav = bufferToWav(out);
      if (loudnessMatch) normalizeLoudness(out);
      const finalWav = bufferToWav(out);
      await onSave(finalWav, `${name}.wav`, insertIndex, len / sr);
      onClose();
    } catch {
      setBusy(false);
      setStatus("error");
    }
  };

  // Presets (bed + volumes + toggles; uploaded-file beds aren't persisted).
  const savePreset = () => {
    const nm = presetName.trim();
    if (!nm) return;
    const p = {
      name: nm,
      bedType: bedType === "upload" ? "none" : bedType,
      bedPlaylistId,
      bedStartIndex,
      bedJingleIndex,
      bedVolume,
      mixBed,
      autoDuck,
      duckDepth,
      micMonitor,
      micMonitorVol,
      countIn,
    };
    const next = [...presets.filter((x) => x.name !== nm), p];
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
    setPresetName("");
  };
  const applyPreset = (nm) => {
    const p = presets.find((x) => x.name === nm);
    if (!p) return;
    setBedType(p.bedType);
    if (p.bedPlaylistId) setBedPlaylistId(p.bedPlaylistId);
    setBedStartIndex(p.bedStartIndex || 0);
    setBedJingleIndex(p.bedJingleIndex || 0);
    setBedVolume(p.bedVolume ?? 0.5);
    setMixBed(!!p.mixBed);
    setAutoDuck(!!p.autoDuck);
    setDuckDepth(p.duckDepth ?? 0.6);
    setMicMonitor(!!p.micMonitor);
    setMicMonitorVol(p.micMonitorVol ?? 0.8);
    setCountIn(p.countIn !== false);
  };
  const deletePreset = (nm) => {
    const next = presets.filter((x) => x.name !== nm);
    setPresets(next);
    localStorage.setItem(PRESET_KEY, JSON.stringify(next));
  };

  // Waveform trim/punch drag (edits whichever region is active).
  const activeRegion = () =>
    waveMode === "punch"
      ? { s: punchStart, e: punchEnd, setS: setPunchStart, setE: setPunchEnd }
      : { s: trimStart, e: trimEnd, setS: setTrimStart, setE: setTrimEnd };
  const onWavePointer = (e) => {
    if (!recBuffer || !waveRef.current) return;
    const rect = waveRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const t = ratio * recBuffer.duration;
    const r = activeRegion();
    if (dragHandleRef.current === "start") r.setS(Math.min(t, r.e - 0.05));
    else if (dragHandleRef.current === "end") r.setE(Math.max(t, r.s + 0.05));
  };
  const onWaveDown = (e) => {
    if (!recBuffer) return;
    const rect = waveRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const t = ratio * recBuffer.duration;
    const r = activeRegion();
    dragHandleRef.current = Math.abs(t - r.s) <= Math.abs(t - r.e) ? "start" : "end";
    onWavePointer(e);
    window.addEventListener("pointermove", onWavePointer);
    window.addEventListener(
      "pointerup",
      () => {
        dragHandleRef.current = null;
        window.removeEventListener("pointermove", onWavePointer);
      },
      { once: true }
    );
  };

  const assignedJingles = jingles.map((j, i) => ({ j, i })).filter((x) => x.j);
  const bedPlaylist = playlists.find((p) => p.id === bedPlaylistId);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      data-testid="voice-recorder-modal"
      onMouseDown={(e) => e.target === e.currentTarget && status !== "recording" && onClose()}
    >
      <div className="w-full max-w-md hl-panel rounded-2xl overflow-hidden max-h-[92vh] flex flex-col relative">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--hl-line)]">
          <div className="flex items-center gap-2">
            <Mic size={18} className="text-[var(--hl-fire)]" />
            <h2 className="font-display text-lg">Voice Booth</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 grid place-items-center rounded hover:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {countdown !== null && (
          <div
            className="absolute inset-0 z-10 grid place-items-center bg-black/80 backdrop-blur-sm"
            data-testid="voice-countdown"
          >
            <div className="text-[7rem] font-display font-700 text-[var(--hl-fire)] animate-pulse">
              {countdown}
            </div>
          </div>
        )}

        <div className="p-5 space-y-4 overflow-y-auto">
          {status === "error" && (
            <div className="text-[var(--hl-onair)] text-sm text-center" data-testid="voice-error">
              Microphone unavailable or permission denied.
            </div>
          )}

          <div className="grid place-items-center py-1">
            {status !== "recorded" ? (
              <button
                data-testid="voice-record-toggle"
                onClick={status === "recording" ? stopRec : startRec}
                disabled={countdown !== null}
                className={`h-20 w-20 grid place-items-center rounded-full border-2 transition disabled:opacity-60 ${
                  status === "recording"
                    ? "border-[var(--hl-onair)] bg-[rgba(255,23,68,0.15)] text-[var(--hl-onair)] hl-onair-dot"
                    : "border-[var(--hl-fire)] text-[var(--hl-fire)] hover:bg-[rgba(255,90,31,0.1)]"
                }`}
              >
                {status === "recording" ? <Square size={28} /> : <Circle size={28} fill="currentColor" />}
              </button>
            ) : (
              <button
                data-testid="voice-preview-toggle"
                onClick={togglePreview}
                className="h-20 w-20 grid place-items-center rounded-full hl-fire-gradient text-white"
              >
                {playing ? <Pause size={28} /> : <Play size={28} className="ml-1" />}
              </button>
            )}
            <div className="mt-2 text-sm text-[var(--hl-muted)] tabular-nums" data-testid="voice-elapsed">
              {status === "recording"
                ? `● ${formatTime(elapsed)}${bedNowPlaying ? ` · bed: ${bedNowPlaying}` : ""}`
                : status === "recorded"
                ? "Trim, preview & save"
                : "Tap to record"}
            </div>
          </div>

          {/* Waveform + trim (after a take) */}
          {status === "recorded" && recBuffer && (
            <div data-testid="voice-trim" className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-lg border border-[var(--hl-line)] overflow-hidden text-xs">
                  <button
                    data-testid="wave-mode-trim"
                    onClick={() => setWaveMode("trim")}
                    className={`px-3 py-1.5 ${waveMode === "trim" ? "bg-[var(--hl-fire)] text-white" : "text-[var(--hl-muted)]"}`}
                  >
                    Trim
                  </button>
                  <button
                    data-testid="wave-mode-punch"
                    onClick={() => {
                      if (punchEnd - punchStart < 0.05) {
                        setPunchStart(trimStart);
                        setPunchEnd(trimEnd);
                      }
                      setWaveMode("punch");
                    }}
                    className={`px-3 py-1.5 ${waveMode === "punch" ? "bg-[#3aa0ff] text-white" : "text-[var(--hl-muted)]"}`}
                  >
                    Punch
                  </button>
                </div>
                <span className="tabular-nums text-[11px] text-[var(--hl-muted)]" data-testid="voice-trim-readout">
                  {waveMode === "punch"
                    ? `${formatTime(punchStart)} – ${formatTime(punchEnd)}`
                    : `${formatTime(trimStart)} – ${formatTime(trimEnd)} (${formatTime(trimEnd - trimStart)})`}
                </span>
              </div>
              <div className="text-[11px] text-[var(--hl-muted)] flex items-center gap-1">
                <Waves size={12} />
                {waveMode === "punch"
                  ? "Drag the blue edges to pick the flubbed section, then re-record it"
                  : "Drag the edges to trim the top & tail"}
              </div>
              <canvas
                ref={waveRef}
                onPointerDown={onWaveDown}
                className="w-full h-24 rounded-lg bg-black/40 border border-[var(--hl-line)] cursor-ew-resize touch-none"
              />
              {waveMode === "punch" && (
                <button
                  data-testid="voice-punch-record"
                  onClick={punching ? stopPunch : startPunch}
                  disabled={countdown !== null}
                  className={`w-full h-10 rounded-lg font-600 flex items-center justify-center gap-2 disabled:opacity-60 ${
                    punching
                      ? "bg-[rgba(255,23,68,0.15)] border border-[var(--hl-onair)] text-[var(--hl-onair)]"
                      : "bg-[#3aa0ff] text-white"
                  }`}
                >
                  {punching ? <Square size={16} /> : <Circle size={14} fill="currentColor" />}
                  {punching ? `Recording punch… ${formatTime(elapsed)} — tap to drop in` : "Re-record this section"}
                </button>
              )}
            </div>
          )}

          {/* Bed + monitoring setup */}
          {status !== "recorded" && (
            <>
              {presets.length > 0 && (
                <div className="flex items-center gap-2" data-testid="voice-presets">
                  <Star size={14} className="text-[var(--hl-amber)] shrink-0" />
                  <select
                    data-testid="voice-preset-select"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) applyPreset(e.target.value);
                    }}
                    className="flex-1 bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-1.5 text-sm outline-none focus:border-[var(--hl-fire)]"
                  >
                    <option value="">Load a bed preset…</option>
                    {presets.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-3 rounded-xl border border-[var(--hl-line)] p-3.5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-[var(--hl-muted)]">
                  <Music2 size={14} className="text-[var(--hl-amber)]" /> Music bed (underlayment)
                </div>
                <select
                  data-testid="voice-bed-type"
                  value={bedType}
                  onChange={(e) => setBedType(e.target.value)}
                  disabled={status === "recording"}
                  className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                >
                  <option value="none">No bed — voice only</option>
                  <option value="playlist">From a playlist (advances track to track)</option>
                  <option value="jingle">From a jingle pad</option>
                  <option value="upload">Upload / choose a file</option>
                </select>

                {bedType === "playlist" && (
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      data-testid="voice-bed-playlist"
                      value={bedPlaylistId}
                      onChange={(e) => {
                        setBedPlaylistId(e.target.value);
                        setBedStartIndex(0);
                      }}
                      disabled={status === "recording"}
                      className="bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                    >
                      {playlists.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <select
                      data-testid="voice-bed-start"
                      value={bedStartIndex}
                      onChange={(e) => setBedStartIndex(Number(e.target.value))}
                      disabled={status === "recording"}
                      className="bg-black/50 border border-[var(--hl-line)] rounded-lg px-2 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                    >
                      {(bedPlaylist?.trackIds || []).map((id, i) => {
                        const t = tracks[id];
                        if (!t) return null;
                        return (
                          <option key={id} value={i}>
                            Start: {t.title || t.name}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {bedType === "jingle" && (
                  <select
                    data-testid="voice-bed-jingle"
                    value={bedJingleIndex}
                    onChange={(e) => setBedJingleIndex(Number(e.target.value))}
                    disabled={status === "recording"}
                    className="w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                  >
                    {assignedJingles.length === 0 && <option value={0}>No jingle pads assigned</option>}
                    {assignedJingles.map(({ j, i }) => (
                      <option key={i} value={i}>
                        Pad {i + 1}: {j.name}
                      </option>
                    ))}
                  </select>
                )}

                {bedType === "upload" && (
                  <input
                    data-testid="voice-bed-file-input"
                    type="file"
                    accept=".mp3,.wav,.m4a,audio/*"
                    disabled={status === "recording"}
                    onChange={(e) => setBedFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-[var(--hl-muted)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-[var(--hl-fire)] file:text-white"
                  />
                )}

                {bedType !== "none" && (
                  <>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[var(--hl-muted)] w-24 shrink-0">Bed volume</span>
                      <input
                        data-testid="voice-bed-volume"
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={bedVolume}
                        onChange={(e) => setBedVolume(Number(e.target.value))}
                        className="hl-range flex-1"
                      />
                      <span className="text-xs tabular-nums w-9 text-right">{Math.round(bedVolume * 100)}%</span>
                    </div>
                    <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="voice-autoduck-toggle"
                        checked={autoDuck}
                        onChange={(e) => setAutoDuck(e.target.checked)}
                        className="h-4 w-4 accent-[var(--hl-fire)]"
                      />
                      Auto-duck the bed under my voice
                    </label>
                    {autoDuck && (
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-[var(--hl-muted)] w-24 shrink-0">Duck amount</span>
                        <input
                          data-testid="voice-duck-depth"
                          type="range"
                          min="0.2"
                          max="0.9"
                          step="0.05"
                          value={duckDepth}
                          onChange={(e) => setDuckDepth(Number(e.target.value))}
                          className="hl-range flex-1"
                        />
                        <span className="text-xs tabular-nums w-9 text-right">{Math.round(duckDepth * 100)}%</span>
                      </div>
                    )}
                    <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="voice-mix-toggle"
                        checked={mixBed}
                        onChange={(e) => setMixBed(e.target.checked)}
                        disabled={status === "recording"}
                        className="h-4 w-4 accent-[var(--hl-fire)]"
                      />
                      Mix the bed into the saved file (off = record my voice only)
                    </label>
                    {mixBed && (
                      <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                        <input
                          type="checkbox"
                          data-testid="voice-bedfades-toggle"
                          checked={bedFades}
                          onChange={(e) => setBedFades(e.target.checked)}
                          disabled={status === "recording"}
                          className="h-4 w-4 accent-[var(--hl-fire)]"
                        />
                        Fade the bed in at the open & out at the close
                      </label>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-2.5 rounded-xl border border-[var(--hl-line)] p-3.5">
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="voice-countin-toggle"
                    checked={countIn}
                    onChange={(e) => setCountIn(e.target.checked)}
                    className="h-4 w-4 accent-[var(--hl-fire)]"
                  />
                  <Timer size={15} className="text-[var(--hl-amber)]" />
                  3-2-1 count-in before recording
                </label>
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="voice-mic-monitor-toggle"
                    checked={micMonitor}
                    onChange={(e) => setMicMonitor(e.target.checked)}
                    className="h-4 w-4 accent-[var(--hl-fire)]"
                  />
                  <Headphones size={15} className="text-[var(--hl-amber)]" />
                  Hear my mic in my headphones (monitor)
                </label>
                {micMonitor && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-[var(--hl-muted)] w-24 shrink-0">Monitor vol</span>
                    <input
                      data-testid="voice-mic-monitor-volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={micMonitorVol}
                      onChange={(e) => setMicMonitorVol(Number(e.target.value))}
                      className="hl-range flex-1"
                    />
                    <span className="text-xs tabular-nums w-9 text-right">{Math.round(micMonitorVol * 100)}%</span>
                  </div>
                )}
                <label className="flex items-center gap-2.5 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    data-testid="voice-loudness-toggle"
                    checked={loudnessMatch}
                    onChange={(e) => setLoudnessMatch(e.target.checked)}
                    className="h-4 w-4 accent-[var(--hl-fire)]"
                  />
                  Match broadcast loudness on save
                </label>
                <div className="flex items-start gap-2 text-[11px] text-[var(--hl-amber)]" data-testid="voice-monitor-warning">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  Use headphones. On laptop speakers this causes echo/feedback.
                </div>
                <div className="text-[11px] text-[var(--hl-muted)]">
                  Tip: press <span className="text-[var(--hl-amber)]">Space</span> to start / stop recording.
                </div>
              </div>

              {/* Save current settings as a preset */}
              <div className="flex items-center gap-2">
                <input
                  data-testid="voice-preset-name"
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="Save these bed settings as…"
                  className="flex-1 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--hl-fire)]"
                />
                <button
                  data-testid="voice-preset-save"
                  onClick={savePreset}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-[var(--hl-fire)]"
                >
                  <Star size={14} /> Save
                </button>
              </div>
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5" data-testid="voice-preset-chips">
                  {presets.map((p) => (
                    <span
                      key={p.name}
                      className="inline-flex items-center gap-1 text-[11px] bg-white/5 border border-[var(--hl-line)] rounded-full pl-2 pr-1 py-0.5"
                    >
                      {p.name}
                      <button
                        onClick={() => deletePreset(p.name)}
                        className="h-4 w-4 grid place-items-center rounded-full hover:text-[var(--hl-onair)]"
                        title="Delete preset"
                      >
                        <Trash2 size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <div>
            <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">File name</label>
            <div className="mt-1 flex items-center gap-2">
              <input
                data-testid="voice-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name this recording"
                className="flex-1 min-w-0 bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]"
              />
              <span className="text-sm text-[var(--hl-muted)] tabular-nums shrink-0">.wav</span>
            </div>
          </div>

          {status === "recorded" && (
            <>
              <div>
                <label className="text-xs uppercase tracking-wider text-[var(--hl-muted)]">Insert position</label>
                <select
                  data-testid="voice-insert-position"
                  value={insertIndex}
                  onChange={(e) => setInsertIndex(Number(e.target.value))}
                  className="mt-1 w-full bg-black/50 border border-[var(--hl-line)] rounded-lg px-3 py-2 outline-none focus:border-[var(--hl-fire)]"
                >
                  <option value={0}>At the start</option>
                  {existingTracks.map((t, i) => (
                    <option key={i} value={i + 1}>
                      After: {t.title || t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => {
                    setStatus("idle");
                    setRecBuffer(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-[var(--hl-line)] text-sm hover:border-white"
                >
                  Re-record
                </button>
                <button
                  data-testid="voice-save"
                  disabled={busy}
                  onClick={save}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg hl-fire-gradient text-white font-600 disabled:opacity-50"
                >
                  <Save size={16} /> {busy ? "Saving…" : "Add to Playlist"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
