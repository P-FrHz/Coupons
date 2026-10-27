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
          (d.expires_at ? '<div class="meta">صالح حتى ' + esc(fmtDate(d.expires_at)) + '</div>' : '');
      } else {
        foot = '<div class="qr"><canvas></canvas></div>' +
          '<div class="code">' + esc(fmtCode(d.code)) + '</div>' +
          '<div class="hint-scan">أظهر هذا الكود للكاشير</div>' +
          (d.expires_at ? '<div class="meta">صالح حتى ' + esc(fmtDate(d.expires_at)) + '</div>' : '');
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

    el.innerHTML =
      '<div class="ticket' + (dead ? ' dead' : '') + '">' +
        '<div class="t-head">' +
          (t.badge ? '<span class="pill">' + esc(t.badge) + '</span>' : '') +
          '<div class="logo">' + logo + '</div>' +
          '<div class="brand">' + esc(t.brand) + '</div>' +
        '</div>' +
        '<div class="t-body">' +
          '<h1 class="offer">' + esc(t.offer_title) + '</h1>' +
          (t.offer_sub ? '<p class="sub">' + esc(t.offer_sub) + '</p>' : '') +
        '</div>' +
        '<div class="sep"></div>' +
        '<div class="t-foot">' + foot + '</div>' +
      '</div>' +
      (terms ? '<ul class="terms">' + terms + '</ul>' : '');

    const cv = el.querySelector('canvas');
    if (cv) {
      const text = opts.qrText || d.code || '';
      if (window.QRCode) {
        QRCode.toCanvas(cv, text, { width: 400, margin: 0, errorCorrectionLevel: 'M',
          color: { dark: '#0f172a', light: '#ffffff' } }, () => {});
      } else {
        cv.parentElement.innerHTML = '<div class="meta" style="max-width:200px;word-break:break-all">' + esc(text) + '</div>';
      }
    }
  }

  window.App = { CFG, configured, rpc, esc, fmtCode, fmtDate, fmtDateTime, couponLink, toast,
    FONTS, DEFAULT_THEME, applyTheme, onColor, renderCoupon };
})();
