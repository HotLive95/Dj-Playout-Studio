// Lightweight, offline BPM estimator (energy-flux autocorrelation).
// Best-effort — good enough to tempo-nudge two tracks into the same pocket.
export function estimateBpm(audioBuffer, { minBpm = 70, maxBpm = 180 } = {}) {
  const sr = audioBuffer.sampleRate;
  const ch = audioBuffer.numberOfChannels;
  const maxSamples = Math.min(audioBuffer.length, Math.floor(sr * 30)); // first 30s
  if (maxSamples < sr) return null;

  // Downmix to mono.
  const mono = new Float32Array(maxSamples);
  for (let c = 0; c < ch; c++) {
    const d = audioBuffer.getChannelData(c);
    for (let i = 0; i < maxSamples; i++) mono[i] += d[i] / ch;
  }

  // Energy envelope (RMS per window).
  const win = 512;
  const envLen = Math.floor(maxSamples / win);
  const env = new Float32Array(envLen);
  for (let k = 0; k < envLen; k++) {
    let s = 0;
    const start = k * win;
    for (let j = 0; j < win; j++) {
      const v = mono[start + j];
      s += v * v;
    }
    env[k] = Math.sqrt(s / win);
  }
  const envSr = sr / win; // envelope frames per second

  // Spectral-flux style onset signal (positive energy differences).
  const flux = new Float32Array(envLen);
  for (let i = 1; i < envLen; i++) {
    const d = env[i] - env[i - 1];
    flux[i] = d > 0 ? d : 0;
  }
  let mean = 0;
  for (let i = 0; i < envLen; i++) mean += flux[i];
  mean /= envLen || 1;
  for (let i = 0; i < envLen; i++) flux[i] -= mean;

  // Autocorrelate over the lag range for the given BPM window.
  const minLag = Math.max(1, Math.floor((envSr * 60) / maxBpm));
  const maxLag = Math.ceil((envSr * 60) / minBpm);
  let bestLag = minLag;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = lag; i < envLen; i++) sum += flux[i] * flux[i - lag];
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  if (best <= 0) return null;
  let bpm = (60 * envSr) / bestLag;
  while (bpm < minBpm) bpm *= 2;
  while (bpm > maxBpm) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
