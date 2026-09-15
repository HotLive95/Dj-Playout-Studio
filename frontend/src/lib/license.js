// Offline license-key validation for Hot Live 95 Playout Studio.
// Keys look like XXXXX-XXXXX-XXXXX-XXXXX (Crockford base32). The last group is a
// checksum derived from the first 15 chars + a secret, so keys can be verified
// fully offline. Mint keys with electron/tools/genkeys.js (same algorithm).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SECRET = "HotLive95::Detroit::AIRadio::v1::Sig";

function fnv(str) {
  let x = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    x ^= str.charCodeAt(i);
    x = Math.imul(x, 0x01000193) >>> 0;
  }
  return x >>> 0;
}

function enc5(n) {
  let s = "";
  for (let i = 0; i < 5; i++) {
    s = ALPHABET[n & 31] + s;
    n = Math.floor(n / 32);
  }
  return s;
}

export function normalizeKey(raw) {
  return String(raw || "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V")
    .replace(/[^0-9A-Z]/g, "");
}

function checksum5(body) {
  const a = fnv(SECRET + "|" + body);
  const b = fnv(body + "|" + SECRET);
  return enc5((a ^ (b >>> 7)) >>> 0);
}

export function validateKey(raw) {
  const k = normalizeKey(raw);
  if (k.length !== 20) return false;
  for (const c of k) if (!ALPHABET.includes(c)) return false;
  return checksum5(k.slice(0, 15)) === k.slice(15);
}

export function formatKey(raw) {
  const k = normalizeKey(raw).slice(0, 20);
  return (k.match(/.{1,5}/g) || [k]).join("-");
}

export function generateKey() {
  let body = "";
  for (let i = 0; i < 15; i++) body += ALPHABET[Math.floor(Math.random() * 32)];
  const full = body + checksum5(body);
  return full.match(/.{1,5}/g).join("-");
}
