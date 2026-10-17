/* HOME-GYM · Design System "Cyber-Athletic" — Background vivo (v1)
   Particelle + luce che segue il puntatore (mouse o dito). Zero dipendenze.
   ------------------------------------------------------------------------
   Uso rapido (pagina intera):
     <script src="bg-fx.js"></script>
     <script>BgFX.attach(document.body, { intensity: 1 });</script>
   Su un contenitore (es. Focus Mode):
     BgFX.attach('#fxOverlay', { intensity: 0.5, zIndex: 3 });
   Automatico su tutti gli elementi con data-bgfx:
     BgFX.auto();   // <div data-bgfx="0.8"> …
   Opzioni: intensity 0–1 · density 0.2–2 · zIndex · radius (raggio luce in px)
   · Rispetta prefers-reduced-motion (particelle ferme, nessuna deriva autonoma)
   · Si mette in pausa quando la tab è nascosta · dpr max 2 · max 150 particelle
   ------------------------------------------------------------------------ */
const BgFX = (() => {
  'use strict';

  const DEFAULTS = { intensity: 1, density: 1, zIndex: 40, radius: 300 };
  const RGB = {
    soft: '143,149,163',   /* --text-1 #8F95A3 */
    volt: '204,255,0',     /* --volt  #CCFF00 */
    cyan: '0,229,255',     /* --cyan  #00E5FF */
  };

  function attach(target, options) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    const noop = { destroy() {} };
    if (!el || typeof document === 'undefined') return noop;

    const opts = Object.assign({}, DEFAULTS, options || {});
    const isBody = el === document.body || el === document.documentElement;
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* ---------- canvas ---------- */
    const canvas = document.createElement('canvas');
    canvas.className = 'bgfx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    if (!isBody && window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
    canvas.style.cssText = (isBody ? 'position:fixed;' : 'position:absolute;')
      + 'inset:0;width:100%;height:100%;pointer-events:none;z-index:' + opts.zIndex + ';';
    const ctx = canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return noop;                     /* ambienti senza canvas 2D (es. test) */
    el.appendChild(canvas);

    /* ---------- geometria ---------- */
    let w = 1, h = 1, dpr = 1;
    const sizeOf = () => isBody
      ? { w: window.innerWidth, h: window.innerHeight }
      : { w: el.clientWidth, h: el.clientHeight };

    /* ---------- particelle ---------- */
    let ps = [];
    function makeParticle() {
      const roll = Math.random();
      const rgb = roll < 0.08 ? RGB.volt : roll < 0.16 ? RGB.cyan : RGB.soft;
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * (reduced ? 0 : 0.22),
        vy: (Math.random() - 0.5) * (reduced ? 0 : 0.22),
        r: 0.6 + Math.random() * 1.3,
        a: 0.14 + Math.random() * 0.30,
        rgb,
        ph: Math.random() * Math.PI * 2,
        spin: Math.random() < 0.5 ? -1 : 1,
      };
    }
    function ensureParticles() {
      const count = Math.max(28, Math.min(150, Math.round((w * h) / 16000 * opts.density)));
      while (ps.length < count) ps.push(makeParticle());
      if (ps.length > count) ps = ps.slice(0, count);
    }

    /* ---------- luce ---------- */
    let lx = 0, ly = 0, tx = 0, ty = 0, fade = 0;
    let pointerSeen = false, lastPointer = -1e9;

    function resize() {
      const s = sizeOf();
      w = Math.max(1, s.w); h = Math.max(1, s.h);
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ensureParticles();
      if (!pointerSeen) { lx = tx = w / 2; ly = ty = h / 2; }
    }

    function onPointer(e) {
      pointerSeen = true;
      lastPointer = performance.now();
      if (isBody) { tx = e.clientX; ty = e.clientY; }
      else {
        const r = el.getBoundingClientRect();
        tx = e.clientX - r.left; ty = e.clientY - r.top;
      }
    }
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('pointerdown', onPointer, { passive: true });

    /* ---------- loop ---------- */
    let raf = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const R = Math.max(140, opts.radius);

      /* puntatore recente? altrimenti deriva autonoma (lissajous lenta) */
      if (!pointerSeen || ts - lastPointer > 3000) {
        if (!reduced) {
          tx = w * (0.5 + 0.34 * Math.sin(ts * 0.00021));
          ty = h * (0.5 + 0.30 * Math.cos(ts * 0.00017));
        }
      }
      const k = reduced ? 1 : 0.075;
      lx += (tx - lx) * k;
      ly += (ty - ly) * k;
      fade = Math.min(1, fade + 0.012);

      ctx.clearRect(0, 0, w, h);

      /* luce: nucleo Volt + alone Ciano */
      const i = opts.intensity * fade;
      if (i > 0.001) {
        const g1 = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
        g1.addColorStop(0, 'rgba(204,255,0,' + (0.15 * i).toFixed(3) + ')');
        g1.addColorStop(0.45, 'rgba(204,255,0,' + (0.05 * i).toFixed(3) + ')');
        g1.addColorStop(1, 'rgba(204,255,0,0)');
        ctx.fillStyle = g1;
        ctx.fillRect(lx - R, ly - R, R * 2, R * 2);
        const R2 = R * 1.9;
        const g2 = ctx.createRadialGradient(lx, ly, 0, lx, ly, R2);
        g2.addColorStop(0, 'rgba(0,229,255,' + (0.07 * i).toFixed(3) + ')');
        g2.addColorStop(1, 'rgba(0,229,255,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(lx - R2, ly - R2, R2 * 2, R2 * 2);
      }

      /* particelle: deriva, orbita attorno alla luce, brillano vicino al cursore */
      for (let n = 0; n < ps.length; n++) {
        const p = ps[n];
        let boost = 0;
        if (!reduced) {
          p.x += p.vx + Math.sin(ts * 0.00035 + p.ph) * 0.06;
          p.y += p.vy + Math.cos(ts * 0.00031 + p.ph * 1.3) * 0.06;
          const dx = lx - p.x, dy = ly - p.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          if (d < R) {
            boost = 1 - d / R;
            const pull = boost * 0.22;
            p.x += (dx / d) * pull + (-dy / d) * p.spin * boost * 0.30;
            p.y += (dy / d) * pull + (dx / d) * p.spin * boost * 0.30;
          }
          if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
          if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;
        }
        const a = Math.min(0.95, p.a * (1 + 1.8 * boost) * opts.intensity);
        if (a < 0.02) continue;
        ctx.beginPath();
        ctx.fillStyle = 'rgba(' + p.rgb + ',' + a.toFixed(3) + ')';
        ctx.arc(p.x, p.y, p.r * (1 + 0.7 * boost), 0, 6.2832);
        ctx.fill();
      }
    }

    function start() { if (!raf) raf = requestAnimationFrame(frame); }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function onVis() { if (document.hidden) stop(); else start(); }

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', resize);
    resize();
    start();

    /* ---------- API ---------- */
    return {
      destroy() {
        stop();
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('resize', resize);
        window.removeEventListener('pointermove', onPointer);
        window.removeEventListener('pointerdown', onPointer);
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      },
    };
  }

  function auto() {
    const els = document.querySelectorAll('[data-bgfx]');
    for (let n = 0; n < els.length; n++) {
      const v = parseFloat(els[n].getAttribute('data-bgfx'));
      attach(els[n], { intensity: isFinite(v) ? v : 1 });
    }
  }

  return { attach, auto };
})();
