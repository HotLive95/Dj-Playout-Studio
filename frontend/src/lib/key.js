// Offline musical-key estimator (chromagram + Krumhansl-Schmuckler profiles)
// and Camelot-wheel helpers for harmonic mixing. Best-effort.

// In-place iterative radix-2 FFT (real input; imag starts at 0).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k];
        const ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr;
        im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr;
        im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = ncr;
      }
    }
  }
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// Camelot wheel indexed by pitch class (0=C .. 11=B).
const MAJOR_CAMELOT = ["8B", "3B", "10B", "5B", "12B", "7B", "2B", "9B", "4B", "11B", "6B", "1B"];
const MINOR_CAMELOT = ["5A", "12A", "7A", "2A", "9A", "4A", "11A", "6A", "1A", "8A", "3A", "10A"];

const KS_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function correlate(chroma, profile, shift) {
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < 12; i++) {
    sx += chroma[(i + shift) % 12];
    sy += profile[i];
  }
  const mx = sx / 12;
  const my = sy / 12;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < 12; i++) {
    const a = chroma[(i + shift) % 12] - mx;
    const b = profile[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const den = Math.sqrt(dx * dy);
  return den ? num / den : 0;
}

export function estimateKey(audioBuffer) {
  const sr = audioBuffer.sampleRate;
  const ch = audioBuffer.numberOfChannels;
  const maxSamples = Math.min(audioBuffer.length, Math.floor(sr * 60));
  if (maxSamples < sr) return null;

  const mono = new Float32Array(maxSamples);
  for (let c = 0; c < ch; c++) {
    const d = audioBuffer.getChannelData(c);
    for (let i = 0; i < maxSamples; i++) mono[i] += d[i] / ch;
  }

  const N = 4096;
  const hop = 4096;
  const half = N / 2;
  // Hann window
  const win = new Float32Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
  // bin -> pitch class map
  const pcOf = new Int8Array(half);
  for (let b = 0; b < half; b++) {
    const freq = (b * sr) / N;
    if (freq < 27.5 || freq > 5000) {
      pcOf[b] = -1;
      continue;
    }
    const midi = Math.round(69 + 12 * Math.log2(freq / 440));
    pcOf[b] = ((midi % 12) + 12) % 12;
  }

  const chroma = new Float32Array(12);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let start = 0; start + N <= maxSamples; start += hop) {
    for (let i = 0; i < N; i++) {
      re[i] = mono[start + i] * win[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let b = 1; b < half; b++) {
      const pc = pcOf[b];
      if (pc < 0) continue;
      const mag = Math.sqrt(re[b] * re[b] + im[b] * im[b]);
      chroma[pc] += mag;
    }
  }

  let sum = 0;
  for (let i = 0; i < 12; i++) sum += chroma[i];
  if (sum <= 0) return null;
  for (let i = 0; i < 12; i++) chroma[i] /= sum;

  let best = { score: -Infinity, pc: 0, mode: "major" };
  for (let pc = 0; pc < 12; pc++) {
    const maj = correlate(chroma, KS_MAJOR, pc);
    if (maj > best.score) best = { score: maj, pc, mode: "major" };
    const min = correlate(chroma, KS_MINOR, pc);
    if (min > best.score) best = { score: min, pc, mode: "minor" };
  }
  const camelot = best.mode === "major" ? MAJOR_CAMELOT[best.pc] : MINOR_CAMELOT[best.pc];
  const keyName = NOTE_NAMES[best.pc] + (best.mode === "minor" ? "m" : "");
  return { keyName, mode: best.mode, camelot };
}

function parseCamelot(c) {
  if (!c || typeof c !== "string") return null;
  const m = c.match(/^(\d{1,2})([AB])$/);
  if (!m) return null;
  return { n: parseInt(m[1], 10), l: m[2] };
}

// Harmonic (Camelot) compatibility: same key, relative major/minor, or ±1 on the wheel.
export function camelotCompatible(a, b) {
  const x = parseCamelot(a);
  const y = parseCamelot(b);
  if (!x || !y) return false;
  if (x.n === y.n && x.l === y.l) return true; // same
  if (x.n === y.n && x.l !== y.l) return true; // relative major/minor
  if (x.l === y.l) {
    const up = (x.n % 12) + 1;
    const down = ((x.n + 10) % 12) + 1;
    if (y.n === up || y.n === down) return true; // ±1 same letter
  }
  return false;
}
