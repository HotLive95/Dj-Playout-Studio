// Dual-element audio engine with crossfade / gapless auto-play for live playout.
export default class AudioEngine {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.a = new Audio();
    this.b = new Audio();
    [this.a, this.b].forEach((el) => {
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
    this._fading = false;
    this._fadeRaf = null;
    this._bind();
  }

  _bind() {
    const emit = () => this._emit();
    ["timeupdate"].forEach((ev) => {
      this.a.addEventListener(ev, () => this._onTime(this.a));
      this.b.addEventListener(ev, () => this._onTime(this.b));
    });
    ["ended"].forEach((ev) => {
      this.a.addEventListener(ev, () => this._onEnded(this.a));
      this.b.addEventListener(ev, () => this._onEnded(this.b));
    });
    ["loadedmetadata", "play", "pause", "durationchange"].forEach((ev) => {
      this.a.addEventListener(ev, emit);
      this.b.addEventListener(ev, emit);
    });
  }

  setQueue(tracks, getUrl) {
    this.queue = tracks;
    if (getUrl) this.getUrl = getUrl;
  }

  // Reorder/remove-safe: keep playing the same track after list changes.
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
    if (!this._fading) {
      this.active.volume = v;
    }
    this._emit();
  }

  setCrossfade(on, sec) {
    this.crossfade = on;
    if (sec) this.crossfadeSeconds = sec;
  }

  setAutoplay(on) {
    this.autoplay = on;
  }

  async playIndex(i) {
    if (i < 0 || i >= this.queue.length) return;
    this._cancelFade();
    this.idle.pause();
    const url = await this.getUrl(this.queue[i]);
    if (!url) return;
    this.index = i;
    this.active.src = url;
    this.active.volume = this.volume;
    try {
      this.active.currentTime = 0;
    } catch {
      /* ignore */
    }
    try {
      await this.active.play();
    } catch {
      /* autoplay blocked */
    }
    this._emit();
  }

  async togglePlay() {
    if (this.index < 0) {
      if (this.queue.length) await this.playIndex(0);
      return;
    }
    if (this.active.paused) {
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
    if (this.index < this.queue.length - 1) this.playIndex(this.index + 1);
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

  seek(t) {
    if (this.index < 0) return;
    try {
      this.active.currentTime = t;
    } catch {
      /* ignore */
    }
    this._emit();
  }

  _onTime(el) {
    if (el !== this.active) return;
    const dur = el.duration;
    if (
      this.crossfade &&
      this.autoplay &&
      !this._fading &&
      dur &&
      isFinite(dur) &&
      this.index < this.queue.length - 1
    ) {
      const remaining = dur - el.currentTime;
      if (remaining <= this.crossfadeSeconds && remaining > 0.05) {
        this._startCrossfade();
      }
    }
    this._emit();
  }

  async _startCrossfade() {
    if (this._fading) return;
    this._fading = true;
    const from = this.active;
    const to = this.idle;
    const nextIndex = this.index + 1;
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
      from.volume = Math.max(0, this.volume * (1 - p));
      to.volume = Math.min(this.volume, this.volume * p);
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
    if (this.autoplay && this.index < this.queue.length - 1) {
      this.playIndex(this.index + 1);
    } else {
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

  destroy() {
    this._cancelFade();
    this.a.pause();
    this.b.pause();
    this.a.src = "";
    this.b.src = "";
  }
}
