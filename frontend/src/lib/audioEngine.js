// Dual-element audio engine with crossfade / gapless auto-play for live playout,
// plus an independent CUE (headphone pre-listen) channel and audio-output routing.
import { Mp3Encoder } from "@breezystack/lamejs";
import { micConstraints } from "@/lib/mic";

export default class AudioEngine {
  constructor(onUpdate, onCue, onStandby, onBpm, onCommit) {
    this.onUpdate = onUpdate;
    this.onCue = onCue;
    this.onStandby = onStandby;
    this.onBpm = onBpm;
    this.onCommit = onCommit;
    this.a = new Audio();
    this.b = new Audio();
    this.cue = new Audio();
    [this.a, this.b, this.cue].forEach((el) => {
      el.preload = "auto";
      el.crossOrigin = "anonymous";
    });
    this.active = this.a;
    this.idle = this.b;
    this.queue = [];
    this.getUrl = async () => null;
    this.index = -1;
    this.volume = 1;
    this.crossfade = true;
    this.crossfadeSeconds = 3;
    this.autoplay = true;
    this.shuffle = false;
    this._recent = [];
    this.trimSilence = false;
    this.loopRegion = false;
    this.cueAutoFade = false;
    this.cueFadeSeconds = 1.5;
    this.duckActive = false;
    this.duckLevel = 0.28;
    this._volRaf = null;
    this.cueTrackId = null;
    this._fading = false;
    this._fadeRaf = null;
    this._stopping = false;
    this._sleepRaf = null;
    // ---- Standby deck (manual crossfader to the "in cue" track) ----
    this.standbyArmed = false;
    this.standbyTrackId = null;
    this.standbyIndex = -1;
    this._faderPos = 0; // 0 = fully ON AIR, 1 = fully STANDBY
    this._manualFading = false;
    this._takeRaf = null;
    // Fader curve + beat sync
    this.faderCurve = "smooth"; // "smooth" (equal-power) | "sharp" (fast cut)
    this.syncLock = false; // auto tempo-match every track the moment it's armed
    this._bpmCache = {};
    this._keyCache = {};
    this._analyzed = {};
    this._actx = null;
    this._syncRate = 1;
    this._nudgeTimer = null;
    this._onairBpm = null;
    this._standbyBpm = null;
    // Recorder / program bus
    this._programSink = "";
    this._recCtx = null;
    this._recMaster = null;
    this._recDest = null;
    this._recorder = null;
    this._recChunks = [];
    this._micStream = null;
    this._micSrc = null;
    this._recStartTs = 0;
    this._recSourced = null;
    this._bind();
  }

  _bind() {
    const emit = () => this._emit();
    this.a.addEventListener("timeupdate", () => this._onTime(this.a));
    this.b.addEventListener("timeupdate", () => this._onTime(this.b));
    this.a.addEventListener("ended", () => this._onEnded(this.a));
    this.b.addEventListener("ended", () => this._onEnded(this.b));
    ["loadedmetadata", "play", "pause", "durationchange"].forEach((ev) => {
      this.a.addEventListener(ev, emit);
      this.b.addEventListener(ev, emit);
    });
    const cueEmit = () => this._emitCue();
    ["timeupdate", "loadedmetadata", "play", "pause", "durationchange", "ended"].forEach((ev) => {
      this.cue.addEventListener(ev, () => {
        if (ev === "ended") this.cueTrackId = null;
        cueEmit();
      });
    });
  }

  setQueue(tracks, getUrl) {
    this.queue = tracks;
    if (getUrl) this.getUrl = getUrl;
  }

  syncQueue(tracks, getUrl, currentTrackId) {
    this.queue = tracks;
    if (getUrl) this.getUrl = getUrl;
    if (currentTrackId != null) {
      const i = tracks.findIndex((t) => t.id === currentTrackId);
      if (i >= 0) this.index = i;
    }
    this._emit();
  }

  setVolume(v) {
    this.volume = v;
    if (!this._fading && !this._manualFading) this._setVol(this.active, this._effVol());
    this._emit();
  }

  _effVol() {
    return this.duckActive ? this.volume * this.duckLevel : this.volume;
  }

  // Media-element volume must stay within [0,1]; float drift / duck math can
  // overshoot and throw, so clamp every write in one place.
  _setVol(el, v) {
    el.volume = Math.min(1, Math.max(0, v));
  }

  _rampTo(el, target, ms) {
    if (this._volRaf) cancelAnimationFrame(this._volRaf);
    if (this._volTimer) clearInterval(this._volTimer);
    const start = performance.now();
    const from = el.volume;
    // Timer-based so a duck/unduck ramp still finishes when backgrounded.
    this._volTimer = setInterval(() => {
      const p = Math.min(1, (performance.now() - start) / ms);
      this._setVol(el, from + (target - from) * p);
      if (p >= 1) {
        clearInterval(this._volTimer);
        this._volTimer = null;
      }
    }, 30);
  }

  setDuck(active, level, ms) {
    this.duckActive = active;
    if (typeof level === "number") this.duckLevel = level;
    else if (active) this.duckLevel = 0.28;
    const dur = typeof ms === "number" ? ms : 220;
    if (!this._fading && !this._manualFading) this._rampTo(this.active, this._effVol(), dur);
  }

  setTrimSilence(on) {
    this.trimSilence = on;
  }

  setLoopRegion(on) {
    this.loopRegion = !!on;
  }

  setCueAutoFade(on, sec) {
    this.cueAutoFade = on;
    if (sec) this.cueFadeSeconds = sec;
  }

  setCrossfade(on, sec) {
    this.crossfade = on;
    if (sec) this.crossfadeSeconds = sec;
  }

  setAutoplay(on) {
    this.autoplay = on;
  }

  setShuffle(on) {
    this.shuffle = !!on;
    if (!on) this._recent = [];
  }

