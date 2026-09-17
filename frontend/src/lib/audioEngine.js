// Dual-element audio engine with crossfade / gapless auto-play for live playout,
// plus an independent CUE (headphone pre-listen) channel and audio-output routing.
export default class AudioEngine {
  constructor(onUpdate, onCue) {
    this.onUpdate = onUpdate;
    this.onCue = onCue;
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
    if (!this._fading) this.active.volume = this._effVol();
    this._emit();
  }

  _effVol() {
    return this.duckActive ? this.volume * this.duckLevel : this.volume;
  }

  _rampTo(el, target, ms) {
    if (this._volRaf) cancelAnimationFrame(this._volRaf);
    const start = performance.now();
    const from = el.volume;
    const step = (now) => {
      const p = Math.min(1, (now - start) / ms);
      el.volume = from + (target - from) * p;
      if (p < 1) this._volRaf = requestAnimationFrame(step);
    };
    this._volRaf = requestAnimationFrame(step);
  }

  setDuck(active, level, ms) {
    this.duckActive = active;
    if (typeof level === "number") this.duckLevel = level;
    else if (active) this.duckLevel = 0.28;
    const dur = typeof ms === "number" ? ms : 220;
    if (!this._fading) this._rampTo(this.active, this._effVol(), dur);
  }

  setTrimSilence(on) {
    this.trimSilence = on;
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
    this.active.volume = this._effVol();
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
      if (this.active.volume === 0) this.active.volume = this._effVol();
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
      el.volume = Math.max(0, startVol * (1 - p));
      if (p < 1) {
        this._sleepRaf = requestAnimationFrame(step);
      } else {
        el.pause();
        this._sleepRaf = null;
        this._stopping = false;
        el.volume = this._effVol();
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
    el.volume = 0;
    const durMs = Math.max(0.3, seconds) * 1000;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / durMs);
      el.volume = Math.min(target, target * p);
      if (p < 1) {
        this._sleepRaf = requestAnimationFrame(step);
      } else {
        el.volume = this._effVol();
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
    this.cue.volume = 1;
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
          this.active.volume = Math.max(0, this._effVol() * (remaining / this.cueFadeSeconds));
        } else if (!this.duckActive) {
          this.active.volume = this._effVol();
        }
      }
      if (
        this.crossfade &&
        this.autoplay &&
        !this._fading &&
        !this._stopping &&
        hasNext &&
        remaining <= this.crossfadeSeconds &&
        remaining > 0.05
      ) {
        this._startCrossfade();
      } else if (!this._fading && !this._stopping && hasEarlyEnd && el.currentTime >= effEnd) {
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
    to.volume = 0;
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
      from.volume = Math.max(0, peak * (1 - p));
      to.volume = Math.min(peak, peak * p);
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
        this.active.volume = this._effVol();
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
    if (this._fading) return;
    const n = this._nextIndex();
    if (this.autoplay && n >= 0) {
      this.playIndex(n);
    } else {
      const track = this.queue[this.index];
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
    [this.a, this.b, this.cue].forEach((el) => {
      el.pause();
      el.src = "";
    });
  }
}
