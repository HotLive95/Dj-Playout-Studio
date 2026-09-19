// Shared, fully-offline playlist renderer used by the single-playlist Save modal
// and the Batch Export modal. Decodes each track (honouring In/Out cues), lays
// them on a timeline (optionally crossfaded), renders via OfflineAudioContext,
// and encodes to MP3/WAV. Unreadable tracks are skipped and reported.
import { decodeToBuffer, bufferToWav, bufferToMp3 } from "./audioProcessing";
import { platform } from "./platform";

const noop = () => {};

export function datedFilename(name, ext) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  const safe = (name || "playlist").replace(/[^a-z0-9\-_ ]/gi, "").trim() || "playlist";
  return `${safe} ${stamp}.${ext}`;
}

export function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function exportPlaylistToBlob({
  items,
  format = "mp3",
  crossfade = false,
  crossfadeSeconds = 3,
  onProgress = noop,
  onStatus = noop,
}) {
  const targetSR = 44100;
  const decoded = [];
  const skipped = [];
  for (let i = 0; i < items.length; i++) {
    onStatus(`Decoding ${i + 1}/${items.length} · ${items[i].name}`);
    onProgress(Math.round(((i + 0.5) / items.length) * 55));
    let buf;
    try {
      // eslint-disable-next-line no-await-in-loop
      const url = await platform.getUrl(items[i]);
      // eslint-disable-next-line no-await-in-loop
      buf = await decodeToBuffer(url);
    } catch {
      skipped.push(items[i].name);
      continue;
    }
    const dur0 = Number.isFinite(buf.duration) ? buf.duration : 0;
    if (dur0 <= 0) {
      skipped.push(items[i].name);
      continue;
    }
    // Clamp In/Out to the REAL decoded length — a stored cueOut/duration can be
    // corrupt (e.g. wrong units), which otherwise blows up the render length.
    let inP = items[i].cueIn != null ? Math.max(0, items[i].cueIn) : 0;
    let outP = items[i].cueOut != null ? items[i].cueOut : dur0;
    inP = Math.min(inP, Math.max(0, dur0 - 0.05));
    outP = Math.min(Math.max(inP + 0.05, outP), dur0);
    const dur = outP - inP;
    if (!Number.isFinite(dur) || dur <= 0) {
      skipped.push(items[i].name);
      continue;
    }
    decoded.push({ buf, offset: inP, dur });
  }

  if (decoded.length === 0) {
    const err = new Error(
      "None of these tracks could be read — their audio files aren't available on this device. Re-import the files into the playlist, then try again."
    );
    err.skipped = skipped;
    throw err;
  }

  const n = decoded.length;
  const durs = decoded.map((d) => d.dur);
  const xf = crossfade ? Math.max(0, crossfadeSeconds) : 0;
  const starts = [0];
  for (let i = 1; i < n; i++) {
    const gap = Math.min(xf, durs[i - 1] / 2, durs[i] / 2);
    starts[i] = starts[i - 1] + durs[i - 1] - gap;
  }
  const totalSec = starts[n - 1] + durs[n - 1];

  // Guard against an impossible render length (corrupt data or too-long export).
  const MAX_SEC = 6 * 3600; // 6 hours
  if (!Number.isFinite(totalSec) || totalSec <= 0) {
    throw new Error("Couldn't work out the length of this mix — one or more tracks reported an invalid duration. Re-import the affected files and try again.");
  }
  if (totalSec > MAX_SEC) {
    throw new Error(
      `This export is too long to render in one file (${Math.round(totalSec / 60)} min). Split the playlist into smaller parts and export again.`
    );
  }

  onStatus(`Rendering ${Math.round(totalSec)}s of audio…`);
  onProgress(60);

  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const frames = Math.max(1, Math.ceil(totalSec * targetSR));
  let oac;
  try {
    oac = new OAC(2, frames, targetSR);
  } catch (e) {
    throw new Error(
      "This mix is too large to render in the browser. Try exporting fewer tracks at a time."
    );
  }
  for (let i = 0; i < n; i++) {
    const d = decoded[i];
    const startAt = starts[i];
    const endAt = startAt + d.dur;
    const fadeIn = i > 0 ? starts[i - 1] + durs[i - 1] - startAt : 0;
    const fadeOut = i < n - 1 ? endAt - starts[i + 1] : 0;
    const src = oac.createBufferSource();
    src.buffer = d.buf;
    const g = oac.createGain();
    src.connect(g);
    g.connect(oac.destination);
    g.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : 1, startAt);
    if (fadeIn > 0) g.gain.linearRampToValueAtTime(1, startAt + fadeIn);
    if (fadeOut > 0) {
      g.gain.setValueAtTime(1, Math.max(startAt, endAt - fadeOut));
      g.gain.linearRampToValueAtTime(0.0001, endAt);
    }
    src.start(startAt, d.offset, d.dur);
  }
  const rendered = await oac.startRendering();

  onStatus(`Encoding ${format.toUpperCase()}…`);
  onProgress(70);
  await new Promise((r) => setTimeout(r, 30));
  const blob =
    format === "mp3"
      ? await bufferToMp3(rendered, 192, (p) => onProgress(70 + Math.round(p * 29)))
      : bufferToWav(rendered);
  onProgress(100);
  return { blob, skipped, decodedCount: n, totalCount: items.length };
}