  // Whether there's another track to advance to given the current mode.
  _hasNext() {
    return this.shuffle ? this.queue.length > 1 : this.index < this.queue.length - 1;
  }

  // The index to play next: random (no immediate repeat, avoids recent history
  // until the playlist is exhausted) when shuffle is on, else sequential.
  _nextIndex() {
    if (!this.shuffle) {
      return this.index < this.queue.length - 1 ? this.index + 1 : -1;
    }
    const n = this.queue.length;
    if (n <= 1) return -1;
    let pool = [];
    for (let i = 0; i < n; i++) {
      if (i !== this.index && !this._recent.includes(i)) pool.push(i);
    }
    if (pool.length === 0) {
      this._recent = [];
      for (let i = 0; i < n; i++) if (i !== this.index) pool.push(i);
    }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    this._recent.push(pick);
    if (this._recent.length > Math.max(1, n - 1)) this._recent.shift();
    return pick;
  }

  async setMainSink(deviceId) {
    this._programSink = deviceId || "";
    if (this._recCtx) {
      await this._applyCtxSink(this._programSink);
      return;
    }
    for (const el of [this.a, this.b]) {
      if (typeof el.setSinkId === "function") {
        try {
          await el.setSinkId(deviceId || "");
        } catch {
          /* ignore */
        }
      }
    }
  }

  async setCueSink(deviceId) {
    if (typeof this.cue.setSinkId === "function") {
      try {
        await this.cue.setSinkId(deviceId || "");
      } catch {
        /* ignore */
      }
    }
  }

  async playIndex(i) {
    if (i < 0 || i >= this.queue.length) return;
    this._cancelSleepFade();
    this._cancelFade();
    this.idle.pause();
    const url = await this.getUrl(this.queue[i]);
    if (!url) return;
    this.index = i;
    this.active.src = url;
    this._setVol(this.active, this._effVol());
    const track = this.queue[i];
    const startAt = this._startAt(track);
    if (startAt > 0) {
      const onMeta = () => {
        try {
          this.active.currentTime = startAt;
        } catch {
          /* ignore */
        }
        this.active.removeEventListener("loadedmetadata", onMeta);
      };
      this.active.addEventListener("loadedmetadata", onMeta);
    } else {
      try {
        this.active.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    try {
      await this.active.play();
    } catch {
      /* ignore */
    }
    this._emit();
  }

  // Where a track should start from: first hot-cue → trim In → detected lead-in → 0.
  _startAt(track) {
    if (!track) return 0;
    if (Array.isArray(track.cuePoints) && track.cuePoints.length) return track.cuePoints[0];
    if (track.cueIn != null) return track.cueIn;
    if (this.trimSilence && track.leadIn) return track.leadIn;
    return 0;
  }

  async togglePlay() {
    if (this.index < 0) {
      if (this.queue.length) await this.playIndex(0);
      return;
    }
    if (this.active.paused) {
      this._cancelSleepFade();
      if (this.active.volume === 0) this._setVol(this.active, this._effVol());
      try {
        await this.active.play();
      } catch {
        /* ignore */
      }
    } else {
      this.active.pause();
    }
    this._emit();
  }

  next() {
    const n = this._nextIndex();
    if (n >= 0) this.playIndex(n);
  }

  prev() {
    if (this.active.currentTime > 3) {
      this.active.currentTime = 0;
      this._emit();
      return;
    }
    if (this.index > 0) this.playIndex(this.index - 1);
    else {
      this.active.currentTime = 0;
      this._emit();
    }
  }

  // Sleep timer: gently fade the on-air track to silence, then pause. Used for
  // unattended overnight play so the station eases out instead of hard-stopping.
  fadeOutStop(seconds = 6) {
    this._cancelFade();
    this._cancelSleepFade();
    this._stopping = true;
    const el = this.active;
    const startVol = el.volume;
    const durMs = Math.max(0.3, seconds) * 1000;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / durMs);
      this._setVol(el, Math.max(0, startVol * (1 - p)));
      if (p < 1) {
        this._sleepRaf = requestAnimationFrame(step);
      } else {
        el.pause();
        this._sleepRaf = null;
        this._stopping = false;
        this._setVol(el, this._effVol());
        this._emit();
      }
    };
    this._sleepRaf = requestAnimationFrame(step);
  }

  _cancelSleepFade() {
    if (this._sleepRaf) cancelAnimationFrame(this._sleepRaf);
    this._sleepRaf = null;
    this._stopping = false;
  }

