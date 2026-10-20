/* ==========================================================================
   NoteCrypto — تجزئة كلمات المرور
   يفضّل PBKDF2 عبر Web Crypto، ويستخدم SHA-256 نقياً كبديل آمن
   ========================================================================== */
(function (global) {
  'use strict';

  const enc = new TextEncoder();

  /* ---------- أدوات ---------- */
  function toHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
  }

  function fromHex(hex) {
    const clean = hex.trim();
    const out = new Uint8Array(clean.length >> 1);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }

  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function xor(a, b) {
    const out = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
    return out;
  }

  function randomBytes(len) {
    const out = new Uint8Array(len);
    (global.crypto && global.crypto.getRandomValues)
      ? global.crypto.getRandomValues(out)
      : (function () {                       // بديل في حال عدم توفر الكريبتو
        for (let i = 0; i < len; i++) out[i] = Math.floor(Math.random() * 256);
      })();
    return out;
  }

  /* ---------- SHA-256 نقي (fallback) ---------- */
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ]);

  function rotr(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }

  function sha256(msg) {
    let H = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
    ]);

    const ml = msg.length;
    const total = Math.ceil((ml + 9) / 64) * 64;
    const buf = new Uint8Array(total);
    buf.set(msg);
    buf[ml] = 0x80;

    const dv = new DataView(buf.buffer);
    dv.setUint32(total - 8, Math.floor(ml / 0x20000000), false);
    dv.setUint32(total - 4, (ml << 3) >>> 0, false);

    const w = new Uint32Array(64);
    for (let i = 0; i < total; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4, false);
      for (let t = 16; t < 64; t++) {
        const x = w[t - 15], y = w[t - 2];
        const s0 = (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) >>> 0;
        const s1 = (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10)) >>> 0;
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (let t = 0; t < 64; t++) {
        const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
        const ch = ((e & f) ^ (~e & g)) >>> 0;
        const t1 = (h + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
        const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
        const t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    for (let i = 0; i < 8; i++) odv.setUint32(i * 4, H[i], false);
    return out;
  }

  function sha256Hex(str) { return toHex(sha256(enc.encode(str))); }

  /* ---------- الواجهة العامة ---------- */
  function hasSubtle() {
    return !!(global.crypto && global.crypto.subtle && typeof global.crypto.subtle.deriveBits === 'function');
  }

  const ITERATIONS = 210000;   // Web Crypto
  const FALLBACK_ITERATIONS = 60000;

  /**
   * اشتقاق التجزئة.
   * @param {string} password  كلمة المرور
   * @param {string} saltHex   الملح (hex)
   * @param {string} [algo]    الخوارزمية المستخدمة عند الإنشاء (للثبات)
   */
  async function derive(password, saltHex, algo) {
    const salt = fromHex(saltHex);
    const useSubtle = hasSubtle() && algo !== 'sha256-iter';

    if (useSubtle) {
      const keyMaterial = await global.crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
      );
      const bits = await global.crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt: salt, iterations: ITERATIONS, hash: 'SHA-256' },
        keyMaterial, 256
      );
      return { hash: toHex(new Uint8Array(bits)), algo: 'pbkdf2-sha256', iterations: ITERATIONS };
    }

    // البديل: SHA-256 متكرر
    let block = sha256(concat(salt, enc.encode(password)));
    let acc = block;
    for (let i = 1; i < FALLBACK_ITERATIONS; i++) {
      block = sha256(block);
      acc = xor(acc, block);
    }
    return { hash: toHex(acc), algo: 'sha256-iter', iterations: FALLBACK_ITERATIONS };
  }

  function makeSalt() { return toHex(randomBytes(16)); }

  /** يقارن كلمتي مرور دون كشف معلومات التوقيت */
  function safeEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  /** تقدير قوة كلمة المرور 0..4 */
  function strengthOf(password) {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    if (password.length < 6) score = Math.min(score, 1);
    return Math.min(score, 4);
  }

  global.NoteCrypto = {
    derive,
    makeSalt,
    safeEqual,
    strengthOf,
    sha256Hex,
    toHex,
    fromHex,
    hasSubtle
  };
})(window);
