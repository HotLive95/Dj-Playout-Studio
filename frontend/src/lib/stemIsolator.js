// Real-time, fully-offline DSP stem isolation. Not AI source-separation — it
// uses mid/side + multiband filtering to approximate four stems that a DJ can
// mute/solo/level live, render out, or drop onto a pad. Works from a flash drive
// with no model download and zero latency.
import { bufferToWav, bufferToMp3 } from "./audioProcessing";

export const STEMS = [
  { id: "vocals", label: "Vocals", color: "#ff5a1f" },
  { id: "music", label: "Music", color: "#2ee5c4" },
  { id: "bass", label: "Bass", color: "#ffab00" },
  { id: "drums", label: "Drums", color: "#3aa0ff" },
];

// Wire `source` (a stereo node) into four isolated stem gains + a master gain.
export function buildStemGraph(ctx, source) {
  const splitter = ctx.createChannelSplitter(2);
  source.connect(splitter);

  // Mid (mono center = L+R) and Side (L−R = stereo-panned instruments).
  const mid = ctx.createGain();
  mid.gain.value = 0.5;
  splitter.connect(mid, 0);
  splitter.connect(mid, 1);

  const sideL = ctx.createGain();
  sideL.gain.value = 0.5;
  const sideR = ctx.createGain();
  sideR.gain.value = -0.5;
  splitter.connect(sideL, 0);
  splitter.connect(sideR, 1);
  const side = ctx.createGain();
  sideL.connect(side);
  sideR.connect(side);

  const band = (input, type, freq, q) => {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    input.connect(f);
    return f;
  };

  // Vocals — center energy in the vocal band.
  const vHp = band(mid, "highpass", 180);
  const vLp = band(vHp, "lowpass", 6500);
  const vocals = ctx.createGain();
  vLp.connect(vocals);

  // Bass — center low end.
  const bLp = band(mid, "lowpass", 180);
  const bass = ctx.createGain();
  bLp.connect(bass);

  // Drums / percussion — center highs (hats, snare crack, transients).
  const dHp = band(mid, "highpass", 6500);
  const drums = ctx.createGain();
  dHp.connect(drums);

  // Music / other — stereo-panned instrumentation.
  const music = ctx.createGain();
  side.connect(music);

  const master = ctx.createGain();
  master.gain.value = 1;
  vocals.connect(master);
  bass.connect(master);
  drums.connect(master);
  music.connect(master);

  return { gains: { vocals, bass, drums, music }, master };
}

// Render a single isolated stem of a decoded buffer to a WAV/MP3 blob (offline).
export async function renderStem(buffer, stemId, { format = "wav", onProgress } = {}) {
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, buffer.length, buffer.sampleRate);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const { gains, master } = buildStemGraph(ctx, src);
  Object.keys(gains).forEach((id) => {
    gains[id].gain.value = id === stemId ? 1 : 0;
  });
  master.connect(ctx.destination);
  src.start(0);
  const rendered = await ctx.startRendering();
  if (format === "mp3") return bufferToMp3(rendered, 192, onProgress);
  return bufferToWav(rendered);
}
