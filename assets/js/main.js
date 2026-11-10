/* =========================================================
   Emax Technologies — interactions
   Libraries: GSAP (intro choreography), Lenis (smooth scroll).
   Scroll scenes use a small engine of their own: every scene
   is a pure function of scroll progress, so jumping anywhere
   on the page always renders the correct state.
   ========================================================= */
(() => {
  'use strict';

  const d = document;
  const root = d.documentElement;
  const $ = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => Array.from(c.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const norm = (v, a, b) => clamp((v - a) / (b - a));
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeExpo = (t) => (t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2);

  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const gsap = window.gsap;

  const store = {
    get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
  };

  let vw = innerWidth;
  let vh = innerHeight;
  let sy = window.scrollY;
  let ready = false;

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (!REDUCED && typeof window.Lenis === 'function') {
    try {
      lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.4 });
    } catch (e) {
      lenis = null;
    }
  }
  const lock = () => { root.classList.add('is-locked'); if (lenis) lenis.stop(); };
  const unlock = () => { root.classList.remove('is-locked'); if (lenis) lenis.start(); };

  function scrollToY(y, immediate) {
    if (lenis) lenis.scrollTo(y, { duration: 1.5, easing: easeExpo, immediate: !!immediate, force: true });
    else window.scrollTo({ top: y, behavior: immediate || REDUCED ? 'auto' : 'smooth' });
  }

  /* ---------- Frame loop + scroll scenes ---------- */
  const tickers = [];
  const onTick = (fn) => tickers.push(fn);
  const scenes = [];
  let forceScenes = true;
  let lastScenesY = -1;

  function scene(el, opts) {
    if (!el) return null;
    const s = Object.assign({ el, start: 0, end: 1, p: -1 }, opts);
    scenes.push(s);
    return s;
  }

  function measure() {
    vw = innerWidth;
    vh = innerHeight;
    scenes.forEach((s) => s.layout && s.layout());
    const y = window.scrollY;
    scenes.forEach((s) => {
      const r = s.el.getBoundingClientRect();
      const [a, b] = s.range(r.top + y, r.height);
      s.start = a;
      s.end = b;
      s.p = -1;
    });
    forceScenes = true;
  }

  function runScenes() {
    for (let i = 0; i < scenes.length; i++) {
      const s = scenes[i];
      const p = s.end > s.start ? clamp((sy - s.start) / (s.end - s.start)) : 0;
      if (p !== s.p) {
        s.p = p;
        s.update(p);
      }
    }
  }

  function frame(t) {
    if (lenis) lenis.raf(t);
    sy = window.scrollY;
    if (sy !== lastScenesY || forceScenes) {
      forceScenes = false;
      lastScenesY = sy;
      runScenes();
    }
    for (let i = 0; i < tickers.length; i++) tickers[i](t);
    requestAnimationFrame(frame);
  }

  /* ---------- Day / IR night theme ---------- */
  const themed = $$('main [data-theme], body > footer[data-theme]');
  const modeTxt = $('.mode__txt');
  const metaTheme = $('meta[name="theme-color"]');
  const irflash = d.createElement('div');
  irflash.className = 'irflash';
  irflash.setAttribute('aria-hidden', 'true');
  d.body.appendChild(irflash);
  let theme = 'day';

  function setTheme(t) {
    if (!t || t === theme) return;
    theme = t;
    root.dataset.theme = t;
    if (modeTxt) modeTxt.textContent = t === 'night' ? 'IR night mode' : 'Day mode';
    if (metaTheme) metaTheme.setAttribute('content', t === 'night' ? '#0A0E0C' : '#E9ECEE');
    if (!REDUCED) {
      irflash.classList.remove('go');
      void irflash.offsetWidth;
      irflash.classList.add('go');
    }
  }
  function syncTheme() {
    const mid = vh / 2;
    for (const el of themed) {
      const r = el.getBoundingClientRect();
      if (r.top <= mid && r.bottom >= mid) { setTheme(el.dataset.theme); return; }
    }
  }
  const themeIO = new IntersectionObserver((entries) => {
    if (!ready) return;
    entries.forEach((e) => { if (e.isIntersecting) setTheme(e.target.dataset.theme); });
  }, { rootMargin: '-50% 0px -50% 0px' });
  themed.forEach((el) => themeIO.observe(el));

  /* ---------- Formatting ---------- */
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const pad = (n) => String(n).padStart(2, '0');
  const hms = (dt) => `${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
  const osdDate = (dt) => `${pad(dt.getDate())}-${pad(dt.getMonth() + 1)}-${dt.getFullYear()} ${DAYS[dt.getDay()]} ${hms(dt)}`;

  /* =========================================================
     Navigation
     ========================================================= */
  const nav = $('#nav');
  const menu = $('#menu');
  const toggle = $('#menuToggle');
  let menuOpen = false;

  function openMenu() {
    if (!menu) return;
    menuOpen = true;
    menu.hidden = false;
    void menu.offsetWidth;
    menu.classList.add('is-open');
    toggle.setAttribute('aria-expanded', 'true');
    $('.nav__toggle-txt', toggle).textContent = 'Close';
    root.classList.add('menu-open');
    nav.classList.remove('is-hidden');
    lock();
    setTimeout(() => { const a = $('a', menu); if (a && menuOpen) a.focus(); }, 350);
  }
  function closeMenu(returnFocus) {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('is-open');
    toggle.setAttribute('aria-expanded', 'false');
    $('.nav__toggle-txt', toggle).textContent = 'Menu';
    root.classList.remove('menu-open');
    unlock();
    setTimeout(() => { if (!menuOpen) menu.hidden = true; }, 800);
    if (returnFocus) toggle.focus();
  }

  function initNav() {
    if (toggle) toggle.addEventListener('click', () => (menuOpen ? closeMenu(true) : openMenu()));
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && menuOpen) closeMenu(true); });

    d.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      const target = d.getElementById(id.slice(1));
      if (!target) return;
      e.preventDefault();
      closeMenu(false);
      const y = id === '#top' ? 0 : target.getBoundingClientRect().top + window.scrollY;
      scrollToY(y);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });

    let lastY = 0;
    onTick(() => {
      if (!nav) return;
      if (Math.abs(sy - lastY) < 3) return;
      nav.classList.toggle('is-scrolled', sy > 24);
      nav.classList.toggle('is-hidden', ready && sy > lastY && sy > vh * 0.7 && !menuOpen && !nav.contains(d.activeElement));
      lastY = sy;
    });
  }

  /* =========================================================
     Hero turret camera: looks wherever the visitor is
     ========================================================= */
  let turretActive = false;

  function initTurret() {
    const svg = $('#turret');
    if (!svg) return;
    const face = $('#tFace');
    const edge = $('#tEdge');
    const lensG = $('#tLens');
    const hero = $('.hero');
    const fov = $('#heroFovPath');
    const SX = 300;
    const SY = 470;
    const D = 161.7; // sphere centre to face plate
    const DL = 192; // lens protrudes further
    const DE = 150; // plate edge sits behind
    const MAX = Math.sin(40 * Math.PI / 180);
    const UP = -Math.sin(24 * Math.PI / 180);
    let k = 1, cx = 0, cyDoc = 0, heroTopDoc = 0, heroLeft = 0;
    let gx = 0, gy = 0, tx = 0, ty = 0;
    let lastMove = -1e9;
    let visible = true;

    const measureT = () => {
      const r = svg.getBoundingClientRect();
      const hr = hero.getBoundingClientRect();
      k = r.width / 600;
      cx = r.left + SX * k;
      cyDoc = r.top + window.scrollY + SY * k;
      heroTopDoc = hr.top + window.scrollY;
      heroLeft = hr.left;
    };
    measureT();
    addEventListener('resize', measureT);
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(measureT);

    const aim = (px, py) => {
      const dx = px - cx;
      const dy = py - (cyDoc - window.scrollY);
      const depth = 420 + 380 * k;
      const len = Math.hypot(dx, dy, depth);
      let x = dx / len;
      let y = dy / len;
      const m = Math.hypot(x, y);
      if (m > MAX) { x *= MAX / m; y *= MAX / m; }
      if (y < UP) y = UP;
      tx = x;
      ty = y;
    };

    if (FINE && !REDUCED) {
      addEventListener('pointermove', (e) => { lastMove = performance.now(); aim(e.clientX, e.clientY); }, { passive: true });
    }
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(hero);

    onTick((t) => {
      if (!turretActive || !visible || REDUCED) return;
      if (t - lastMove > 3200) {
        const s = t / 1000;
        tx = Math.sin(s * 0.42) * 0.52;
        ty = Math.sin(s * 0.77 + 1) * 0.14 + 0.1;
      }
      gx += (tx - gx) * 0.085;
      gy += (ty - gy) * 0.085;
      const s = Math.min(Math.hypot(gx, gy), 0.98);
      const c = Math.sqrt(1 - s * s);
      const ph = Math.atan2(gy, gx) * 57.29578;
      const rot = `rotate(${ph.toFixed(2)}) scale(${c.toFixed(4)} 1) rotate(${(-ph).toFixed(2)})`;
      face.setAttribute('transform', `translate(${(SX + D * gx).toFixed(2)} ${(SY + D * gy).toFixed(2)}) ${rot}`);
      lensG.setAttribute('transform', `translate(${(SX + DL * gx).toFixed(2)} ${(SY + DL * gy).toFixed(2)}) ${rot}`);
      edge.setAttribute('transform', `translate(${(SX + DE * gx).toFixed(2)} ${(SY + DE * gy).toFixed(2)}) ${rot}`);

      if (fov) {
        // Field-of-view wedge, drawn like a coverage plan
        const ax = cx - heroLeft + DL * gx * k;
        const ay = cyDoc - heroTopDoc + DL * gy * k;
        const reach = s / MAX;
        fov.setAttribute('transform', `translate(${ax.toFixed(1)} ${ay.toFixed(1)}) rotate(${ph.toFixed(2)}) scale(${(0.15 + reach * 0.85).toFixed(3)})`);
        fov.style.opacity = (0.25 + reach * 0.75).toFixed(3);
      }
    });

    if (fov) fov.setAttribute('d', 'M0 0L1400 -402L1400 402Z');
  }

  /* =========================================================
     Detection-box cursor
     ========================================================= */
  function initCursor() {
    if (!FINE || REDUCED) return;
    const cur = $('#cursor');
    if (!cur) return;
    const box = $('.cursor__box', cur);
    const dot = $('.cursor__dot', cur);
    const label = $('.cursor__label', cur);
    root.classList.add('has-cursor');
    cur.classList.add('is-hidden');

    const IDLE = 44;
    let mx = -100, my = -100;
    let bx = -100, by = -100, bw = IDLE, bh = IDLE;
    let lockEl = null;
    let shown = false;
    let confT = 0;

    addEventListener('pointermove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      if (!shown) {
        shown = true;
        bx = mx - IDLE / 2;
        by = my - IDLE / 2;
        cur.classList.remove('is-hidden');
      }
    }, { passive: true });

    d.addEventListener('pointerover', (e) => {
      const el = e.target.closest ? e.target.closest('a, button, select, [data-lock]') : null;
      lockEl = el;
      cur.classList.toggle('is-locked', !!el);
      if (el) label.textContent = el.dataset.lock || 'Target';
    });
    d.addEventListener('pointerout', (e) => {
      if (!e.relatedTarget) { shown = false; cur.classList.add('is-hidden'); }
    });
    addEventListener('blur', () => { shown = false; cur.classList.add('is-hidden'); });
    d.addEventListener('pointerdown', () => cur.classList.add('is-down'));
    d.addEventListener('pointerup', () => cur.classList.remove('is-down'));

    onTick((t) => {
      let tx, ty, tw, th;
      if (lockEl && lockEl.isConnected) {
        const r = lockEl.getBoundingClientRect();
        tx = r.left - 6; ty = r.top - 6; tw = r.width + 12; th = r.height + 12;
      } else {
        lockEl = null;
        tw = th = IDLE;
        tx = mx - IDLE / 2;
        ty = my - IDLE / 2;
        if (t - confT > 650) {
          confT = t;
          label.textContent = `Person ${96 + Math.floor(Math.random() * 4)}%`;
        }
      }
      bx += (tx - bx) * 0.24;
      by += (ty - by) * 0.24;
      bw += (tw - bw) * 0.24;
      bh += (th - bh) * 0.24;
      box.style.transform = `translate3d(${bx.toFixed(1)}px, ${by.toFixed(1)}px, 0)`;
      box.style.width = `${bw.toFixed(1)}px`;
      box.style.height = `${bh.toFixed(1)}px`;
    });
  }

  /* =========================================================
     About: a scan line reads the statement as you scroll
     ========================================================= */
  function initScan() {
    const el = $('#scan');
    if (!el) return;
    const lit = $('.scan__lit', el);
    const beam = $('.scan__beam', el);
    let h = 0;
    scene(el, {
      range: (top, height) => { h = height; return [top - vh * 0.74, top + height - vh * 0.42]; },
      update: (p) => {
        lit.style.clipPath = `inset(0 0 ${((1 - p) * 100).toFixed(2)}% 0)`;
        beam.style.transform = `translate3d(0, ${(p * h).toFixed(1)}px, 0)`;
        beam.style.opacity = p > 0.002 && p < 0.998 ? '1' : '0';
      },
    });
  }

  /* =========================================================
     CCTV showcase: scroll scrubs the camera feed
     ========================================================= */
  function initCCTV() {
    const track = $('#cctvTrack');
    if (!track) return;
    const N = 5;
    const steps = $$('#steps .step');
    const chapters = $$('#chapters button');
    const fills = chapters.map((b) => $('b', b));
    const screen = $('#screen');
    const feed = $('#feed');
    const dark = $('#fDark');
    const light = $('#fLight');
    const wire = $('#fWire');
    const ai = $('#fAI');
    const person = $('#fPerson');
    const body = $('#fBody');
    const legL = $('#fLegL');
    const legR = $('#fLegR');
    const armL = $('#fArmL');
    const armR = $('#fArmR');
    const pBox = $('#fPBoxRect');
    const pLabel = $('#fPLabel');
    const zoom = $('#zoom');
    const zoomLink = $('#fZoomLink');
    const flash = $('#flash');
    const osdTime = $('#osdTime');
    const osdRes = $('#osdRes');
    const osdIR = $('#osdIR');
    const osdAI = $('#osdAI');
    const osdPB = $('#osdPB');
    const notif = $('#notif');
    const notifText = $('#notifText');
    const playback = $('#playback');
    const playHead = $('#playHead');
    const playEv = $('#playEv');
    const wrap = $('#monitorWrap');
    const monitor = $('#monitor');
    const phone = $('#phone');
    const osd = $('.osd', screen);

    /* Recorded-time model: the night scenes play out at 02:14 */
    const now0 = new Date();
    const night = new Date(now0);
    night.setHours(2, 14, 0, 0);
    if (night <= now0) night.setDate(night.getDate() + 1);
    const W0 = 0.42; // walk starts
    const W1 = 0.76; // walk ends
    const S_CROSS = 0.24; // walk progress where line 1 is crossed
    const pAtS = (s) => W0 + (W1 - W0) * s;
    const recT = (p) => night.getTime() + (p - 0.3) * 100000;
    const crossT = recT(pAtS(S_CROSS));
    const winA = recT(0.3) - 10000;
    const winB = recT(0.8);
    const evPos = ((crossT - winA) / (winB - winA)) * 100;
    if (playEv) playEv.style.left = `${evPos.toFixed(1)}%`;
    if (notifText) notifText.textContent = `Person detected at ${hms(new Date(crossT))}`;

    let active = -1;
    let irOn = false;
    let live = true;
    let geo = null;

    const tickClock = () => { if (live && osdTime) osdTime.textContent = osdDate(new Date()); };
    tickClock();
    setInterval(tickClock, 1000);

    function placePerson(s) {
      const x = 712 - 242 * s;
      const y = 340 + 480 * Math.pow(s, 1.15);
      const k = 0.5 + 0.62 * s;
      const sw = Math.sin(s * Math.PI * 16);
      person.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${k.toFixed(3)})`);
      legL.setAttribute('transform', `translate(0 -66) scale(1 ${(1 - 0.17 * Math.max(0, sw)).toFixed(3)}) translate(0 66)`);
      legR.setAttribute('transform', `translate(0 -66) scale(1 ${(1 - 0.17 * Math.max(0, -sw)).toFixed(3)}) translate(0 66)`);
      armL.setAttribute('transform', `rotate(${(sw * 8).toFixed(2)} -25 -118)`);
      armR.setAttribute('transform', `rotate(${(-sw * 8).toFixed(2)} 25 -118)`);
      body.setAttribute('transform', `translate(0 ${(-Math.abs(sw) * 3).toFixed(2)})`);
      const bw = 88 * k;
      const bh = 182 * k;
      const bx = x - bw / 2;
      const by = y - 172 * k;
      pBox.setAttribute('x', bx.toFixed(1));
      pBox.setAttribute('y', by.toFixed(1));
      pBox.setAttribute('width', bw.toFixed(1));
      pBox.setAttribute('height', bh.toFixed(1));
      pLabel.setAttribute('transform', `translate(${bx.toFixed(1)} ${(by - 36).toFixed(1)})`);
    }

    function layoutPhone() {
      if (!wrap || !monitor || !phone) return;
      const prev = monitor.style.clipPath;
      monitor.style.clipPath = '';
      const wr = wrap.getBoundingClientRect();
      const sr = screen.getBoundingClientRect();
      const sx = sr.left - wr.left;
      const syy = sr.top - wr.top;
      const ph = sr.height * 0.94;
      const pw = ph * 9 / 19.5;
      const px = clamp(sx + sr.width * 0.355 - pw / 2, sx, sx + sr.width - pw);
      const py = syy + (sr.height - ph) / 2;
      geo = {
        W: wr.width, H: wr.height, px, py, pw, ph,
        r0: parseFloat(getComputedStyle(monitor).borderTopLeftRadius) || 16,
        r1: Math.max(12, pw * 0.15),
      };
      Object.assign(phone.style, { left: `${px}px`, top: `${py}px`, width: `${pw}px`, height: `${ph}px`, borderRadius: `${geo.r1}px` });
      monitor.style.clipPath = prev;
    }

    function applyPhone(m) {
      if (!geo) return;
      if (osd) osd.style.opacity = (1 - norm(m, 0, 0.35)).toFixed(3);
      if (m <= 0.001) {
        monitor.style.clipPath = '';
        phone.style.opacity = '0';
        return;
      }
      const { W, H, px, py, pw, ph, r0, r1 } = geo;
      const t = lerp(0, py, m);
      const l = lerp(0, px, m);
      const r = lerp(0, W - px - pw, m);
      const b = lerp(0, H - py - ph, m);
      monitor.style.clipPath = `inset(${t.toFixed(1)}px ${r.toFixed(1)}px ${b.toFixed(1)}px ${l.toFixed(1)}px round ${lerp(r0, r1, m).toFixed(1)}px)`;
      phone.style.opacity = norm(m, 0.65, 1).toFixed(3);
    }

    function update(p) {
      /* steps + chapter bar */
      const i = Math.min(N - 1, Math.floor(p * N));
      if (i !== active) {
        active = i;
        steps.forEach((s, j) => s.classList.toggle('is-active', j === i));
        chapters.forEach((c, j) => {
          c.classList.toggle('is-active', j === i);
          if (j === i) c.setAttribute('aria-current', 'step'); else c.removeAttribute('aria-current');
        });
      }
      fills.forEach((f, j) => { f.style.transform = `scaleX(${clamp(p * N - j).toFixed(3)})`; });

      /* 1 — detail: focus pull, then digital zoom on the plate */
      const focus = easeOut(norm(p, 0.005, 0.08));
      const blur = (1 - focus) * 7;
      osdRes.textContent = focus < 0.35 ? '720p' : focus < 0.8 ? '1080p' : '4K';
      const z = norm(p, 0.08, 0.115) * (1 - norm(p, 0.17, 0.2));
      zoom.style.opacity = z.toFixed(3);
      zoom.style.transform = `scale(${(0.9 + 0.1 * easeOut(z)).toFixed(3)})`;
      zoomLink.setAttribute('opacity', z.toFixed(3));

      /* 2 — night: dusk, darkness, then the IR switch */
      const dusk = norm(p, 0.2, 0.3);
      const ir = p >= 0.3;
      if (ir !== irOn) {
        irOn = ir;
        screen.classList.toggle('is-ir', ir);
        osdIR.classList.toggle('is-on', ir);
        if (!REDUCED) { flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go'); }
      }
      screen.classList.toggle('is-night', dusk > 0.55);
      dark.setAttribute('opacity', (ir ? 0.16 : dusk * 0.86).toFixed(3));
      light.setAttribute('opacity', (ir ? 0.3 : norm(dusk, 0.45, 0.9) * 0.95).toFixed(3));
      feed.style.filter = (blur > 0.02 ? `blur(${blur.toFixed(2)}px) ` : '') +
        (ir ? 'grayscale(1) contrast(1.28) brightness(1.12)' : `saturate(${(1 - dusk * 0.55).toFixed(3)})`);

      /* 3 — smart detection */
      const aiOn = norm(p, 0.4, 0.43);
      ai.setAttribute('opacity', aiOn.toFixed(3));
      wire.setAttribute('opacity', aiOn.toFixed(3));
      osdAI.classList.toggle('is-on', p >= 0.4);
      let s;
      if (p < 0.8) s = norm(p, W0, W1);
      else s = lerp(1, S_CROSS, easeInOut(norm(p, 0.82, 0.97)));
      person.setAttribute('opacity', norm(p, 0.36, 0.4).toFixed(3));
      placePerson(s);
      wire.classList.toggle('is-alarm', s > S_CROSS - 0.02 && s < S_CROSS + 0.1);
      notif.classList.toggle('is-on', p >= pAtS(S_CROSS) && p < 0.6);

      /* 4 — the monitor becomes a phone */
      applyPhone(easeInOut(norm(p, 0.6, 0.67)) * (1 - easeInOut(norm(p, 0.78, 0.83))));

      /* 5 — playback: scrolling rewinds the recording */
      const pb = norm(p, 0.8, 0.83);
      playback.style.opacity = pb.toFixed(3);
      playback.style.transform = `translateY(${((1 - pb) * 10).toFixed(1)}px)`;
      osdPB.classList.toggle('is-on', p >= 0.8);
      const rw = easeInOut(norm(p, 0.82, 0.97));
      playHead.style.left = `${lerp(100, evPos, rw).toFixed(2)}%`;

      /* OSD clock */
      live = p < 0.2;
      if (!live) {
        let t;
        if (p < 0.3) t = lerp(Date.now(), night.getTime(), easeInOut(dusk));
        else if (p < 0.8) t = recT(p);
        else t = lerp(recT(0.8), crossT, rw);
        osdTime.textContent = osdDate(new Date(t));
      } else {
        tickClock();
      }
    }

    scene(track, {
      layout: layoutPhone,
      range: (top, h) => [top, top + h - vh],
      update,
    });

    chapters.forEach((btn, j) => {
      btn.addEventListener('click', () => {
        const r = track.getBoundingClientRect();
        const top = r.top + window.scrollY;
        scrollToY(top + (track.offsetHeight - vh) * ((j + 0.62) / N));
      });
    });
  }

  /* =========================================================
     Security tape: speed follows scroll velocity
     ========================================================= */
  function initTape() {
    const tape = $('#tape');
    if (!tape) return;
    const tracks = $$('.tape__track', tape).map((tr, i) => {
      const unitHTML = tr.innerHTML;
      const unit = tr.scrollWidth;
      const band = tr.parentElement.getBoundingClientRect().width;
      let html = unitHTML;
      let n = 1;
      while (unit * n < band + unit && n < 12) { html += unitHTML; n++; }
      if (n > 1) tr.innerHTML = html;
      return { tr, unit, x: i ? -unit * 0.37 : 0, dir: i ? 1 : -1 };
    });
    if (REDUCED) return;
    let visible = false;
    let prevY = window.scrollY;
    let prevT = 0;
    let vel = 0;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(tape);
    onTick((t) => {
      const dt = Math.min(64, t - prevT || 16);
      prevT = t;
      const dy = sy - prevY;
      prevY = sy;
      vel += (dy - vel) * 0.2;
      if (!visible) return;
      const sign = vel < -0.2 ? -1 : 1;
      const speed = (0.05 + Math.min(Math.abs(vel), 60) * 0.03) * dt;
      tracks.forEach((k) => {
        k.x += k.dir * sign * speed;
        if (k.x <= -k.unit) k.x += k.unit;
        if (k.x > 0) k.x -= k.unit;
        k.tr.style.transform = `translate3d(${k.x.toFixed(1)}px, 0, 0)`;
      });
    });
  }

  /* =========================================================
     Network panorama: vertical scroll pans the drawing
     ========================================================= */
  function initNet() {
    const track = $('#netTrack');
    const pano = $('#pano');
    if (!track || !pano) return;
    const far = $('#netFar');
    const bar = $('#netBar');
    const art = $('#panoArt');
    const callouts = $$('.callout', pano);
    const anchors = callouts.map((c) => parseFloat(c.style.getPropertyValue('--x')) / 100);
    const groups = {};
    $$('.svc', pano).forEach((g) => { (groups[g.dataset.svc] = groups[g.dataset.svc] || []).push(g); });
    let pw = 0;
    let pan = 0;
    let gut = 0;
    let hot = -1;

    function layout() {
      track.style.height = '';
      pw = pano.offsetWidth;
      gut = parseFloat(getComputedStyle(pano).marginLeft) || 0;
      pan = Math.max(0, pw + gut * 2 - vw);
      track.style.height = `${Math.round(pan + vh)}px`;
    }

    function update(p) {
      const x = -pan * p;
      pano.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
      if (far) far.style.transform = `translate3d(${(x * 0.22).toFixed(1)}px, 0, 0)`;
      if (bar) bar.style.transform = `scaleX(${p.toFixed(4)})`;
      const focusX = vw * (0.22 + 0.56 * p);
      let best = 0;
      let bd = Infinity;
      anchors.forEach((a, i) => {
        const dd = Math.abs(gut + x + a * pw - focusX);
        if (dd < bd) { bd = dd; best = i; }
      });
      if (best !== hot) {
        hot = best;
        const key = callouts[hot].dataset.svc;
        callouts.forEach((c, i) => c.classList.toggle('is-hot', i === hot));
        Object.keys(groups).forEach((k) => groups[k].forEach((g) => g.classList.toggle('is-hot', k === key)));
      }
    }

    scene(track, { layout, range: (top, h) => [top, top + h - vh], update });

    if (art && typeof art.pauseAnimations === 'function') {
      if (REDUCED) art.pauseAnimations();
      else {
        art.pauseAnimations();
        new IntersectionObserver(([e]) => { if (e.isIntersecting) art.unpauseAnimations(); else art.pauseAnimations(); }).observe(track);
      }
    }
  }

  /* =========================================================
     Process: a Cat6 cable plugs into each step
     ========================================================= */
  function initProcess() {
    const body = $('#processBody');
    if (!body) return;
    const svg = $('#cable');
    const bg = $('#cableBg');
    const live = $('#cableLive');
    const plug = $('#plug');
    const items = $$('.pstep', body);
    let L = 0;
    let marks = [];

    function layout() {
      const br = body.getBoundingClientRect();
      const ports = items.map((li) => {
        const r = $('.port', li).getBoundingClientRect();
        return { x: r.left + r.width / 2 - br.left, y: r.top + r.height / 2 - br.top };
      });
      if (!ports.length) return;
      svg.setAttribute('viewBox', `0 0 ${br.width.toFixed(1)} ${br.height.toFixed(1)}`);
      const y0 = Math.min(0, ports[0].y - 70);
      let path = `M${ports[0].x.toFixed(1)} ${y0.toFixed(1)}`;
      let prev = { x: ports[0].x, y: y0 };
      const sway = Math.min(64, vw * 0.045);
      marks = [];
      ports.forEach((pt, i) => {
        const my = (prev.y + pt.y) / 2;
        const sx = i === 0 ? 0 : i % 2 ? -sway : sway;
        path += ` C${(prev.x + sx).toFixed(1)} ${my.toFixed(1)} ${(pt.x - sx).toFixed(1)} ${my.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
        bg.setAttribute('d', path);
        marks.push(bg.getTotalLength());
        prev = pt;
      });
      path += ` L${prev.x.toFixed(1)} ${(prev.y + 70).toFixed(1)}`;
      bg.setAttribute('d', path);
      live.setAttribute('d', path);
      L = live.getTotalLength();
      live.style.strokeDasharray = `${L.toFixed(1)} ${L.toFixed(1)}`;
    }

    function update(p) {
      if (!L) return;
      const len = L * p;
      live.style.strokeDashoffset = (L - len).toFixed(1);
      const a = live.getPointAtLength(len);
      const b = live.getPointAtLength(Math.max(0, len - 3));
      const ang = len > 3 ? Math.atan2(a.y - b.y, a.x - b.x) * 57.29578 - 90 : 0;
      plug.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0) rotate(${ang.toFixed(1)}deg)`;
      items.forEach((li, i) => li.classList.toggle('is-on', len >= marks[i] - 2));
    }

    scene(body, { layout, range: (top, h) => [top - vh * 0.62, top + h - vh * 0.62], update });
  }

  /* =========================================================
     Footer wordmark rises into place
     ========================================================= */
  function initFooter() {
    const mark = $('#footerMark');
    if (!mark) return;
    const letters = $$('span', mark);
    scene(mark, {
      range: (top, h) => [top - vh, top + h - vh * 0.97],
      update: (p) => {
        letters.forEach((l, i) => {
          const q = easeOut(norm(p, i * 0.08, 0.62 + i * 0.1));
          l.style.transform = `translate3d(0, ${((1 - q) * 75).toFixed(1)}%, 0)`;
        });
      },
    });
  }

  /* ---------- Headings focus in ---------- */
  function initFocusIn() {
    const els = $$('.focus-in');
    if (REDUCED || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -14% 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* =========================================================
     Enquiry form → WhatsApp or email
     ========================================================= */
  function initForm() {
    const form = $('#enquiry');
    if (!form) return;
    const PHONE = '919942220037';
    const EMAIL = 'emaxxtechnologies@gmail.com';
    const val = (n) => (form.elements[n] ? form.elements[n].value.trim() : '');
    const rules = [
      { name: 'name', err: 'f-name-err', ok: () => val('name').length >= 2 },
      { name: 'phone', err: 'f-phone-err', ok: () => val('phone').replace(/\D/g, '').length >= 10 },
    ];

    function show(rule, valid) {
      const input = form.elements[rule.name];
      const err = d.getElementById(rule.err);
      input.closest('.field').classList.toggle('has-error', !valid);
      input.setAttribute('aria-invalid', String(!valid));
      if (valid) { input.removeAttribute('aria-describedby'); err.hidden = true; }
      else { input.setAttribute('aria-describedby', rule.err); err.hidden = false; }
    }
    function validate() {
      let first = null;
      rules.forEach((r) => {
        const ok = r.ok();
        show(r, ok);
        if (!ok && !first) first = form.elements[r.name];
      });
      if (first) first.focus();
      return !first;
    }
    function compose() {
      const lines = ['Hello Emax Technologies,', '', `Name: ${val('name')}`, `Phone: ${val('phone')}`, `Service: ${val('service')}`];
      const msg = val('message');
      if (msg) lines.push('', msg);
      return lines.join('\n');
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;
      window.open(`https://wa.me/${PHONE}?text=${encodeURIComponent(compose())}`, '_blank', 'noopener');
    });
    const mailBtn = $('#sendMail');
    if (mailBtn) {
      mailBtn.addEventListener('click', () => {
        if (!validate()) return;
        window.location.href = `mailto:${EMAIL}?subject=${encodeURIComponent(`Enquiry: ${val('service')}`)}&body=${encodeURIComponent(compose())}`;
      });
    }
    form.addEventListener('input', (e) => {
      const rule = rules.find((r) => r.name === e.target.name);
      if (rule && e.target.closest('.field').classList.contains('has-error') && rule.ok()) show(rule, true);
    });
  }

  /* =========================================================
     Loader: the lens focuses, opens, then becomes the camera's eye
     ========================================================= */
  const blades = $$('#irisBlades path');
  function drawIris(open, rot) {
    const n = blades.length;
    if (!n) return;
    const GR = 74;
    const r = lerp(GR * 0.05, GR * 1.22, open);
    const L = GR * 3.4;
    const P = [];
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      P.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    for (let i = 0; i < n; i++) {
      const v0 = P[i];
      const v1 = P[(i + 1) % n];
      const v2 = P[(i + 2) % n];
      let ax = v1[0] - v0[0], ay = v1[1] - v0[1];
      const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
      let bx = v2[0] - v1[0], by = v2[1] - v1[1];
      const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
      blades[i].setAttribute('d',
        `M${v1[0].toFixed(2)} ${v1[1].toFixed(2)}` +
        `L${(v1[0] + ax * L).toFixed(2)} ${(v1[1] + ay * L).toFixed(2)}` +
        `L${(v2[0] + bx * L).toFixed(2)} ${(v2[1] + by * L).toFixed(2)}` +
        `L${v2[0].toFixed(2)} ${v2[1].toFixed(2)}Z`);
    }
  }

  let failsafe = 0;

  function finish() {
    if (ready) return;
    clearTimeout(failsafe);
    const loader = $('#loader');
    if (loader) loader.remove();
    ready = true;
    root.classList.add('is-ready');
    unlock();
    turretActive = true;
    initCursor();
    measure();
    syncTheme();
    if (location.hash) {
      const target = d.getElementById(location.hash.slice(1));
      if (target) scrollToY(target.getBoundingClientRect().top + window.scrollY, true);
    }
  }

  function heroFallback() {
    if (gsap) {
      gsap.set(['.hero__title .line__in', '.hero__lede', '.hero__actions', '.hero__foot', '#nav', '#tLens', '.turret__body', '#tFace', '#tEdge'], { clearProps: 'all' });
    }
  }

  function intro() {
    store.set('emax-intro', '1');
    const loader = $('#loader');
    const lensEl = $('#loaderLens');
    const heroLens = $('#heroLens');
    const hasHash = !!(location.hash && d.getElementById(location.hash.slice(1)));

    if (!gsap || REDUCED || hasHash || !lensEl || !heroLens) {
      heroFallback();
      if (loader) {
        loader.classList.add('is-fading');
        setTimeout(finish, REDUCED ? 50 : 600);
      } else finish();
      return;
    }

    const lr = lensEl.getBoundingClientRect();
    const hr = heroLens.getBoundingClientRect();
    const coreR = lr.width / 4; // lens core is r=100 inside a 400-unit viewBox
    const tx = hr.left + hr.width / 2 - (lr.left + lr.width / 2);
    const ty = hr.top + hr.height / 2 - (lr.top + lr.height / 2);
    const sc = hr.width / 2 / coreR;
    const iris = { o: 0.1 };

    gsap.set('#tLens', { opacity: 0 });
    const tl = gsap.timeline({ onComplete: finish });
    tl.to(iris, { o: 1, duration: 1.05, ease: 'power2.inOut', onUpdate: () => drawIris(iris.o, 0.6 + iris.o * 0.95) }, 0)
      .to('#loaderRing', { scale: 1.14, opacity: 0, duration: 0.75, ease: 'power2.in', svgOrigin: '0 0' }, 0.2)
      .to('.loader__meta', { opacity: 0, y: 14, duration: 0.45, ease: 'power2.in' }, 0.05)
      .to('#loaderBarrel', { opacity: 0, duration: 0.6, ease: 'power2.inOut' }, 1.0)
      .to(lensEl, { x: tx, y: ty, scale: sc, duration: 1.2, ease: 'expo.inOut' }, 0.85)
      .to('.loader__bg', { opacity: 0, duration: 0.9, ease: 'power2.inOut' }, 1.25)
      .fromTo('.turret__body', { opacity: 0, scale: 0.92, svgOrigin: '300 470' }, { opacity: 1, scale: 1, svgOrigin: '300 470', duration: 1.1, ease: 'expo.out' }, 1.45)
      .fromTo(['#tFace', '#tEdge'], { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.65)
      .add(() => { gsap.set('#tLens', { opacity: 1 }); gsap.set(lensEl, { opacity: 0 }); }, 2.05)
      .fromTo('.hero__title .line__in', { yPercent: 110 }, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.085 }, 1.55)
      .fromTo(['.hero__lede', '.hero__actions', '.hero__foot'], { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', stagger: 0.08, clearProps: 'transform' }, 1.85)
      .fromTo('#nav', { yPercent: -100 }, { yPercent: 0, duration: 1, ease: 'expo.out', clearProps: 'transform' }, 1.9)
      .add(ledChase, 2.15);

    const hurry = () => tl.timeScale(3.2);
    addEventListener('wheel', hurry, { once: true, passive: true });
    addEventListener('touchstart', hurry, { once: true, passive: true });
    addEventListener('keydown', hurry, { once: true });
  }

  function ledChase() {
    const glows = $$('#tLeds .led-glow');
    if (!gsap || !glows.length) return;
    gsap.timeline()
      .to(glows, { opacity: 1, duration: 0.16, stagger: 0.05, ease: 'none' })
      .to(glows, { opacity: 0, duration: 0.5, stagger: 0.05, ease: 'power2.out' }, 0.22)
      .set(glows, { clearProps: 'opacity' });
  }

  function initLoader() {
    const loader = $('#loader');
    if (!loader) { finish(); return; }
    lock();
    failsafe = setTimeout(() => { heroFallback(); finish(); }, 12000);

    const ticks = $('#loaderTicks');
    if (ticks) {
      let html = '';
      for (let i = 0; i < 120; i++) {
        const a = (i * 3 * Math.PI) / 180;
        const major = i % 10 === 0;
        const r1 = major ? 164 : 170;
        html += `<line${major ? ' class="major"' : ''} x1="${(Math.cos(a) * r1).toFixed(2)}" y1="${(Math.sin(a) * r1).toFixed(2)}" x2="${(Math.cos(a) * 178).toFixed(2)}" y2="${(Math.sin(a) * 178).toFixed(2)}"/>`;
      }
      ticks.innerHTML = html;
    }

    if (gsap) {
      gsap.set('#tLens', { opacity: 0 });
      gsap.set('.hero__title .line__in', { yPercent: 110 });
    }

    const arc = $('#loaderArc');
    const pct = $('#loaderPct');
    const word = $('.loader__word');
    const quick = store.get('emax-intro') === '1';
    const minDur = REDUCED ? 150 : quick ? 450 : 1700;
    const t0 = performance.now();
    let target = 0.12;
    let shown = 0;

    if (d.fonts && d.fonts.ready) d.fonts.ready.then(() => { target = Math.max(target, 0.78); });
    else target = 0.78;
    const loaded = () => { target = 1; };
    if (d.readyState === 'complete') loaded();
    else addEventListener('load', loaded, { once: true });
    setTimeout(loaded, 5000);

    drawIris(0.04, 0);
    const step = (now) => {
      const cap = Math.min(target, (now - t0) / minDur);
      shown += (cap - shown) * 0.12;
      if (cap >= 1 && 1 - shown < 0.004) shown = 1;
      if (pct) pct.textContent = String(Math.round(shown * 100));
      if (arc) arc.style.strokeDashoffset = (100 - shown * 100).toFixed(2);
      if (word) word.style.setProperty('--blur', `${((1 - shown) * 9).toFixed(2)}px`);
      drawIris(0.04 + shown * 0.07, shown * 0.6);
      if (shown >= 1) intro();
      else requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* =========================================================
     Boot
     ========================================================= */
  function boot() {
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    if (!location.hash) window.scrollTo(0, 0);

    const year = $('#year');
    if (year) year.textContent = String(new Date().getFullYear());

    initNav();
    initTurret();
    initScan();
    initCCTV();
    initTape();
    initNet();
    initProcess();
    initFooter();
    initFocusIn();
    initForm();

    measure();
    requestAnimationFrame(frame);

    let rT = 0;
    addEventListener('resize', () => {
      clearTimeout(rT);
      rT = setTimeout(() => { measure(); if (ready) syncTheme(); }, 160);
    });
    if (d.fonts && d.fonts.ready) d.fonts.ready.then(measure);
    addEventListener('load', measure);

    initLoader();
  }

  boot();
})();
