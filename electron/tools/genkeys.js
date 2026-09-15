#!/usr/bin/env node
/*
 * Hot Live 95 — License Key Generator
 * Mint activation keys for your authorized DJs. Uses the SAME algorithm the app
 * verifies offline (must stay in sync with frontend/src/lib/license.js).
 *
 * Usage:
 *   node tools/genkeys.js          -> 1 key
 *   node tools/genkeys.js 10       -> 10 keys
 */
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
function checksum5(body) {
  const a = fnv(SECRET + "|" + body);
  const b = fnv(body + "|" + SECRET);
  return enc5((a ^ (b >>> 7)) >>> 0);
}
function generateKey() {
  let body = "";
  for (let i = 0; i < 15; i++) body += ALPHABET[Math.floor(Math.random() * 32)];
  const full = body + checksum5(body);
  return full.match(/.{1,5}/g).join("-");
}

const count = Math.max(1, parseInt(process.argv[2] || "1", 10));
for (let i = 0; i < count; i++) console.log(generateKey());
