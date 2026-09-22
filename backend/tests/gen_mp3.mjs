import { Mp3Encoder } from "@breezystack/lamejs";
import fs from "fs";

const sr = 44100, secs = 2, freq = 440;
const enc = new Mp3Encoder(2, sr, 128);
const frame = 1152;
const chunks = [];
const total = sr * secs;
let phase = 0;
for (let off = 0; off < total; off += frame) {
  const n = Math.min(frame, total - off);
  const l = new Int16Array(n), r = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.sin((phase++ / sr) * freq * 2 * Math.PI) * 0.25 * 32767;
    l[i] = s; r[i] = s;
  }
  const mp3 = enc.encodeBuffer(l, r);
  if (mp3.length) chunks.push(Buffer.from(mp3));
}
const rest = enc.flush();
if (rest.length) chunks.push(Buffer.from(rest));
const out = Buffer.concat(chunks);
fs.writeFileSync("/app/backend/tests/_bc_test.mp3", out);
const valid = out[0] === 0xff && (out[1] & 0xe0) === 0xe0;
console.log("MP3 bytes:", out.length, "validFrameSync:", valid);
