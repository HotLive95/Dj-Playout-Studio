// Client-side audio processing: decode, waveform peaks, silence detection,
// trim/cut rendering, and WAV/MP3 encoding. Runs fully offline.
import * as lamejs from "@breezystack/lamejs";

let sharedCtx = null;
export function audioCtx() {
  if (!sharedCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    sharedCtx = new AC();
  }
  return sharedCtx;
}

export async function decodeToBuffer(url) {
  const res = await fetch(url);
  const arr = await res.arrayBuffer();
  return await audioCtx().decodeAudioData(arr.slice(0));
}

// Downsample to `count` min/max peak pairs for waveform rendering.
export function computePeaks(buffer, count = 1200) {
  const ch = buffer.getChannelData(0);
  const block = Math.floor(ch.length / count) || 1;
  const peaks = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    let max = 0;
    const start = i * block;
    for (let j = 0; j < block; j++) {
      const v = Math.abs(ch[start + j] || 0);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  return peaks;
}

// Detect leading/trailing silence. Returns { leadIn, tailStart } in seconds.
export function detectSilence(buffer, thresholdDb = -45) {
  const ch = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const thr = Math.pow(10, thresholdDb / 20);
  const win = Math.floor(sr * 0.02) || 1; // 20ms windows
  const loud = (start) => {
    let sum = 0;
    for (let j = 0; j < win; j++) {
      const v = ch[start + j] || 0;
      sum += v * v;
    }
    return Math.sqrt(sum / win) > thr;
  };
  let lead = 0;
  for (let i = 0; i < ch.length; i += win) {
    if (loud(i)) {
      lead = i;
      break;
    }
  }
  let tail = ch.length;
  for (let i = ch.length - win; i >= 0; i -= win) {
    if (loud(i)) {
      tail = i + win;
      break;
    }
  }
  return {
    leadIn: Math.max(0, lead / sr - 0.05),
    tailStart: Math.min(buffer.duration, tail / sr + 0.05),
  };
}

// Build a new AudioBuffer from an array of keep-regions [{start,end}] (seconds).
export function sliceAndConcat(buffer, regions) {
  const sr = buffer.sampleRate;
  const chs = buffer.numberOfChannels;
  const ranges = regions
    .map((r) => [Math.max(0, Math.floor(r.start * sr)), Math.min(buffer.length, Math.floor(r.end * sr))])
    .filter(([s, e]) => e > s);
  const total = ranges.reduce((sum, [s, e]) => sum + (e - s), 0);
  const out = audioCtx().createBuffer(chs, Math.max(1, total), sr);
  for (let c = 0; c < chs; c++) {
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    let offset = 0;
    for (const [s, e] of ranges) {
      dst.set(src.subarray(s, e), offset);
      offset += e - s;
    }
  }
  return out;
}

// Given trim in/out and cut regions, compute the keep-regions.
export function keepRegionsFrom(inPoint, outPoint, cuts) {
  const sorted = [...cuts].sort((a, b) => a.start - b.start);
  const keep = [];
  let cursor = inPoint;
  for (const cut of sorted) {
    const cs = Math.max(inPoint, cut.start);
    const ce = Math.min(outPoint, cut.end);
    if (ce <= cursor) continue;
    if (cs > cursor) keep.push({ start: cursor, end: Math.min(cs, outPoint) });
    cursor = Math.max(cursor, ce);
  }
  if (cursor < outPoint) keep.push({ start: cursor, end: outPoint });
  return keep.filter((r) => r.end > r.start);
}

function floatTo16(float32) {
  const out = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function bufferToWav(buffer) {
  const chs = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const length = buffer.length * chs * 2 + 44;
  const ab = new ArrayBuffer(length);
  const view = new DataView(ab);
  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, length - 8, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, chs, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * chs * 2, true);
  view.setUint16(32, chs * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, length - 44, true);
  let off = 44;
  const channels = [];
  for (let c = 0; c < chs; c++) channels.push(buffer.getChannelData(c));
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < chs; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([view], { type: "audio/wav" });
}

export async function bufferToMp3(buffer, kbps = 192, onProgress) {
  const chs = Math.min(2, buffer.numberOfChannels);
  const sr = buffer.sampleRate;
  const enc = new lamejs.Mp3Encoder(chs, sr, kbps);
  const left = floatTo16(buffer.getChannelData(0));
  const right = chs > 1 ? floatTo16(buffer.getChannelData(1)) : null;
  const blockSize = 1152;
  const data = [];
  const totalBlocks = Math.max(1, Math.ceil(left.length / blockSize));
  let b = 0;
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize);
    let buf;
    if (right) {
      const r = right.subarray(i, i + blockSize);
      buf = enc.encodeBuffer(l, r);
    } else {
      buf = enc.encodeBuffer(l);
    }
    if (buf.length) data.push(new Int8Array(buf));
    b++;
    if (onProgress && b % 64 === 0) {
      onProgress(b / totalBlocks);
      // yield so the UI can repaint the progress bar
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const end = enc.flush();
  if (end.length) data.push(new Int8Array(end));
  if (onProgress) onProgress(1);
  return new Blob(data, { type: "audio/mpeg" });
}
