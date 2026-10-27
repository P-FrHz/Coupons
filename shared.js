(function () {
  const CFG = window.APP_CONFIG || {};
  const configured = !!CFG.SUPABASE_URL && !!CFG.SUPABASE_ANON_KEY &&
    !/YOUR/i.test(CFG.SUPABASE_URL) && !/YOUR/i.test(CFG.SUPABASE_ANON_KEY);

  /* ---------- الاتصال بقاعدة البيانات ---------- */
  async function rpc(fn, args) {
    if (!configured) throw new Error('not_configured');
    let r;
    try {
      // ينظّف الرابط: يشيل المسافات و / الأخيرة وأي /rest/v1 زائدة
      const base = String(CFG.SUPABASE_URL).trim().replace(/\/+$/, '').replace(/\/rest\/v1$/, '').replace(/\/+$/, '');
      r = await fetch(base + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        headers: { apikey: String(CFG.SUPABASE_ANON_KEY).trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify(args || {})
      });
    } catch (e) { throw new Error('network'); }
    let j = null;
    try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && (j.message || j.error)) || 'server_' + r.status);
    return j;
  }

  /* ---------- أدوات ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtCode = c => String(c || '').toUpperCase().match(/.{1,4}/g)?.join('-') || '';
  const LOC = 'ar-SA-u-ca-gregory-nu-latn';
  const fmtDate = d => d ? new Date(d).toLocaleDateString(LOC, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const fmtDateTime = d => d ? new Date(d).toLocaleString(LOC, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
  function couponLink(code, base) {
    base = base || CFG.PUBLIC_BASE_URL || new URL('./', location.href).href;
    return base + '?c=' + code;
  }
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.innerHTML = '<span>' + esc(msg) + '</span>';
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 2200);
  }

  /* ---------- الثيم ---------- */
  const FONTS = {
    'Tajawal': 'Tajawal:wght@400;500;700;800',
    'Cairo': 'Cairo:wght@400;600;700;800',
    'Almarai': 'Almarai:wght@400;700;800',
    'IBM Plex Sans Arabic': 'IBM+Plex+Sans+Arabic:wght@400;500;700'
  };
  const DEFAULT_THEME = {
    brand: 'اسم المحل', emoji: '☕', logo: '',
    offer_title: 'قهوة مجانية',
    offer_sub: 'هدية على حسابنا، نتشرف بزيارتك',
    terms: 'الكوبون يُستخدم مرة واحدة فقط\nأظهر الكود للكاشير عند الطلب\nالعرض لفترة محدودة وحتى نفاد الكمية',
    color: '#7c4a21', color2: '#d99a5b', mode: 'light', font: 'Tajawal',
    badge: 'هدية',
    pdf_msg: 'هلا 👋\nهديتك من {brand}: {offer}\nالكوبون مرفق، أظهره للكاشير عند الطلب 🎁',
    issuer_name: '', issuer_prefix: 'هدية مقدّمة من', partner_prefix: 'يُستلم لدى',
    map_url: '', map_label: '📍 موقع المحل على الخريطة', show_code: false,
    scan_hint: 'أظهر هذا الكود للكاشير',
    expiry_label: 'صالح حتى',
    share_msg: 'هلا 👋\nهديتك من {brand}: {offer}\nافتح الرابط وأظهره للكاشير:\n{link}'
  };
  function loadFont(name) {
    if (!FONTS[name]) return;
    const id = 'font-' + name.replace(/\W/g, '');
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=' + FONTS[name] + '&display=swap';
    document.head.appendChild(l);
  }
  const hexToRgb = h => {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    const n = parseInt(h, 16);
    return isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const lum = h => {
    const [r, g, b] = hexToRgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * r + .7152 * g + .0722 * b;
  };
  const onColor = (a, b) => ((lum(a) + lum(b)) / 2 > .5 ? '#1c1917' : '#ffffff');

  function applyTheme(theme, el) {
    el = el || document.documentElement;
    const t = Object.assign({}, DEFAULT_THEME, theme || {});
    let mode = t.mode;
    if (mode === 'auto') mode = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    el.setAttribute('data-mode', mode === 'dark' ? 'dark' : 'light');
    el.style.setProperty('--brand', t.color);
    el.style.setProperty('--brand2', t.color2);
    el.style.setProperty('--on-brand', onColor(t.color, t.color2));
    const font = FONTS[t.font] ? t.font : 'Tajawal';
    el.style.setProperty('--font', "'" + font + "', system-ui, -apple-system, 'Segoe UI', sans-serif");
    loadFont(font);
    return t;
  }

  const safeUrl = u => { u = String(u || '').trim(); return /^https?:\/\//i.test(u) ? u : ''; };

  /* ---------- رسم الكوبون ---------- */
  const DEAD = {
    redeemed: ['تم استخدام هذا الكوبون', 'تم استخدامه'],
    expired: ['انتهت صلاحية الكوبون', 'منتهي'],
    exhausted: ['انتهى العرض', 'نفدت الكمية'],
    inactive: ['العرض غير متاح حالياً', 'متوقف'],
    invalid: ['رابط غير صحيح', 'غير صالح']
  };

  function renderCoupon(el, d, opts) {
    opts = opts || {};
    const t = Object.assign({}, DEFAULT_THEME, d.theme || {});
    const st = d.status || 'valid';
    const dead = st !== 'valid';
    const logo = t.logo ? '<img src="' + esc(t.logo) + '" alt="">' : esc(t.emoji || '🎁');
    const terms = String(t.terms || '').split('\n').map(s => s.trim()).filter(Boolean)
      .map(s => '<li>' + esc(s) + '</li>').join('');

    let foot = '';
    if (!dead) {
      if (opts.qr === false) {
        foot = '<div class="okbox"><div class="tick">✓</div><b>كوبون صالح</b></div>' +
          (d.expires_at ? '<div class="meta">' + esc(t.expiry_label) + ' ' + esc(fmtDate(d.expires_at)) + '</div>' : '');
      } else {
        foot = '<div class="qr"><canvas></canvas></div>' +
          (t.show_code ? '<div class="code">' + esc(fmtCode(d.code)) + '</div>' : '') +
          (t.scan_hint ? '<div class="hint-scan">' + esc(t.scan_hint) + '</div>' : '') +
          (d.expires_at ? '<div class="meta">' + esc(t.expiry_label) + ' ' + esc(fmtDate(d.expires_at)) + '</div>' : '');
      }
    } else {
      const m = DEAD[st] || DEAD.invalid;
      let extra = '';
      if (st === 'redeemed' && d.redeemed_at) extra = '<div class="meta">بتاريخ ' + esc(fmtDateTime(d.redeemed_at)) + '</div>';
      if (st === 'exhausted') extra = '<div class="meta">وصلنا للعدد المحدد للعرض، شكراً لاهتمامك 🤍</div>';
      if (st === 'expired' && d.expires_at) extra = '<div class="meta">انتهى في ' + esc(fmtDate(d.expires_at)) + '</div>';
      foot = '<div class="stamp ' + (st === 'redeemed' ? '' : 'soft') + '"><span>' + esc(m[1]) + '</span></div>' +
        '<div class="hint-scan"><b>' + esc(m[0]) + '</b></div>' + extra;
    }

    const issuer = !!String(t.issuer_name || '').trim();
    const mapUrl = safeUrl(t.map_url);
    let partner = '';
    if ((issuer || mapUrl) && opts.qr !== false) {
      partner = '<div class="partner">' +
        (issuer ? '<div class="p-lbl">' + esc(t.partner_prefix) + '</div><div class="p-name">' + esc(t.brand) + '</div>' : '') +
        (mapUrl ? '<a class="p-map" href="' + esc(mapUrl) + '" target="_blank" rel="noopener">' + esc(t.map_label) + '</a>' : '') +
        '</div>';
    }
    el.innerHTML =
      '<div class="ticket' + (dead ? ' dead' : '') + '">' +
        '<div class="t-head">' +
          (t.badge ? '<span class="pill">' + esc(t.badge) + '</span>' : '') +
          '<div class="logo">' + logo + '</div>' +
          (issuer ? '<div class="by">' + esc(t.issuer_prefix) + '</div><div class="brand big">' + esc(t.issuer_name) + '</div>'
                  : '<div class="brand">' + esc(t.brand) + '</div>') +
        '</div>' +
        '<div class="t-body">' +
          '<h1 class="offer">' + esc(t.offer_title) + '</h1>' +
          (t.offer_sub ? '<p class="sub">' + esc(t.offer_sub) + '</p>' : '') +
          partner +
        '</div>' +
        '<div class="sep"></div>' +
        '<div class="t-foot">' + foot + '</div>' +
      '</div>' +
      (terms ? '<ul class="terms">' + terms + '</ul>' : '');

    const cv = el.querySelector('canvas');
    if (cv) {
      const text = opts.qrText || d.code || '';
      if (window.QRCode) {
        QRCode.toCanvas(cv, text, { width: 400, margin: 2, errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' } }, () => {});
      } else {
        cv.parentElement.innerHTML = '<div class="meta" style="max-width:200px;word-break:break-all">' + esc(text) + '</div>';
      }
    }
  }

  /* ---------- ZIP بسيط بدون ضغط (للـPNG) — بدون أي مكتبة خارجية ---------- */
  const CRC_T = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {   // files: [{name, data: Uint8Array}]
    const enc = new TextEncoder(), parts = [], central = [];
    const u16 = n => [n & 255, (n >> 8) & 255];
    const u32 = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    let offset = 0;
    files.forEach(f => {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
      parts.push(local, name, f.data);
      central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += local.length + name.length + size;
    });
    const cdSize = central.reduce((s, p) => s + p.length, 0);
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
    return new Blob(parts.concat(central, [end]), { type: 'application/zip' });
  }


  /* ---------- الكوبون كصورة ثم PDF (بدون أي رابط ظاهر) ---------- */
  async function couponImage(theme, d, qrText) {
    const t = Object.assign({}, DEFAULT_THEME, theme || {});
    const P = t.mode === 'dark'
      ? { bg: '#12100e', card: '#1e1b18', ink: '#f6f2ed', muted: '#a8a29e', line: '#34302b' }
      : { bg: '#f5f2ee', card: '#ffffff', ink: '#1c1917', muted: '#78716c', line: '#e7e2dc' };
    const on = onColor(t.color, t.color2);
    const font = FONTS[t.font] ? t.font : 'Tajawal';
    loadFont(font);
    const FF = '"' + font + '", Tajawal, "Segoe UI", system-ui, sans-serif';
    try {
      await Promise.all(['800 60px', '700 40px', '500 40px', '400 34px'].map(f => document.fonts.load(f + ' "' + font + '"', 'ابجد')));
    } catch (e) {}
    let logoImg = null;
    if (t.logo) logoImg = await new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = t.logo; });
    const qc = document.createElement('canvas');
    await window.QRCode.toCanvas(qc, qrText, { width: 440, margin: 2, color: { dark: '#0f172a', light: '#ffffff' } });

    const W = 1080, M = 60, CW = W - 2 * M, cx = W / 2, links = [];
    const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
    const wrap = (c, text, maxW) => {
      const words = String(text).split(/\s+/).filter(Boolean), lines = []; let cur = '';
      words.forEach(w => { const test = cur ? cur + ' ' + w : w; if (c.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; } else cur = test; });
      if (cur) lines.push(cur); return lines;
    };
    const fitSize = (c, text, weight, size, maxW) => { let s = size; c.font = weight + ' ' + s + 'px ' + FF; while (c.measureText(text).width > maxW && s > 26) { s -= 2; c.font = weight + ' ' + s + 'px ' + FF; } };

    function draw(c, H) {
      c.direction = 'rtl'; c.textBaseline = 'alphabetic';
      c.fillStyle = P.bg; c.fillRect(0, 0, W, H);
      c.save(); c.shadowColor = 'rgba(0,0,0,.18)'; c.shadowBlur = 50; c.shadowOffsetY = 20; c.fillStyle = P.card;
      rr(c, M, M, CW, H - 2 * M, 64); c.fill(); c.restore();
      const issuer = !!String(t.issuer_name || '').trim(), mapUrl = safeUrl(t.map_url);
      const hh = issuer ? 540 : 470;
      c.save(); rr(c, M, M, CW, H - 2 * M, 64); c.clip();
      const g = c.createLinearGradient(M, M, W - M, M + hh); g.addColorStop(0, t.color); g.addColorStop(1, t.color2);
      c.fillStyle = g; c.fillRect(M, M, CW, hh); c.restore();
      if (t.badge) {
        c.font = '700 32px ' + FF; const bw = c.measureText(t.badge).width + 56;
        c.fillStyle = 'rgba(255,255,255,.24)'; rr(c, M + 40, M + 40, bw, 62, 31); c.fill();
        c.fillStyle = on; c.textAlign = 'center'; c.fillText(t.badge, M + 40 + bw / 2, M + 40 + 43);
      }
      const cy = M + (issuer ? 185 : 200), R = 104;
      c.save(); c.shadowColor = 'rgba(0,0,0,.3)'; c.shadowBlur = 30; c.shadowOffsetY = 12; c.fillStyle = '#fff';
      c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill(); c.restore();
      if (logoImg) {
        c.save(); c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
        const sc = Math.max(2 * R / logoImg.width, 2 * R / logoImg.height), lw = logoImg.width * sc, lh = logoImg.height * sc;
        c.drawImage(logoImg, cx - lw / 2, cy - lh / 2, lw, lh); c.restore();
      } else {
        c.font = '104px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#000'; c.fillText(t.emoji || '🎁', cx, cy + 6); c.textBaseline = 'alphabetic';
      }
      c.fillStyle = on; c.textAlign = 'center';
      if (issuer) {
        c.globalAlpha = 0.9; c.font = '500 34px ' + FF; c.fillText(t.issuer_prefix, cx, M + 372); c.globalAlpha = 1;
        fitSize(c, t.issuer_name, 800, 70, CW - 100); c.fillText(t.issuer_name, cx, M + 450);
      } else { fitSize(c, t.brand, 700, 58, CW - 100); c.fillText(t.brand, cx, M + 400); }
      let y = M + hh + 135;
      c.fillStyle = P.ink; c.font = '800 92px ' + FF;
      wrap(c, t.offer_title, CW - 120).forEach(l => { c.fillText(l, cx, y); y += 112; });
      if (t.offer_sub) { y -= 10; c.fillStyle = P.muted; c.font = '500 42px ' + FF; wrap(c, t.offer_sub, CW - 140).forEach(l => { c.fillText(l, cx, y); y += 66; }); }
      if (issuer || mapUrl) {
        y += 20; const bw2 = CW - 140, bx2 = (W - bw2) / 2, top = y;
        const btnH = 88, boxH = 34 + (issuer ? 36 + 62 + 44 : 0) + (mapUrl ? btnH + 40 : 0);
        c.fillStyle = P.bg; rr(c, bx2, top, bw2, boxH, 36); c.fill(); c.strokeStyle = P.line; c.lineWidth = 2; c.stroke();
        let cy2 = top + 34;
        if (issuer) {
          c.textAlign = 'center'; c.fillStyle = P.muted; c.font = '500 34px ' + FF; cy2 += 36; c.fillText(t.partner_prefix, cx, cy2);
          c.fillStyle = P.ink; fitSize(c, t.brand, 800, 52, bw2 - 60); cy2 += 62; c.fillText(t.brand, cx, cy2); cy2 += 44;
        }
        if (mapUrl) {
          c.font = '700 36px ' + FF; const lw = Math.min(bw2 - 60, c.measureText(t.map_label).width + 90), lx = (W - lw) / 2;
          const g2 = c.createLinearGradient(lx, cy2, lx + lw, cy2); g2.addColorStop(0, t.color); g2.addColorStop(1, t.color2);
          c.fillStyle = g2; rr(c, lx, cy2, lw, btnH, 28); c.fill();
          c.fillStyle = on; c.textAlign = 'center'; c.fillText(t.map_label, cx, cy2 + 58);
          links.push({ x: lx, y: cy2, w: lw, h: btnH, url: mapUrl });
        }
        y = top + boxH + 24;
      }
      y += 30;
      c.save(); c.strokeStyle = P.line; c.lineWidth = 4; c.setLineDash([18, 14]); c.beginPath(); c.moveTo(M + 50, y); c.lineTo(W - M - 50, y); c.stroke(); c.restore();
      c.fillStyle = P.bg; c.beginPath(); c.arc(M, y, 30, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(W - M, y, 30, 0, Math.PI * 2); c.fill();
      y += 70;
      const bx = (W - 500) / 2;
      c.fillStyle = '#fff'; rr(c, bx, y, 500, 500, 44); c.fill(); c.strokeStyle = P.line; c.lineWidth = 3; c.stroke();
      c.imageSmoothingEnabled = false; c.drawImage(qc, Math.round(bx + (500 - qc.width) / 2), Math.round(y + (500 - qc.height) / 2)); c.imageSmoothingEnabled = true;
      y += 500 + 70;
      if (t.show_code) {
        c.fillStyle = P.ink; c.font = '600 38px ui-monospace, Menlo, Consolas, monospace'; c.direction = 'ltr'; c.textAlign = 'center';
        c.fillText(fmtCode(d.code), cx, y); c.direction = 'rtl';
      } else { y -= 30; }
      if (t.scan_hint) { c.textAlign = 'center'; c.fillStyle = P.muted; c.font = '500 40px ' + FF; y += 20; wrap(c, t.scan_hint, CW - 140).forEach(l => { y += 58; c.fillText(l, cx, y); }); }
      if (d.expires_at) { c.fillStyle = P.muted; c.font = '500 38px ' + FF; y += 60; c.fillText(t.expiry_label + ' ' + fmtDate(d.expires_at), cx, y); }
      const terms = String(t.terms || '').split('\n').map(x => x.trim()).filter(Boolean);
      if (terms.length) {
        y += 70; c.strokeStyle = P.line; c.lineWidth = 2; c.beginPath(); c.moveTo(M + 60, y); c.lineTo(W - M - 60, y); c.stroke(); y += 24;
        c.font = '400 34px ' + FF; c.fillStyle = P.muted; c.textAlign = 'right';
        terms.forEach(tx => wrap(c, tx, CW - 200).forEach((l, i) => { y += 52; if (i === 0) c.fillText('•', W - M - 60, y); c.fillText(l, W - M - 100, y); }));
      }
      return y + 70;
    }
    const probe = document.createElement('canvas'); probe.width = W; probe.height = 4000;
    const H = Math.ceil(draw(probe.getContext('2d'), 4000) + M);
    links.length = 0;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    draw(cv.getContext('2d'), H);
    cv.links = links.slice();
    return cv;
  }

  function makePdf(pages) {   // pages: [{jpeg, w, h, pw, ph, links:[{x,y,w,h,url}] بإحداثيات الصورة}]
    const enc = new TextEncoder(), chunks = [], offs = []; let pos = 0;
    const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; chunks.push(b); pos += b.length; };
    const obj = (num, body) => { offs[num] = pos; push(num + ' 0 obj\n' + body + '\nendobj\n'); };
    const pstr = u => '(' + encodeURI(u).replace(/[\\()]/g, m => '\\' + m) + ')';
    push('%PDF-1.4\n%âãÏÓ\n');
    // ترقيم الكائنات: 1 فهرس، 2 الصفحات، ثم لكل صفحة: صفحة، محتوى، صورة، ثم الروابط
    let next = 3; const plan = pages.map(p => { const o = { pn: next++, cn: next++, im: next++, an: [] }; (p.links || []).forEach(() => o.an.push(next++)); return o; });
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + plan.map(o => o.pn + ' 0 R').join(' ') + '] /Count ' + pages.length + ' >>');
    pages.forEach((p, i) => {
      const o = plan[i], sc = p.pw / p.w, content = 'q ' + p.pw + ' 0 0 ' + p.ph + ' 0 0 cm /Im0 Do Q';
      obj(o.pn, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p.pw + ' ' + p.ph + '] /Resources << /XObject << /Im0 ' + o.im + ' 0 R >> >> /Contents ' + o.cn + ' 0 R' +
        (o.an.length ? ' /Annots [' + o.an.map(n => n + ' 0 R').join(' ') + ']' : '') + ' >>');
      obj(o.cn, '<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream');
      offs[o.im] = pos;
      push(o.im + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + p.w + ' /Height ' + p.h + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n');
      push(p.jpeg); push('\nendstream\nendobj\n');
      (p.links || []).forEach((l, k) => {
        const x1 = (l.x * sc).toFixed(2), x2 = ((l.x + l.w) * sc).toFixed(2), y1 = (p.ph - (l.y + l.h) * sc).toFixed(2), y2 = (p.ph - l.y * sc).toFixed(2);
        obj(o.an[k], '<< /Type /Annot /Subtype /Link /Rect [' + x1 + ' ' + y1 + ' ' + x2 + ' ' + y2 + '] /Border [0 0 0] /A << /S /URI /URI ' + pstr(l.url) + ' >> >>');
      });
    });
    const total = next, xrefPos = pos;
    let x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xrefPos + '\n%%EOF\n');
    return new Blob(chunks, { type: 'application/pdf' });
  }

  async function couponPdf(theme, d, qrText) {
    const cv = await couponImage(theme, d, qrText);
    const bin = atob(cv.toDataURL('image/jpeg', 0.93).split(',')[1]), jpeg = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);
    return makePdf([{ jpeg: jpeg, w: cv.width, h: cv.height, pw: 405, ph: Math.round(405 * cv.height / cv.width), links: cv.links || [] }]);
  }

  window.App = { CFG, configured, rpc, esc, fmtCode, fmtDate, fmtDateTime, couponLink, toast,
    FONTS, DEFAULT_THEME, applyTheme, onColor, renderCoupon, makeZip, crc32, couponImage, couponPdf, makePdf };
})();
