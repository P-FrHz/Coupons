/*
 * مولّد QR مدمج (بدون أي مكتبة خارجية) — بايت مود، تصحيح أخطاء M، إصدارات 1 إلى 10.
 * يكفي لروابط حتى ~210 حرف. يوفّر واجهة QRCode.toCanvas(canvas, text, opts, cb).
 */
(function () {
  'use strict';

  /* ---------- حقل غالوا GF(256) و Reed–Solomon ---------- */
  const EXP = new Array(512), LOG = new Array(256);
  (function () {
    let x = 1;
    for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
    for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  function generator(deg) {
    let g = [1];
    for (let i = 0; i < deg; i++) {
      const ng = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) { ng[j] ^= g[j]; ng[j + 1] ^= mul(g[j], EXP[i]); }
      g = ng;
    }
    return g;
  }
  function rsRemainder(data, ecLen) {
    const gen = generator(ecLen), res = new Array(ecLen).fill(0);
    for (const b of data) {
      const f = b ^ res.shift(); res.push(0);
      for (let i = 0; i < ecLen; i++) res[i] ^= mul(gen[i + 1], f);
    }
    return res;
  }

  /* ---------- جداول مستوى التصحيح M ----------
     [إجمالي الكلمات، كلمات تصحيح لكل كتلة، كتل المجموعة1، بيانات/كتلة، كتل المجموعة2، بيانات/كتلة] */
  const VER = {
    1: [26, 10, 1, 16, 0, 0], 2: [44, 16, 1, 28, 0, 0], 3: [70, 26, 1, 44, 0, 0], 4: [100, 18, 2, 32, 0, 0],
    5: [134, 24, 2, 43, 0, 0], 6: [172, 16, 4, 27, 0, 0], 7: [196, 18, 4, 31, 0, 0], 8: [242, 22, 2, 38, 2, 39],
    9: [292, 22, 3, 36, 2, 37], 10: [346, 26, 4, 43, 1, 44]
  };
  const ALIGN = { 1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
  const dataCap = v => { const t = VER[v]; return t[2] * t[3] + t[4] * t[5]; };

  function utf8(str) {
    return Array.from(new TextEncoder().encode(String(str)));
  }

  /* ---------- ترميز البيانات ---------- */
  function encode(text) {
    const bytes = utf8(text);
    let v = 0;
    for (let i = 1; i <= 10; i++) {
      const ccBits = i <= 9 ? 8 : 16;
      if (4 + ccBits + bytes.length * 8 <= dataCap(i) * 8) { v = i; break; }
    }
    if (!v) throw new Error('النص طويل جداً لرمز QR');
    const bits = [];
    const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4);
    put(bytes.length, v <= 9 ? 8 : 16);
    bytes.forEach(b => put(b, 8));
    const capBits = dataCap(v) * 8;
    put(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j]; data.push(b); }
    for (let pad = 0xEC; data.length < dataCap(v); pad ^= 0xEC ^ 0x11) data.push(pad);

    // تقسيم لكتل + حساب التصحيح + دمج متبادل
    const t = VER[v], ecLen = t[1], blocks = [];
    let k = 0;
    for (let g = 0; g < 2; g++) {
      const n = t[2 + g * 2], len = t[3 + g * 2];
      for (let i = 0; i < n; i++) { const d = data.slice(k, k + len); k += len; blocks.push({ d, e: rsRemainder(d, ecLen) }); }
    }
    const out = [], maxLen = Math.max.apply(null, blocks.map(b => b.d.length));
    for (let i = 0; i < maxLen; i++) blocks.forEach(b => { if (i < b.d.length) out.push(b.d[i]); });
    for (let i = 0; i < ecLen; i++) blocks.forEach(b => out.push(b.e[i]));
    return { v, codewords: out };
  }

  /* ---------- بناء المصفوفة ---------- */
  function build(text, forceMask) {
    const enc = encode(text), v = enc.v, size = 17 + 4 * v;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fn = Array.from({ length: size }, () => new Array(size).fill(false));
    const setFn = (x, y, dark) => { if (x >= 0 && x < size && y >= 0 && y < size) { mod[y][x] = dark; fn[y][x] = true; } };
    const bit = (n, i) => ((n >>> i) & 1) !== 0;

    // التوقيت
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    // الباحثات
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    // المحاذاة
    const pos = ALIGN[v], last = pos.length - 1;
    for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++)
        setFn(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    // حجز مناطق الصيغة (تُكتب لاحقاً)
    const drawFormat = mask => {
      const data = (0 << 3) | mask;                 // مستوى M = 00
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const bits = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(bits, i));
      setFn(8, 7, bit(bits, 6)); setFn(8, 8, bit(bits, 7)); setFn(7, 8, bit(bits, 8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(bits, i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(bits, i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(bits, i));
      setFn(8, size - 8, true);
    };
    drawFormat(0);
    // معلومات الإصدار
    if (v >= 7) {
      let rem = v;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bits = (v << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const c = bit(bits, i), a = size - 11 + (i % 3), b = Math.floor(i / 3);
        setFn(a, b, c); setFn(b, a, c);
      }
    }
    // وضع البيانات بشكل متعرّج
    const data = enc.codewords;
    let idx = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && idx < data.length * 8) { mod[y][x] = bit(data[idx >>> 3], 7 - (idx & 7)); idx++; }
      }
    }

    // الأقنعة
    const applyMask = m => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        let inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
        }
        if (!fn[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    };
    const penalty = () => {
      let r = 0;
      const lines = [];
      for (let y = 0; y < size; y++) lines.push(mod[y].slice());
      for (let x = 0; x < size; x++) lines.push(mod.map(row => row[x]));
      const P1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], P2 = P1.slice().reverse();
      lines.forEach(L => {
        let run = 1;
        for (let i = 1; i <= size; i++) {
          if (i < size && L[i] === L[i - 1]) run++;
          else { if (run >= 5) r += 3 + (run - 5); run = 1; }
        }
        for (let i = 0; i + 11 <= size; i++) {
          let a = true, b = true;
          for (let k = 0; k < 11; k++) { const val = L[i + k] ? 1 : 0; if (val !== P1[k]) a = false; if (val !== P2[k]) b = false; }
          if (a) r += 40; if (b) r += 40;
        }
      });
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) r += 3;
      }
      let dark = 0; mod.forEach(row => row.forEach(c => { if (c) dark++; }));
      const total = size * size;
      r += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return r;
    };
    let best = 0, bestScore = Infinity;
    for (let m = 0; m < 8; m++) {
      if (forceMask != null && m !== forceMask) continue;
      applyMask(m); drawFormat(m);
      const s = penalty();
      if (s < bestScore) { bestScore = s; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { size, mod };
  }

  /* ---------- الرسم ---------- */
  function toCanvas(canvas, text, opts, cb) {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    opts = opts || {};
    const p = new Promise((resolve, reject) => {
      try {
        const qr = build(text);
        const margin = opts.margin == null ? 4 : opts.margin;
        const width = opts.width || 256;
        const color = opts.color || {};
        const total = qr.size + margin * 2;
        const cell = Math.max(1, Math.floor(width / total));   // مربعات بأحجام صحيحة = مسح أدق
        const px = cell * total;
        canvas.width = px; canvas.height = px;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color.light || '#ffffff'; ctx.fillRect(0, 0, px, px);
        ctx.fillStyle = color.dark || '#000000';
        for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) {
          if (qr.mod[y][x]) ctx.fillRect((x + margin) * cell, (y + margin) * cell, cell, cell);
        }
        resolve(canvas);
      } catch (e) { reject(e); }
    });
    if (typeof cb === 'function') p.then(c => cb(null, c), e => cb(e));
    return p;
  }

  window.QRCode = { toCanvas: toCanvas, _build: build };
})();
