import { Mp3Encoder } from "@breezystack/lamejs";
import { getBlob } from "@/lib/db";
import { micConstraints } from "@/lib/mic";

// Independent multi-channel playout: each channel is its own program (its own
// playlist, player, mic routing and MP3 encoder) streaming to its own station.
// This lets a DJ air DIFFERENT live shows on different channels at the same time.
export class MultiChannelEngine {
  constructor() {
    this.ctx = null;
    this.channels = new Map();
    this.micStream = null;
    this.micSource = null;
    this.duckLevel = 0.2; // global: music gain while a channel's mic is open
  }

  setDuckLevel(level) {
    this.duckLevel = Math.max(0, Math.min(1, level));
    // Re-assert the duck on any channel currently talking.
    this.channels.forEach((ch) => {
      if (ch.musicGain) {
        const target = ch.micOn ? this.duckLevel : 1;
        try {
          ch.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
        } catch {
          ch.musicGain.gain.value = target;
        }
      }
    });
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async resume() {
    const ctx = this._ensureCtx();
    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        /* ignore */
      }
    }
  }

  async _ensureMic() {
    this._ensureCtx();
    if (this.micSource) return this.micSource;
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: micConstraints(),
      });
      this.micSource = this.ctx.createMediaStreamSource(this.micStream);
    } catch {
      this.micSource = null;
    }
    return this.micSource;
  }

  addChannel(id, { bitrate = 128, onState, onTrack, onLevel } = {}) {
    const ctx = this._ensureCtx();
    if (this.channels.has(id)) return this.channels.get(id);
    const audio = new Audio();
    audio.preload = "auto";
    audio.crossOrigin = "anonymous";
    const src = ctx.createMediaElementSource(audio);
    const musicGain = ctx.createGain(); // duckable — music only, never the mic
    musicGain.gain.value = 1;
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const monitor = ctx.createGain();
    monitor.gain.value = 0; // headphone monitor off by default (avoid a wall of sound)
    src.connect(musicGain);
    musicGain.connect(gain);
    gain.connect(monitor);
    monitor.connect(ctx.destination);
    const enc = new Mp3Encoder(2, Math.round(ctx.sampleRate), bitrate);
    const proc = ctx.createScriptProcessor(4096, 2, 2);
    const silent = ctx.createGain();
    silent.gain.value = 0;
    gain.connect(proc);
    proc.connect(silent);
    silent.connect(ctx.destination);

    const ch = {
      id, audio, src, musicGain, gain, monitor, enc, proc, silent, bitrate,
      playlist: [], index: 0, playing: false, curUrl: null, micOn: false, level: 0,
      ws: null, wsUrl: "", config: null, ready: false, stop: false, attempt: 0, reconnectTimer: null,
      onState: onState || (() => {}), onTrack: onTrack || (() => {}), onLevel: onLevel || (() => {}),
    };

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
      ch.level = Math.sqrt(sum / n);
      const ws = ch.ws;
      if (!ch.ready || !ws || ws.readyState !== WebSocket.OPEN) return;
      const mp3 = ch.enc.encodeBuffer(li, ri);
      if (mp3.length && ws.bufferedAmount < 512000) {
        try {
          ws.send(mp3.buffer);
        } catch {
          /* ignore */
        }
      }
    };

    audio.addEventListener("ended", () => this.next(id));
    this.channels.set(id, ch);
    return ch;
  }

  setPlaylist(id, items) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.playlist = (items || []).slice();
    ch.index = 0;
    // Load the new program's first track immediately (fires onTrack for the UI),
    // and keep playing if the channel was already on air.
    this._loadIndex(ch).then((ok) => {
      if (ok && ch.playing) {
        try {
          ch.audio.play();
        } catch {
          /* ignore */
        }
      }
    });
  }

  getState(id) {
    const ch = this.channels.get(id);
    if (!ch) return null;
    return { playing: ch.playing, index: ch.index, micOn: ch.micOn, monitor: ch.monitor.gain.value > 0, live: ch.ready };
  }

  getLevel(id) {
    const ch = this.channels.get(id);
    return ch ? ch.level : 0;
  }

  async _loadIndex(ch) {
    const item = ch.playlist[ch.index];
    if (!item) {
      ch.onTrack(null, ch.index);
      return false;
    }
    try {
      let url = item.url;
      if (!url) {
        const blob = await getBlob(item.id);
        if (ch.curUrl) URL.revokeObjectURL(ch.curUrl);
        ch.curUrl = URL.createObjectURL(blob);
        url = ch.curUrl;
      }
      ch.audio.src = url;
      ch.onTrack(item, ch.index);
      // Push track title to the station's metadata if we're live.
      const title = [item.artist, item.title].filter(Boolean).join(" - ") || item.title || "";
      this.sendMeta(ch.id, title);
      return true;
    } catch {
      return false;
    }
  }

  async cue(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    if (!ch.audio.src) await this._loadIndex(ch);
  }

  async play(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    await this.resume();
    if (!ch.audio.src) {
      const ok = await this._loadIndex(ch);
      if (!ok) return;
    }
    try {
      await ch.audio.play();
      ch.playing = true;
      ch.onState("playing");
    } catch {
      /* ignore */
    }
  }

  pause(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.audio.pause();
    ch.playing = false;
    ch.onState("paused");
  }

  toggle(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    if (ch.playing) this.pause(id);
    else this.play(id);
  }

  async next(id) {
    const ch = this.channels.get(id);
    if (!ch || !ch.playlist.length) return;
    ch.index = (ch.index + 1) % ch.playlist.length;
    await this._loadIndex(ch);
    if (ch.playing) {
      try {
        await ch.audio.play();
      } catch {
        /* ignore */
      }
    }
  }

  async prev(id) {
    const ch = this.channels.get(id);
    if (!ch || !ch.playlist.length) return;
    ch.index = (ch.index - 1 + ch.playlist.length) % ch.playlist.length;
    await this._loadIndex(ch);
    if (ch.playing) {
      try {
        await ch.audio.play();
      } catch {
        /* ignore */
      }
    }
  }

  async playIndex(id, i) {
    const ch = this.channels.get(id);
    if (!ch) return;
    await this.resume();
    ch.index = i;
    await this._loadIndex(ch);
    ch.playing = true;
    try {
      await ch.audio.play();
    } catch {
      /* ignore */
    }
    ch.onState("playing");
  }

  setMonitor(id, on) {
    const ch = this.channels.get(id);
    if (ch) ch.monitor.gain.value = on ? 1 : 0;
  }

  async setMic(id, on) {
    const ch = this.channels.get(id);
    if (!ch) return;
    if (on) {
      const m = await this._ensureMic();
      if (m) {
        try {
          m.connect(ch.gain);
        } catch {
          /* ignore */
        }
        ch.micOn = true;
      }
    } else {
      if (this.micSource) {
        try {
          this.micSource.disconnect(ch.gain);
        } catch {
          /* ignore */
        }
      }
      ch.micOn = false;
    }
    // Auto-duck this channel's music the moment its mic opens (global level).
    if (ch.musicGain) {
      const target = ch.micOn ? this.duckLevel : 1;
      try {
        ch.musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      } catch {
        ch.musicGain.gain.value = target;
      }
    }
  }

  // ---- Live streaming (per channel, its own WSS relay -> its own station) ----
  goLive(id, wsUrl, config) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.stop = false;
    ch.wsUrl = wsUrl;
    ch.config = config;
    ch.attempt = 0;
    this._connect(ch);
  }

  _connect(ch) {
    ch.ready = false;
    let ws;
    try {
      ws = new WebSocket(ch.wsUrl);
    } catch {
      ch.onState("error", "Couldn't open the broadcast connection.");
      return;
    }
    ws.binaryType = "arraybuffer";
    ch.ws = ws;
    ws.onopen = () => {
      ch.onState("connecting");
      try {
        ws.send(JSON.stringify(ch.config));
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
        ch.attempt = 0;
        ch.ready = true;
        ch.onState("live");
      } else if (m.type === "error") {
        ch.stop = true;
        ch.ready = false;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ch.onState("error", m.error || "Broadcast failed.");
      }
    };
    ws.onclose = () => {
      if (ch.stop) return;
      this._reconnect(ch);
    };
    ws.onerror = () => {};
  }

  _reconnect(ch) {
    ch.ready = false;
    ch.attempt = (ch.attempt || 0) + 1;
    if (ch.attempt > 10) {
      ch.stop = true;
      ch.onState("error", "Lost the connection and couldn't reconnect.");
      return;
    }
    const delay = Math.min(30, 2 ** Math.min(ch.attempt, 5));
    let left = delay;
    ch.onState("reconnecting", { seconds: left, attempt: ch.attempt });
    if (ch.reconnectTimer) clearInterval(ch.reconnectTimer);
    ch.reconnectTimer = setInterval(() => {
      if (ch.stop) {
        clearInterval(ch.reconnectTimer);
        ch.reconnectTimer = null;
        return;
      }
      left -= 1;
      if (left <= 0) {
        clearInterval(ch.reconnectTimer);
        ch.reconnectTimer = null;
        this._connect(ch);
      } else {
        ch.onState("reconnecting", { seconds: left, attempt: ch.attempt });
      }
    }, 1000);
  }

  sendMeta(id, title) {
    const ch = this.channels.get(id);
    if (!ch || !title || !ch.ready || !ch.ws || ch.ws.readyState !== WebSocket.OPEN) return;
    try {
      ch.ws.send(JSON.stringify({ type: "meta", title: String(title) }));
    } catch {
      /* ignore */
    }
  }

  stopLive(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.stop = true;
    ch.ready = false;
    if (ch.reconnectTimer) {
      clearInterval(ch.reconnectTimer);
      ch.reconnectTimer = null;
    }
    try {
      if (ch.ws && ch.ws.readyState <= 1) ch.ws.close();
    } catch {
      /* ignore */
    }
    ch.ws = null;
    ch.onState("stopped");
  }

  removeChannel(id) {
    const ch = this.channels.get(id);
    if (!ch) return;
    this.stopLive(id);
    try {
      ch.audio.pause();
    } catch {
      /* ignore */
    }
    try {
      ch.proc.onaudioprocess = null;
    } catch {
      /* ignore */
    }
    [ch.proc, ch.silent, ch.gain, ch.musicGain, ch.monitor, ch.src].forEach((node) => {
      try {
        node && node.disconnect();
      } catch {
        /* ignore */
      }
    });
    if (ch.curUrl) {
      try {
        URL.revokeObjectURL(ch.curUrl);
      } catch {
        /* ignore */
      }
    }
    this.channels.delete(id);
  }

  destroy() {
    Array.from(this.channels.keys()).forEach((id) => this.removeChannel(id));
    try {
      if (this.micStream) this.micStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    this.micSource = null;
    this.micStream = null;
    try {
      if (this.ctx) this.ctx.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}
