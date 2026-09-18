// Dependency-free, fully-offline audio tag reader. Extracts { artist, title, art }
// from an MP3's embedded ID3 tags (v2.2 / v2.3 / v2.4, plus v1 fallback) and
// falls back to parsing the filename ("Artist - Title.mp3"). Album art (APIC/PIC)
// is downscaled to a small thumbnail data URL.

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

// Read a null-terminated string from `bytes` starting at `start`. Returns the
// byte-index just past the terminator. Handles single (latin1/utf8) or double
// (utf-16) null terminators.
function skipNullTerm(bytes, start, doubleNull) {
  let i = start;
  if (doubleNull) {
    while (i + 1 < bytes.length && !(bytes[i] === 0 && bytes[i + 1] === 0)) i += 2;
    return i + 2;
  }
  while (i < bytes.length && bytes[i] !== 0) i++;
  return i + 1;
}

function parsePicture(frame, major) {
  try {
    const enc = frame[0];
    let o = 1;
    let mime = "image/jpeg";
    if (major === 2) {
      o += 3; // 3-char image format (e.g. "JPG")
    } else {
      let e = o;
      while (e < frame.length && frame[e] !== 0) e++;
      mime = new TextDecoder("iso-8859-1").decode(frame.slice(o, e)) || "image/jpeg";
      o = e + 1;
    }
    o += 1; // picture type byte
    o = skipNullTerm(frame, o, enc === 1 || enc === 2); // description
    if (o >= frame.length) return null;
    return { mime, bytes: frame.slice(o) };
  } catch {
    return null;
  }
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
    if (major === 4) pos += synchsafe(body[0], body[1], body[2], body[3]);
    else pos += 4 + ((body[0] << 24) | (body[1] << 16) | (body[2] << 8) | body[3]);
  }

  const want = major === 2 ? { title: "TT2", artist: "TP1", pic: "PIC" } : { title: "TIT2", artist: "TPE1", pic: "APIC" };
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
    const frame = body.slice(dataStart, dataStart + fsize);
    if (id === want.title) res.title = decodeText(frame.slice(1), frame[0]);
    else if (id === want.artist) res.artist = decodeText(frame.slice(1), frame[0]);
    else if (id === want.pic && !res.picture) res.picture = parsePicture(frame, major);
    pos = dataStart + fsize;
    if (res.title && res.artist && res.picture) break;
  }
  return res.title || res.artist || res.picture ? res : null;
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
      picture: v2 && v2.picture,
    };
  } catch {
    return null;
  }
}

// Downscale embedded album art to a small square-ish thumbnail data URL.
async function makeThumb(picture, size = 96) {
  if (!picture || !picture.bytes || !picture.bytes.length) return null;
  if (typeof document === "undefined") return null;
  try {
    const blob = new Blob([picture.bytes], { type: picture.mime || "image/jpeg" });
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = url;
    });
    const scale = Math.min(1, size / Math.max(img.width || size, img.height || size));
    const w = Math.max(1, Math.round((img.width || size) * scale));
    const h = Math.max(1, Math.round((img.height || size) * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    return canvas.toDataURL("image/jpeg", 0.8);
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

// Best-effort names + art: read embedded tags first, fall back to the filename.
export async function deriveNames(blob, filename = "") {
  const tags = blob ? await readAudioTags(blob) : null;
  const fromName = parseFilename(filename);
  const art = tags && tags.picture ? await makeThumb(tags.picture) : null;
  return {
    title: (tags && tags.title) || fromName.title || filename || "Untitled",
    artist: (tags && tags.artist) || fromName.artist || "",
    art: art || null,
  };
}

// Re-read only artist/title (used by "Re-read tags" bulk action).
export async function readNamesOnly(blob, filename = "") {
  const { title, artist } = await deriveNames(blob, filename);
  return { title, artist };
}
