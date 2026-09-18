// Dependency-free, fully-offline audio tag reader. Extracts { artist, title }
// from an MP3's embedded ID3 tags (v2.2 / v2.3 / v2.4, plus v1 fallback) and
// falls back to parsing the filename ("Artist - Title.mp3").

const synchsafe = (a, b, c, d) => (a << 21) | (b << 14) | (c << 7) | d;

function decodeText(bytes, enc) {
  const labels = { 0: "iso-8859-1", 1: "utf-16", 2: "utf-16be", 3: "utf-8" };
  const label = labels[enc] ?? "iso-8859-1";
  let s;
  try {
    s = new TextDecoder(label).decode(bytes);
  } catch {
    s = new TextDecoder("iso-8859-1").decode(bytes);
  }
  return s.replace(/\0/g, "").trim();
}

async function readV2(blob) {
  const head = new Uint8Array(await blob.slice(0, 10).arrayBuffer());
  if (!(head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33)) return null; // "ID3"
  const major = head[3];
  const flags = head[5];
  const size = synchsafe(head[6], head[7], head[8], head[9]);
  const body = new Uint8Array(await blob.slice(10, 10 + size).arrayBuffer());

  let pos = 0;
  if (flags & 0x40) {
    // Skip the (rare) extended header.
    if (major === 4) pos += synchsafe(body[0], body[1], body[2], body[3]);
    else pos += 4 + ((body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]);
  }

  const want = major === 2 ? { title: "TT2", artist: "TP1" } : { title: "TIT2", artist: "TPE1" };
  const idLen = major === 2 ? 3 : 4;
  const szLen = major === 2 ? 3 : 4;
  const flagLen = major === 2 ? 0 : 2;
  const res = {};

  while (pos + idLen + szLen + flagLen <= body.length) {
    let id = "";
    for (let i = 0; i < idLen; i++) id += String.fromCharCode(body[pos + i]);
    if (id.charCodeAt(0) === 0) break; // padding
    let fsize;
    if (major === 2) fsize = (body[pos + 3] << 16) | (body[pos + 4] << 8) | body[pos + 5];
    else if (major === 4)
      fsize = synchsafe(body[pos + 4], body[pos + 5], body[pos + 6], body[pos + 7]);
    else fsize = (body[pos + 4] << 24) | (body[pos + 5] << 16) | (body[pos + 6] << 8) | body[pos + 7];
    const dataStart = pos + idLen + szLen + flagLen;
    if (fsize <= 0 || dataStart + fsize > body.length) break;
    if (id === want.title || id === want.artist) {
      const frame = body.slice(dataStart, dataStart + fsize);
      const text = decodeText(frame.slice(1), frame[0]);
      if (id === want.title) res.title = text;
      else res.artist = text;
    }
    pos = dataStart + fsize;
    if (res.title && res.artist) break;
  }
  return res.title || res.artist ? res : null;
}

async function readV1(blob) {
  if (blob.size < 128) return null;
  const tail = new Uint8Array(await blob.slice(blob.size - 128).arrayBuffer());
  if (!(tail[0] === 0x54 && tail[1] === 0x41 && tail[2] === 0x47)) return null; // "TAG"
  const dec = new TextDecoder("iso-8859-1");
  const title = dec.decode(tail.slice(3, 33)).replace(/\0/g, "").trim();
  const artist = dec.decode(tail.slice(33, 63)).replace(/\0/g, "").trim();
  return title || artist ? { title, artist } : null;
}

export async function readAudioTags(blob) {
  if (!blob) return null;
  try {
    const v2 = await readV2(blob);
    if (v2 && v2.title && v2.artist) return v2;
    const v1 = await readV1(blob);
    return {
      title: (v2 && v2.title) || (v1 && v1.title) || "",
      artist: (v2 && v2.artist) || (v1 && v1.artist) || "",
    };
  } catch {
    return null;
  }
}

export function parseFilename(name = "") {
  const base = name.replace(/\.[^.]+$/, "").trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2 && parts[0].trim() && parts.slice(1).join(" - ").trim()) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { artist: "", title: base };
}

// Best-effort names: read embedded tags first, fall back to the filename.
export async function deriveNames(blob, filename = "") {
  const tags = blob ? await readAudioTags(blob) : null;
  const fromName = parseFilename(filename);
  return {
    title: (tags && tags.title) || fromName.title || filename || "Untitled",
    artist: (tags && tags.artist) || fromName.artist || "",
  };
}