  // Wake / fade-in: start playout (from the top if nothing is loaded) and ramp the
  // volume up gently. Used to auto-launch a show at a set time for unattended play.
  async fadeInStart(seconds = 6) {
    this._cancelSleepFade();
    if (this.index < 0) {
      if (!this.queue.length) return;
      await this.playIndex(0);
    } else if (this.active.paused) {
      try {
        await this.active.play();
      } catch {
        /* ignore */
      }
    }
    this._cancelFade();
    const el = this.active;
    const target = this._effVol();
    this._setVol(el, 0);
    const durMs = Math.max(0.3, seconds) * 1000;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / durMs);
      this._setVol(el, Math.min(target, target * p));
      if (p < 1) {
        this._sleepRaf = requestAnimationFrame(step);
      } else {
        this._setVol(el, this._effVol());
        this._sleepRaf = null;
        this._emit();
      }
    };
    this._sleepRaf = requestAnimationFrame(step);
  }

  seek(t) {
    if (this.index < 0) return;
    try {
      this.active.currentTime = t;
    } catch {
      /* ignore */
    }
    this._emit();
  }

  // ---------- CUE (headphone pre-listen) ----------
  async cuePlay(track) {
    if (!track) return;
    const url = await this.getUrl(track);
    if (!url) return;
    this.cueTrackId = track.id;
    this.cue.src = url;
    this._setVol(this.cue, 1);
    try {
      this.cue.currentTime = 0;
      await this.cue.play();
    } catch {
      /* ignore */
    }
    this._emitCue();
  }

  async cueToggle() {
    if (!this.cueTrackId) return;
    if (this.cue.paused) {
      try {
        await this.cue.play();
      } catch {
        /* ignore */
      }
    } else {
      this.cue.pause();
    }
    this._emitCue();
  }

  cueStop() {
    this.cue.pause();
    try {
      this.cue.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.cueTrackId = null;
    this._emitCue();
  }

  cueSeek(t) {
    if (!this.cueTrackId) return;
    try {
      this.cue.currentTime = t;
    } catch {
      /* ignore */
    }
    this._emitCue();
  }

  // ---------- STANDBY DECK (manual crossfader to the "in cue" track) ----------
  // Loads a track onto the idle deck, ready to blend in with setFader / takeStandby.
  async loadStandby(track) {
    if (!track) return;
    const url = await this.getUrl(track);
    if (!url) return;
    const i = this.queue.findIndex((t) => t.id === track.id);
    this._cancelTake();
    this.idle.pause();
    this.idle.src = url;
    this._setVol(this.idle, 0);
    const startAt = this._startAt(track);
    const onMeta = () => {
      try {
        this.idle.currentTime = startAt;
      } catch {
        /* ignore */
      }
      this.idle.removeEventListener("loadedmetadata", onMeta);
    };
    this.idle.addEventListener("loadedmetadata", onMeta);
    this.standbyArmed = true;
    this.standbyTrackId = track.id;
    this.standbyIndex = i;
    this._faderPos = 0;
    this.idle.playbackRate = 1;
    this._syncRate = 1;
    this._standbyBpm = null;
    this._emitStandby();
    this._refreshBpm();
    if (this.syncLock) this.syncStandby();
  }

  clearStandby() {
    this._cancelTake();
    if (this._nudgeTimer) {
      clearTimeout(this._nudgeTimer);
      this._nudgeTimer = null;
    }
    this.idle.pause();
    try {
      this.idle.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.idle.src = "";
    this.idle.playbackRate = 1;
    this.standbyArmed = false;
    this.standbyTrackId = null;
    this.standbyIndex = -1;
    this._faderPos = 0;
    this._manualFading = false;
    this._syncRate = 1;
    this._standbyBpm = null;
    // Restore full air level on the on-air deck.
    if (!this._fading) this._setVol(this.active, this._effVol());
    this._emitStandby();
  }

  // Physically blend between ON AIR (pos 0) and STANDBY (pos 1).
  setFader(pos) {
    if (!this.standbyArmed) return;
    const p = Math.max(0, Math.min(1, pos));
    this._faderPos = p;
    if (p >= 0.999) {
      this._commitStandby();
      return;
    }
    this._manualFading = p > 0;
    const peak = this._effVol();
    if (p > 0 && this.idle.paused) {
      this.idle.play().catch(() => {});
    }
    const g = this._faderGains(p);
    this._setVol(this.active, peak * g.out);
    this._setVol(this.idle, peak * g.in);
    if (p === 0) {
      // Snapped back to air — pause the standby deck but keep it armed.
      this.idle.pause();
      try {
        const t = this.queue[this.standbyIndex];
        this.idle.currentTime =
          t && t.cueIn != null ? t.cueIn : this.trimSilence && t && t.leadIn ? t.leadIn : 0;
      } catch {
        /* ignore */
      }
      this._manualFading = false;
      this._setVol(this.active, peak);
    }
    this._emitStandby();
  }

  // One-tap seamless transition: animate the fader all the way over, then commit.
  takeStandby(seconds) {
    if (!this.standbyArmed) return;
    this._cancelTake();
    this._manualFading = true;
    if (this.idle.paused) this.idle.play().catch(() => {});
    const durMs = Math.max(0.1, typeof seconds === "number" ? seconds : this.crossfadeSeconds) * 1000;
    const from = this._faderPos;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / durMs);
      const pos = from + (1 - from) * p;
      const peak = this._effVol();
      this._faderPos = pos;
      const g = this._faderGains(pos);
      this._setVol(this.active, peak * g.out);
      this._setVol(this.idle, peak * g.in);
      this._emitStandby();
      if (p < 1) {
        this._takeRaf = requestAnimationFrame(step);
      } else {
        this._takeRaf = null;
        this._commitStandby();
      }
    };
    this._takeRaf = requestAnimationFrame(step);
  }

  _commitStandby() {
    this._cancelTake();
    if (this._nudgeTimer) {
      clearTimeout(this._nudgeTimer);
      this._nudgeTimer = null;
    }
    const newIndex = this.standbyIndex;
    // The standby deck (idle) becomes the on-air deck.
    const old = this.active;
    old.pause();
    old.playbackRate = 1;
    try {
      old.currentTime = 0;
    } catch {
      /* ignore */
    }
    old.src = "";
    this.active = this.idle;
    this.idle = old;
    if (newIndex >= 0) this.index = newIndex;
    this._manualFading = false;
    this.standbyArmed = false;
    this.standbyTrackId = null;
    this.standbyIndex = -1;
    this._faderPos = 0;
    // Newly on-air deck plays at its natural tempo; sync state resets.
    this.active.playbackRate = 1;
    this._syncRate = 1;
    this._onairBpm = this._bpmCache[this.queue[this.index]?.id] ?? null;
    this._standbyBpm = null;
    this._setVol(this.active, this._effVol());
    if (this.active.paused) this.active.play().catch(() => {});
    this._emitStandby();
    this._emit();
    if (this.onCommit) this.onCommit(this.index);
  }

  _cancelTake() {
    if (this._takeRaf) cancelAnimationFrame(this._takeRaf);
    this._takeRaf = null;
  }

  // ---- Fader curve (crossfader shape) ----
  setFaderCurve(curve) {
    this.faderCurve = curve === "sharp" ? "sharp" : "smooth";
  }

  setSyncLock(on) {
    this.syncLock = !!on;
    if (on && this.standbyArmed) this.syncStandby();
  }

  // Live beat/phase info for the visual beat meter (0..1 phase within a beat).
  beatInfo() {
    const air = this.queue[this.index];
    const sb = this.standbyArmed ? this.queue[this.standbyIndex] : null;
    const airBpm = air ? this._bpmCache[air.id] || null : null;
    const sbBpm = sb ? this._bpmCache[sb.id] || null : null;
    const phase = (bpm, el) => (bpm ? ((el.currentTime * bpm) / 60) % 1 : null);
    return {
      airBpm,
      sbBpm,
      airPhase: phase(airBpm, this.active),
      sbPhase: sbBpm ? phase(sbBpm, this.idle) : null,
    };
  }

  // Returns { out, in } gains (0..1) for a linear fader position p.
  _faderGains(p) {
    if (this.faderCurve === "sharp") {
      // Fast cut: both decks stay near full through the centre, cut hard at the edges.
      return { out: Math.min(1, (1 - p) * 2), in: Math.min(1, p * 2) };
    }
    // Smooth: equal-power (constant perceived loudness across the blend).
    return { out: Math.cos((p * Math.PI) / 2), in: Math.sin((p * Math.PI) / 2) };
  }

  // ---- Beat / tempo sync ----
  _ctx() {
    if (!this._actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this._actx = new AC();
    }
    return this._actx;
  }

  // Resume any suspended audio contexts + keep the on-air deck playing. Called
  // when the tab becomes visible again so playout/broadcast recover fast after
  // the device was in standby or another app was in the foreground.
  // True if audio was actually interrupted (contexts suspended or the on-air
  // deck got paused while it should be playing) — used to decide whether the
  // "tap to keep broadcasting" guard is warranted vs a harmless app switch.
  isInterrupted() {
    const susp = (c) => c && c.state === "suspended";
    if (susp(this._actx) || susp(this._recCtx)) return true;
    if (this.active && this.active.paused && this._wasPlaying && !this.active.ended) return true;
    return false;
  }

  resumeContexts() {
    [this._actx, this._recCtx].forEach((ctx) => {
      try {
        if (ctx && ctx.state === "suspended") ctx.resume();
      } catch {
        /* ignore */
      }
    });
    // If a crossfade was frozen while backgrounded, finish it now so auto-advance
    // never gets stuck with _fading pinned true.
    if (this._fading && this._fadeState) this._fadeTick();
    try {
      if (this.active && this.active.paused && !this.active.ended && this._wasPlaying) {
        this.active.play().catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  async bpmFor(track) {
    if (!track) return null;
    if (this._analyzed[track.id]) return this._bpmCache[track.id] ?? null;
    const ctx = this._ctx();
    if (!ctx) return null;
    try {
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          /* ignore */
        }
      }
      const url = await this.getUrl(track);
      if (!url) return null;
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr.slice(0));
      const { estimateBpm } = await import("./bpm");
      const { estimateKey } = await import("./key");
      const bpm = estimateBpm(buf);
      let key = null;
      try {
        key = estimateKey(buf);
      } catch {
        /* ignore */
      }
      this._analyzed[track.id] = true;
      if (bpm) this._bpmCache[track.id] = bpm;
      if (key) this._keyCache[track.id] = key;
      if (this.onBpm) this.onBpm(track.id, bpm || null, key || null);
      return bpm;
    } catch {
      return null;
    }
  }

  keyFor(track) {
    return track ? this._keyCache[track.id] || null : null;
  }

  async _refreshBpm() {
    const onair = this.queue[this.index];
    const sb = this.queue[this.standbyIndex];
    const [a, b] = await Promise.all([this.bpmFor(onair), this.bpmFor(sb)]);
    this._onairBpm = a;
    if (this.standbyArmed) this._standbyBpm = b;
    this._emitStandby();
  }

  // Tempo-match the standby deck to the on-air track (playback-rate, clamped).
  async syncStandby() {
    if (!this.standbyArmed) return null;
    const a = await this.bpmFor(this.queue[this.index]);
    const b = await this.bpmFor(this.queue[this.standbyIndex]);
    this._onairBpm = a;
    this._standbyBpm = b;
    let rate = 1;
    if (a && b) {
      rate = a / b;
      // Fold half/double-time so a 140 vs 70 still matches.
      while (rate > 1.35) rate /= 2;
      while (rate < 0.74) rate *= 2;
      rate = Math.min(1.08, Math.max(0.92, rate));
    }
    this._syncRate = rate;
    this.idle.playbackRate = rate;
    this._emitStandby();
    return { onairBpm: a, standbyBpm: b, rate };
  }

  // Momentary tempo bump to shove the standby track onto the beat (dir -1 / +1).
  nudgeStandby(dir) {
    if (!this.standbyArmed) return;
    if (this._nudgeTimer) clearTimeout(this._nudgeTimer);
    const base = this._syncRate || 1;
    const bump = dir < 0 ? 0.94 : 1.06;
    this.idle.playbackRate = base * bump;
    this._nudgeTimer = setTimeout(() => {
      this.idle.playbackRate = base;
      this._nudgeTimer = null;
    }, 260);
  }

  // ---- One-Tap Mix: arm next, auto-sync, and take on the next downbeat ----
  async oneTapMix() {
    if (!this.standbyArmed) {
      const i = this.index + 1;
      if (i < 0 || i >= this.queue.length) return;
      await this.loadStandby(this.queue[i]);
    }
    await this.syncStandby();
    const air = this.queue[this.index];
    const bpm = this._onairBpm || (air && this._bpmCache[air.id]) || 120;
    const beat = 60 / bpm;
    const now = this.active.currentTime || 0;
    let delay = beat - (now % beat);
    if (delay < 0.05) delay += beat;
    setTimeout(() => {
      if (this.standbyArmed) this.takeStandby(this.crossfadeSeconds);
    }, delay * 1000);
  }

  // ---- Session recorder (program bus + mic → single file) ----
  _ensureProgramGraph() {
    if (this._recCtx) return this._recCtx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 1;
    // Safety limiter so overlapping decks during a crossfade can't sum past 0dB
    // and distort the broadcast/recording bus.
    const limiter = ctx.createDynamicsCompressor();
    try {
      limiter.threshold.value = -1.5;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.12;
    } catch {
      /* ignore read-only in some impls */
    }
    master.connect(limiter);
    limiter.connect(ctx.destination);
    this._recCtx = ctx;
    this._recMaster = master;
    this._recSourced = new WeakSet();
    this._routeElement(this.a);
    this._routeElement(this.b);
    if (this._programSink) this._applyCtxSink(this._programSink);
    return ctx;
  }

  _routeElement(el) {
    if (!this._recCtx || !el || this._recSourced.has(el)) return;
    try {
      const src = this._recCtx.createMediaElementSource(el);
      src.connect(this._recMaster);
      this._recSourced.add(el);
    } catch {
      /* already sourced / tainted */
    }
  }

  // Route ad-hoc elements (jingles, rolls) into the program bus so they're
  // heard AND captured while a recording graph exists.
  captureElement(el) {
    if (this._recCtx) this._routeElement(el);
  }

  async _applyCtxSink(deviceId) {
    if (this._recCtx && typeof this._recCtx.setSinkId === "function") {
      try {
        await this._recCtx.setSinkId(deviceId || "");
      } catch {
        /* ignore */
      }
    }
  }

  async startRecording({ mic = true } = {}) {
    const ctx = this._ensureProgramGraph();
    if (!ctx) throw new Error("Audio recording is not supported here.");
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this._recDest = ctx.createMediaStreamDestination();
    this._recMaster.connect(this._recDest);
    this._micStream = null;
    this._micSrc = null;
    if (mic) {
      try {
        this._micStream = await navigator.mediaDevices.getUserMedia({
          audio: micConstraints(),
        });
        this._micSrc = ctx.createMediaStreamSource(this._micStream);
        this._micSrc.connect(this._recDest); // recorder only — never to speakers
      } catch {
        this._micStream = null; // graceful: music-only
      }
    }
    const mime = window.MediaRecorder && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    this._recChunks = [];
    this._recorder = new MediaRecorder(this._recDest.stream, { mimeType: mime });
    this._recorder.ondataavailable = (e) => {
      if (e.data && e.data.size) this._recChunks.push(e.data);
    };
    this._recorder.start(1000);
    this._recStartTs = Date.now();
    return { mic: !!this._micStream };
  }

  isRecording() {
    return !!(this._recorder && this._recorder.state === "recording");
  }

  recordingElapsed() {
    return this.isRecording() ? (Date.now() - this._recStartTs) / 1000 : 0;
  }

  stopRecording() {
    return new Promise((resolve) => {
      const rec = this._recorder;
      if (!rec) {
        resolve(null);
        return;
      }
      rec.onstop = () => {
        const blob = new Blob(this._recChunks, {
          type: (this._recChunks[0] && this._recChunks[0].type) || "audio/webm",
        });
        try {
          this._recMaster.disconnect(this._recDest);
        } catch {
          /* ignore */
        }
        try {
          if (this._micSrc) this._micSrc.disconnect();
        } catch {
          /* ignore */
        }
        try {
          if (this._micStream) this._micStream.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
        this._recorder = null;
        this._recDest = null;
        this._micSrc = null;
        this._micStream = null;
        this._recChunks = [];
        resolve(blob);
      };
      try {
        rec.stop();
      } catch {
        resolve(null);
      }
    });
  }

  // ---- LIVE BROADCAST (program mix -> MP3 -> WSS relay -> radio.co) ----
  // Simulcast: one shared program mix + MP3 encoder fanned out to N station relays.
  isBroadcasting() {
    return (this._bcConns || []).some((c) => c.ws && c.ws.readyState === WebSocket.OPEN && c.ready);
  }

  isBroadcastingStation(id) {
    const c = (this._bcConns || []).find((x) => x.id === id);
    return !!(c && c.ws && c.ws.readyState === WebSocket.OPEN && c.ready);
  }

  broadcastStationIds() {
    return (this._bcConns || []).map((c) => c.id);
  }

  getBroadcastLevel() {
    return this._bcLevel || 0;
  }

  getBroadcastHealth(id) {
    const conns = this._bcConns || [];
    const c = id ? conns.find((x) => x.id === id) : conns[0];
    if (!c) return { kbps: 0, buffered: 0, drops: 0, status: "idle" };
    const now = performance.now();
    const win = (c.sent || []).filter((s) => now - s[0] < 3000);
    c.sent = win;
    const bytes = win.reduce((a, s) => a + s[1], 0);
    const kbps = win.length ? Math.round((bytes * 8) / 3 / 1000) : 0;
    const buffered = c.ws ? c.ws.bufferedAmount : 0;
    let status = "good";
    if (c.reconnectTimer) status = "reconnecting";
    else if (!c.ready) status = "connecting";
    else if (buffered > 200000) status = "buffering";
    else if (c.lastDrop && now - c.lastDrop < 4000) status = "unstable";
    return { kbps, buffered, drops: c.drops || 0, status };
  }

  async startBroadcast({ stations, mic = true, archive = true, onState, onArchive }) {
    const list = Array.isArray(stations) ? stations.filter(Boolean) : [];
    if (!list.length) throw new Error("No station selected to broadcast to.");
    const ctx = this._ensureProgramGraph();
    if (!ctx) throw new Error("Live audio is not supported here.");
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this._bcOnState = onState || (() => {});
    this._bcOnArchive = onArchive || (() => {});
    this._bcSampleRate = Math.round(ctx.sampleRate);
    // All simulcast targets share ONE encoded MP3 stream (first station's bitrate).
    this._bcBitrate = Number(list[0].config && list[0].config.bitrate) || 128;
    this._bcLevel = 0;
    this._bcConns = this._bcConns || [];

    if (!this._bcGraphUp) {
      // Broadcast sub-mix: program master (+ optional mic) -> encoder tap.
      const mix = ctx.createGain();
      this._recMaster.connect(mix);
      this._bcMix = mix;
      this._bcMic = null;
      this._bcMicStream = null;
      if (mic) {
        try {
          this._bcMicStream = await navigator.mediaDevices.getUserMedia({
            audio: micConstraints(),
          });
          this._bcMic = ctx.createMediaStreamSource(this._bcMicStream);
          this._bcMic.connect(mix); // into the broadcast mix only (never to speakers)
        } catch {
          this._bcMicStream = null; // graceful: music-only broadcast
        }
      }

      this._bcEnc = new Mp3Encoder(2, this._bcSampleRate, this._bcBitrate);
      const proc = ctx.createScriptProcessor(4096, 2, 2);
      const silent = ctx.createGain();
      silent.gain.value = 0;
      mix.connect(proc);
      proc.connect(silent);
      silent.connect(ctx.destination); // pulls the processor without adding audible output
      this._bcProc = proc;
      this._bcSilent = silent;

      proc.onaudioprocess = (ev) => {
        const inb = ev.inputBuffer;
        const l = inb.getChannelData(0);
        const r = inb.numberOfChannels > 1 ? inb.getChannelData(1) : l;
        const n = l.length;
        const li = new Int16Array(n);
        const ri = new Int16Array(n);
        let sum = 0;
        for (let i = 0; i < n; i++) {
          const lv = Math.max(-1, Math.min(1, l[i]));
          const rv = Math.max(-1, Math.min(1, r[i]));
          li[i] = lv * 32767;
          ri[i] = rv * 32767;
          sum += lv * lv;
        }
        this._bcLevel = Math.sqrt(sum / n);
        const conns = this._bcConns || [];
        if (!conns.length || !this._bcEnc) return;
        const mp3 = this._bcEnc.encodeBuffer(li, ri);
        if (!mp3.length) return;
        // Fan the same encoded frames out to every live station connection.
        for (let ci = 0; ci < conns.length; ci++) {
          const c = conns[ci];
          const ws = c.ws;
          if (!c.ready || !ws || ws.readyState !== WebSocket.OPEN) continue;
          if (ws.bufferedAmount < 512000) {
            try {
              ws.send(mp3.buffer);
            } catch {
              /* ignore */
            }
            c.sent = c.sent || [];
            c.sent.push([performance.now(), mp3.length]);
          } else {
            c.lastDrop = performance.now();
            c.drops = (c.drops || 0) + 1;
          }
        }
      };

      // Archive: record the whole broadcast to a file for reposting later.
      this._bcArchiveChunks = [];
      this._bcArchiveDest = null;
      this._bcArchiveRec = null;
      if (archive) {
        try {
          const dest = ctx.createMediaStreamDestination();
          mix.connect(dest);
          this._bcArchiveDest = dest;
          const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : "audio/webm";
          const rec = new MediaRecorder(dest.stream, { mimeType: mime });
          rec.ondataavailable = (e) => e.data && e.data.size && this._bcArchiveChunks.push(e.data);
          rec.start(2000);
          this._bcArchiveRec = rec;
        } catch {
          this._bcArchiveDest = null;
        }
      }
      this._bcGraphUp = true;
    }

    for (const st of list) this.addBroadcastStation(st);
  }

  addBroadcastStation({ id, wsUrl, config }) {
    if (!this._bcGraphUp) return;
    this._bcConns = this._bcConns || [];
    if (this._bcConns.some((c) => c.id === id)) return;
    const conn = {
      id,
      wsUrl,
      config,
      ws: null,
      ready: false,
      stop: false,
      attempt: 0,
      reconnectTimer: null,
      sent: [],
      drops: 0,
      lastDrop: 0,
    };
    this._bcConns.push(conn);
    this._connectConn(conn);
  }

  _connectConn(conn) {
    conn.ready = false;
    let ws;
    try {
      ws = new WebSocket(conn.wsUrl);
    } catch {
      this._bcOnState(conn.id, "error", "Couldn't open the broadcast connection.");
      return;
    }
    ws.binaryType = "arraybuffer";
    conn.ws = ws;
    ws.onopen = () => {
      this._bcOnState(conn.id, "connecting");
      try {
        ws.send(JSON.stringify(conn.config));
      } catch {
        /* ignore */
      }
    };
    ws.onmessage = (e) => {
      let m = {};
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      if (m.type === "live") {
        conn.attempt = 0;
        conn.ready = true;
        this._bcOnState(conn.id, "live");
      } else if (m.type === "error") {
        conn.stop = true;
        conn.ready = false;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        this._bcOnState(conn.id, "error", m.error || "Broadcast failed.");
        this._pruneConns();
      }
    };
    ws.onclose = () => {
      if (conn.stop) return;
      this._scheduleConnReconnect(conn);
    };
    ws.onerror = () => {
      /* onclose will follow and trigger reconnect */
    };
  }

  _scheduleConnReconnect(conn) {
    conn.ready = false;
    conn.attempt = (conn.attempt || 0) + 1;
    if (conn.attempt > 10) {
      conn.stop = true;
      this._bcOnState(conn.id, "error", "Lost the connection and couldn't reconnect. Check your internet / slot.");
      this._pruneConns();
      return;
    }
    const delay = Math.min(30, 2 ** Math.min(conn.attempt, 5));
    let left = delay;
    this._bcOnState(conn.id, "reconnecting", { seconds: left, attempt: conn.attempt });
    if (conn.reconnectTimer) clearInterval(conn.reconnectTimer);
    conn.reconnectTimer = setInterval(() => {
      if (conn.stop) {
        clearInterval(conn.reconnectTimer);
        conn.reconnectTimer = null;
        return;
      }
      left -= 1;
      if (left <= 0) {
        clearInterval(conn.reconnectTimer);
        conn.reconnectTimer = null;
        this._connectConn(conn);
      } else {
        this._bcOnState(conn.id, "reconnecting", { seconds: left, attempt: conn.attempt });
      }
    }, 1000);
  }

  sendBroadcastMeta(title, stationId) {
    if (!title) return;
    const payload = JSON.stringify({ type: "meta", title: String(title) });
    for (const c of this._bcConns || []) {
      if (stationId && c.id !== stationId) continue;
      if (c.ready && c.ws && c.ws.readyState === WebSocket.OPEN) {
        try {
          c.ws.send(payload);
        } catch {
          /* ignore */
        }
      }
    }
  }

  _pruneConns() {
    this._bcConns = (this._bcConns || []).filter((c) => !c.stop || (c.ws && c.ws.readyState <= 1));
    if (this._bcGraphUp && !(this._bcConns || []).some((c) => !c.stop)) {
      this._teardownBroadcastGraph();
    }
  }

  stopBroadcastStation(id, silent = false) {
    const conn = (this._bcConns || []).find((c) => c.id === id);
    if (!conn) return;
    conn.stop = true;
    conn.ready = false;
    if (conn.reconnectTimer) {
      clearInterval(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }
    try {
      if (conn.ws && conn.ws.readyState <= 1) conn.ws.close();
    } catch {
      /* ignore */
    }
    conn.ws = null;
    this._bcConns = (this._bcConns || []).filter((c) => c.id !== id);
    if (!silent && this._bcOnState) this._bcOnState(id, "stopped");
    if (!this._bcConns.length) this._teardownBroadcastGraph();
  }

  stopBroadcast(silent = false) {
    for (const c of this._bcConns || []) {
      c.stop = true;
      c.ready = false;
      if (c.reconnectTimer) {
        clearInterval(c.reconnectTimer);
        c.reconnectTimer = null;
      }
      try {
        if (c.ws && c.ws.readyState <= 1) c.ws.close();
      } catch {
        /* ignore */
      }
      c.ws = null;
      if (!silent && this._bcOnState) this._bcOnState(c.id, "stopped");
    }
    this._bcConns = [];
    this._teardownBroadcastGraph();
  }

  _teardownBroadcastGraph() {
    if (!this._bcGraphUp) return;
    this._bcGraphUp = false;
    this._bcLevel = 0;
    try {
      if (this._bcProc) this._bcProc.onaudioprocess = null;
    } catch {
      /* ignore */
    }
    // Finalize the archive recording, then hand the file back.
    const rec = this._bcArchiveRec;
    if (rec && rec.state !== "inactive") {
      rec.onstop = () => {
        const blob = new Blob(this._bcArchiveChunks, {
          type: (this._bcArchiveChunks[0] && this._bcArchiveChunks[0].type) || "audio/webm",
        });
        try {
          if (blob.size > 0) this._bcOnArchive(blob);
        } catch {
          /* ignore */
        }
        this._bcArchiveChunks = [];
      };
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    }
    this._bcArchiveRec = null;
    [this._bcProc, this._bcSilent, this._bcMix, this._bcMic, this._bcArchiveDest].forEach((node) => {
      try {
        node && node.disconnect();
      } catch {
        /* ignore */
      }
    });
    try {
      if (this._bcMicStream) this._bcMicStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    this._bcProc = null;
    this._bcSilent = null;
    this._bcMix = null;
    this._bcMic = null;
    this._bcMicStream = null;
    this._bcArchiveDest = null;
    this._bcEnc = null;
  }

  // ---- Input level meter (for the "Test connection" check; no streaming) ----
  async startInputMeter(mic = true) {
    const ctx = this._ensureProgramGraph();
    if (!ctx) return false;
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
    this.stopInputMeter();
    const an = ctx.createAnalyser();
    an.fftSize = 1024;
    this._meterData = new Float32Array(an.fftSize);
    try {
      this._recMaster.connect(an);
    } catch {
      /* ignore */
    }
    this._meterAnalyser = an;
    this._meterMic = null;
    this._meterMicStream = null;
    if (mic) {
      try {
        this._meterMicStream = await navigator.mediaDevices.getUserMedia({
          audio: micConstraints(),
        });
        this._meterMic = ctx.createMediaStreamSource(this._meterMicStream);
        this._meterMic.connect(an);
      } catch {
        this._meterMicStream = null;
      }
    }
    return true;
  }

  getInputMeterLevel() {
    const an = this._meterAnalyser;
    if (!an || !this._meterData) return 0;
    an.getFloatTimeDomainData(this._meterData);
    let sum = 0;
    for (let i = 0; i < this._meterData.length; i++) {
      const v = this._meterData[i];
      sum += v * v;
    }
    return Math.sqrt(sum / this._meterData.length);
  }

  stopInputMeter() {
    try {
      if (this._meterMic) this._meterMic.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (this._meterAnalyser) this._meterAnalyser.disconnect();
    } catch {
      /* ignore */
    }
    try {
      if (this._meterMicStream) this._meterMicStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    this._meterMic = null;
    this._meterMicStream = null;
    this._meterAnalyser = null;
    this._meterData = null;
  }


  _emitStandby() {
    if (!this.onStandby) return;
    this.onStandby({
      trackId: this.standbyArmed ? this.standbyTrackId : null,
      faderPos: this._faderPos,
      curve: this.faderCurve,
      syncRate: this._syncRate,
      onairBpm: this._onairBpm,
      standbyBpm: this.standbyArmed ? this._standbyBpm : null,
    });
  }

  _onTime(el) {
    // Safety: if a fade somehow outran its duration (timer throttled while
    // backgrounded), finish it so advancing never stalls.
    if (this._fading && this._fadeState && performance.now() - this._fadeState.start > this._fadeState.durMs + 1500) {
      this._finishFade();
    }
    if (el !== this.active) return;
    const dur = el.duration;
    if (dur && isFinite(dur)) {
      const track = this.queue[this.index];
      const effEnd =
        track && track.cueOut != null
          ? Math.min(track.cueOut, dur)
          : this.trimSilence && track && track.tailStart
          ? Math.min(track.tailStart, dur)
          : dur;
      const hasNext = this._hasNext();
      const remaining = effEnd - el.currentTime;
      const hasEarlyEnd = effEnd < dur - 0.05;
      if (this.cueAutoFade && !this._fading) {
        if (remaining > 0 && remaining <= this.cueFadeSeconds) {
          this._setVol(this.active, Math.max(0, this._effVol() * (remaining / this.cueFadeSeconds)));
        } else if (!this.duckActive) {
          this._setVol(this.active, this._effVol());
        }
      }
      if (
        this.loopRegion &&
        !this._fading &&
        hasEarlyEnd &&
        el.currentTime >= effEnd
      ) {
        // Rehearse loop: jump back to the In point (or start) and keep playing.
        el.currentTime = track && track.cueIn != null ? track.cueIn : 0;
      } else if (
        this.crossfade &&
        this.autoplay &&
        !this._fading &&
        !this._manualFading &&
        !this.standbyArmed &&
        !this._stopping &&
        hasNext &&
        remaining <= this.crossfadeSeconds &&
        remaining > 0.05
      ) {
        this._startCrossfade();
      } else if (!this._fading && !this._manualFading && !this._stopping && hasEarlyEnd && el.currentTime >= effEnd) {
        if (this.standbyArmed) {
          this.takeStandby();
          return;
        }
        const n = this._nextIndex();
        if (this.autoplay && n >= 0) {
          this.playIndex(n);
        } else {
          el.pause();
          el.currentTime = track && track.cueIn != null ? track.cueIn : 0;
          this._emit();
        }
      }
    }
    this._emit();
  }

  async _startCrossfade() {
    if (this._fading) return;
    this._fading = true;
    // A duck volume-ramp must not fight the fade loop.
    if (this._volRaf) {
      cancelAnimationFrame(this._volRaf);
      this._volRaf = null;
    }
    const from = this.active;
    const to = this.idle;
    const nextIndex = this._nextIndex();
    if (nextIndex < 0) {
      this._fading = false;
      return;
    }
    const url = await this.getUrl(this.queue[nextIndex]);
    if (!url) {
      this._fading = false;
      return;
    }
    to.src = url;
    this._setVol(to, 0);
    try {
      to.currentTime = 0;
      await to.play();
    } catch {
      /* ignore */
    }
    const durMs = Math.max(0.3, this.crossfadeSeconds) * 1000;
    // Timer-based (not rAF) so the fade still completes when the tab is
    // backgrounded / the screen is off — rAF fully pauses there, which used to
    // leave _fading stuck true forever and kill all future auto-advance.
    this._fadeState = { from, to, nextIndex, start: performance.now(), durMs };
    if (this._fadeTimer) clearInterval(this._fadeTimer);
    this._fadeTimer = setInterval(() => this._fadeTick(), 40);
    this._fadeTick();
  }

  _fadeTick() {
    const st = this._fadeState;
    if (!st) return;
    const p = Math.min(1, (performance.now() - st.start) / st.durMs);
    const peak = this._effVol();
    this._setVol(st.from, Math.max(0, peak * (1 - p)));
    this._setVol(st.to, Math.min(peak, peak * p));
    if (p >= 1) this._finishFade();
  }

  _finishFade() {
    const st = this._fadeState;
    if (!st) return;
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
    try {
      st.from.pause();
      st.from.currentTime = 0;
    } catch {
      /* ignore */
    }
    this.active = st.to;
    this.idle = st.from;
    this.index = st.nextIndex;
    this._fading = false;
    this._fadeState = null;
    this._setVol(this.active, this._effVol());
    this._emit();
  }

  _cancelFade() {
    if (this._fadeTimer) {
      clearInterval(this._fadeTimer);
      this._fadeTimer = null;
    }
    if (this._fadeRaf) cancelAnimationFrame(this._fadeRaf);
    this._fadeRaf = null;
    this._fading = false;
    this._fadeState = null;
  }

  _onEnded(el) {
    if (el !== this.active) return;
    if (this._fading || this._manualFading) return;
    const track = this.queue[this.index];
    if (this.standbyArmed) {
      this.takeStandby();
      return;
    }
    if (this.loopRegion) {
      el.currentTime = track && track.cueIn != null ? track.cueIn : 0;
      el.play().catch(() => {});
      return;
    }
    const n = this._nextIndex();
    if (this.autoplay && n >= 0) {
      this.playIndex(n);
    } else {
      el.currentTime = track && track.cueIn != null ? track.cueIn : 0;
      this._emit();
    }
  }

  _emit() {
    if (!this.onUpdate) return;
    this._wasPlaying = !this.active.paused;
    this.onUpdate({
      index: this.index,
      isPlaying: !this.active.paused,
      currentTime: this.active.currentTime || 0,
      duration: this.active.duration || 0,
      volume: this.volume,
    });
  }

  _emitCue() {
    if (!this.onCue) return;
    this.onCue({
      trackId: this.cueTrackId,
      isPlaying: !this.cue.paused && !!this.cueTrackId,
      currentTime: this.cue.currentTime || 0,
      duration: this.cue.duration || 0,
    });
  }

  destroy() {
    this._cancelFade();
    this._cancelTake();
    if (this._nudgeTimer) clearTimeout(this._nudgeTimer);
    if (this._actx) {
      try {
        this._actx.close();
      } catch {
        /* ignore */
      }
      this._actx = null;
    }
    [this.a, this.b, this.cue].forEach((el) => {
      el.pause();
      el.src = "";
    });
  }
}
