// Dual-element audio engine with crossfade / gapless auto-play for live playout,
// plus an independent CUE (headphone pre-listen) channel and audio-output routing.
export default class AudioEngine {
  constructor(onUpdate, onCue, onStandby) {
    this.onUpdate = onUpdate;
    this.onCue = onCue;
    this.onStandby = onStandby;
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
    this._bpmCache = {};
    this._actx = null;
    this._syncRate = 1;
    this._nudgeTimer = null;
    this._onairBpm = null;
    this._standbyBpm = null;
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
    const start = performance.now();
    const from = el.volume;
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      this._setVol(el, from + (target - from) * p);
      if (p < 1) this._volRaf = requestAnimationFrame(step);
    };
    this._volRaf = requestAnimationFrame(step);
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
    const startAt =
      track && track.cueIn != null
        ? track.cueIn
        : this.trimSilence && track && track.leadIn
        ? track.leadIn
        : 0;
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
    const startAt =
      track.cueIn != null
        ? track.cueIn
        : this.trimSilence && track.leadIn
        ? track.leadIn
        : 0;
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
  }

  _cancelTake() {
    if (this._takeRaf) cancelAnimationFrame(this._takeRaf);
    this._takeRaf = null;
  }

  // ---- Fader curve (crossfader shape) ----
  setFaderCurve(curve) {
    this.faderCurve = curve === "sharp" ? "sharp" : "smooth";
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

  async bpmFor(track) {
    if (!track) return null;
    if (this._bpmCache[track.id] != null) return this._bpmCache[track.id];
    const ctx = this._ctx();
    if (!ctx) return null;
    try {
      const url = await this.getUrl(track);
      if (!url) return null;
      const res = await fetch(url);
      const arr = await res.arrayBuffer();
      const buf = await ctx.decodeAudioData(arr.slice(0));
      const { estimateBpm } = await import("./bpm");
      const bpm = estimateBpm(buf);
      if (bpm) this._bpmCache[track.id] = bpm;
      return bpm;
    } catch {
      return null;
    }
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
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / durMs);
      // Fade toward the CURRENT effective volume so an active duck (mic/talk/
      // jingle) is preserved across the track change instead of jumping to full.
      const peak = this._effVol();
      this._setVol(from, Math.max(0, peak * (1 - p)));
      this._setVol(to, Math.min(peak, peak * p));
      if (p < 1) {
        this._fadeRaf = requestAnimationFrame(step);
      } else {
        from.pause();
        try {
          from.currentTime = 0;
        } catch {
          /* ignore */
        }
        this.active = to;
        this.idle = from;
        this.index = nextIndex;
        this._fading = false;
        // Re-assert the effective (possibly ducked) volume on the new active
        // element in case the duck state changed during the fade.
        this._setVol(this.active, this._effVol());
        this._emit();
      }
    };
    this._fadeRaf = requestAnimationFrame(step);
  }

  _cancelFade() {
    if (this._fadeRaf) cancelAnimationFrame(this._fadeRaf);
    this._fadeRaf = null;
    this._fading = false;
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
