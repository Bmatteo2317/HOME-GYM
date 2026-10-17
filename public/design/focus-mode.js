/* HOME-GYM · Focus Mode — Schermata B «Allenamento Continuo Hands-Free»
   Design system Cyber-Athletic · zero dipendenze · vanilla JS
   ------------------------------------------------------------------------
   API:
     FocusMode.open({
       name:   'Plank',          // nome esercizio (header)
       mode:   'time' | 'reps',  // time: countdown (anello si svuota) · reps: contatore (anello si riempie)
       target: 60,               // secondi (time) oppure ripetizioni (reps)
       unit:   'SEC' | 'REPS',   // etichetta sotto la metrica
       rest:   30,               // secondi di recupero (overlay ciano)
       onSave: (txt) => {}       // callback a fine serie — in HOME-GYM: saveDay()/postEntry()
     });
     FocusMode.close();

   Feedback atleta a terra:
     · ultimi 5s → bip 880Hz + vibrazione 35ms ogni secondo
     · fine serie → doppio bip 1174/1568Hz + vibrazione [120,60,160]
     · fine recupero → doppio bip acuto 1568/2093Hz + vibrazione [80,40,80,40,160]
   Extra: Wake Lock (schermo sempre acceso), countdown su Date.now() (immune al throttling
   dei timer in background), tap sullo stage = ▶/⏸ (time) o +1 (reps), SPACE/Enter, ESC chiude.
   ------------------------------------------------------------------------ */
const FocusMode = (() => {
  'use strict';

  /* ---- geometria anello SVG (viewBox 220×220, r=92) ---- */
  const R = 92;
  const CIRC = 2 * Math.PI * R; // ≈ 578.05

  /* ---- stato ---- */
  let root = null;
  let cfg = null;
  let phase = 'idle';           // idle | running | paused | rest
  let raf = 0;
  let endAt = 0, remMs = 0, durMs = 0;
  let reps = 0, hitTarget = false;
  let lastCue = -1, restCue = -1;
  let restEndAt = 0, muted = false;
  let audio = null, lock = null;
  let bgHandle = null;

  const q = (sel) => root.querySelector(sel);
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return Math.floor(s / 60) + ':' + pad(s % 60); };

  /* ---------- feedback: bip + vibrazione ---------- */
  function ensureAudio() {
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch (e) { audio = null; }
  }
  function tone(freq, durS, delayS) {
    if (muted || !audio) return;
    try {
      const t0 = audio.currentTime + (delayS || 0);
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + durS);
      o.connect(g); g.connect(audio.destination);
      o.start(t0); o.stop(t0 + durS + 0.06);
    } catch (e) {}
  }
  function vib(pattern) {
    if (muted || !navigator.vibrate) return;
    try { navigator.vibrate(pattern); } catch (e) {}
  }
  const cueTick = () => { tone(880, 0.07); vib(35); };
  const cueDone = () => { tone(1174, 0.12); tone(1568, 0.16, 0.15); vib([120, 60, 160]); };
  const cueGo = () => { tone(1568, 0.12); tone(2093, 0.15, 0.13); vib([80, 40, 80, 40, 160]); };

  /* ---------- wake lock: schermo sempre acceso ---------- */
  async function lockOn() {
    try { if ('wakeLock' in navigator && !lock) lock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function lockOff() { try { if (lock) lock.release(); } catch (e) {} lock = null; }

  /* ---------- aggiornamento visivo ---------- */
  function setRing(p) {
    const c = q('#fxProg');
    c.style.strokeDasharray = CIRC.toFixed(1);
    c.style.strokeDashoffset = (CIRC * (1 - Math.max(0, Math.min(1, p)))).toFixed(1);
  }
  function flash() {
    const f = q('#fxFlash');
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 240);
  }
  function render() {
    const ov = q('#fxOverlay');
    q('#fxName').textContent = cfg.name;
    ov.classList.toggle('running', phase === 'running');
    q('#fxRest').hidden = phase !== 'rest';
    const restTxt = 'Recupero ' + cfg.rest + 's';
    if (cfg.mode === 'time') {
      q('#fxTarget').textContent = 'Obiettivo ' + fmt(durMs) + ' · ' + restTxt;
      q('#fxUnit').textContent = 'SEC';
      q('#fxMetric').textContent = fmt(phase === 'idle' ? durMs : remMs);
      setRing(phase === 'idle' ? 1 : remMs / durMs);
      q('#fxA').textContent = '↺';
      q('#fxB').textContent = phase === 'running' ? '⏸' : '▶';
      q('#fxC').textContent = '✓';
      q('#fxHint').textContent = phase === 'idle'
        ? 'Tocca ▶ (o premi SPACE) per avviare'
        : phase === 'running'
          ? 'Respira. Bip negli ultimi 5 secondi 🔊'
          : phase === 'paused'
            ? 'In pausa — tocca ▶ per riprendere'
            : 'Recupero in corso…';
    } else {
      q('#fxTarget').textContent = 'Obiettivo ' + cfg.target + ' reps · ' + restTxt;
      q('#fxUnit').textContent = 'REPS';
      q('#fxMetric').textContent = String(reps);
      setRing(cfg.target ? reps / cfg.target : 0);
      q('#fxA').textContent = '−1';
      q('#fxB').textContent = '+1';
      q('#fxC').textContent = '✓';
      q('#fxHint').textContent = hitTarget
        ? '🎯 Obiettivo raggiunto! Continua o chiudi la serie con ✓'
        : 'Segna ogni ripetizione: +1 (anche col palmo)';
    }
  }

  /* ---------- modalità tempo ---------- */
  function tStart() {
    if (phase === 'running' || phase === 'rest') return;
    ensureAudio();
    if (phase === 'idle') { remMs = durMs; lastCue = -1; }
    phase = 'running';
    endAt = Date.now() + remMs;
    lockOn();
    render();
    raf = requestAnimationFrame(tick);
  }
  function tPause() {
    if (phase !== 'running') return;
    remMs = Math.max(0, endAt - Date.now());
    cancelAnimationFrame(raf); raf = 0;
    phase = 'paused';
    render();
  }
  function tReset() {
    if (phase === 'rest') return;
    cancelAnimationFrame(raf); raf = 0;
    phase = 'idle'; remMs = durMs; lastCue = -1;
    render();
  }
  function tick() {
    const rem = endAt - Date.now();
    if (rem <= 0) { remMs = 0; q('#fxMetric').textContent = '0:00'; setRing(0); finishSet(true); return; }
    remMs = rem;
    q('#fxMetric').textContent = fmt(rem);
    setRing(rem / durMs);
    const s = Math.ceil(rem / 1000);
    if (s <= 5 && s !== lastCue) { lastCue = s; cueTick(); }
    raf = requestAnimationFrame(tick);
  }

  /* ---------- modalità reps ---------- */
  function addRep(d) {
    if (phase === 'rest') return;
    ensureAudio();
    reps = Math.max(0, reps + d);
    if (d > 0 && reps >= cfg.target && !hitTarget) { hitTarget = true; cueDone(); flash(); q('#fxOverlay').classList.add('done'); }
    if (reps < cfg.target && hitTarget) { hitTarget = false; q('#fxOverlay').classList.remove('done'); }
    render();
    vib(12);
  }

  /* ---------- chiusura serie + recupero ---------- */
  function finishSet(auto) {
    if (phase === 'rest') return;
    if (cfg.mode === 'time') {
      const elapsed = durMs - (auto ? 0 : phase === 'running' ? Math.max(0, endAt - Date.now()) : remMs);
      if (phase === 'idle' && !auto) { q('#fxHint').textContent = '▶ Avvia il timer prima di salvare'; return; }
      if (elapsed < 2000 && !auto) { q('#fxHint').textContent = 'Serie troppo corta — continua!'; return; }
      goRest(fmt(elapsed));
    } else {
      if (!reps) { q('#fxHint').textContent = '+1 prima di salvare la serie'; return; }
      goRest(reps + ' reps');
    }
  }
  function goRest(txt) {
    cancelAnimationFrame(raf); raf = 0;
    phase = 'rest';
    q('#fxOverlay').classList.add('done');
    q('#fxSaved').textContent = '✓ Serie salvata · ' + txt;
    cueDone(); flash();
    if (typeof cfg.onSave === 'function') { try { cfg.onSave(txt); } catch (e) {} }
    restEndAt = Date.now() + cfg.rest * 1000;
    restCue = -1;
    render();
    lockOn();
    raf = requestAnimationFrame(restTick);
  }
  function restTick() {
    const rem = restEndAt - Date.now();
    if (rem <= 0) { endRest(); return; }
    q('#fxRestNum').textContent = fmt(rem);
    const s = Math.ceil(rem / 1000);
    if (s <= 3 && s !== restCue) { restCue = s; cueTick(); }
    raf = requestAnimationFrame(restTick);
  }
  function endRest() {
    cancelAnimationFrame(raf); raf = 0;
    q('#fxRest').hidden = true;
    cueGo();
    resetSeries();
    render();
  }
  function resetSeries() {
    phase = 'idle'; hitTarget = false;
    q('#fxOverlay').classList.remove('done');
    if (cfg.mode === 'time') { remMs = durMs; lastCue = -1; } else { reps = 0; }
  }

  /* ---------- input tastiera ---------- */
  function onKey(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (phase === 'rest') return;
      if (cfg.mode === 'time') { phase === 'running' ? tPause() : tStart(); } else { addRep(1); }
    }
  }
  function onVis() { if (document.visibilityState === 'visible' && phase !== 'idle') lockOn(); }

  /* ---------- markup ---------- */
  function build() {
    root = document.createElement('div');
    root.id = 'fxRoot';
    root.innerHTML = `
      <div class="fx-overlay" id="fxOverlay" role="dialog" aria-modal="true" aria-label="Modalità allenamento">
        <div class="fx-top">
          <button class="fx-x" id="fxClose" aria-label="Chiudi">✕</button>
          <div class="fx-head"><b id="fxName">—</b><span class="fx-sub" id="fxTarget">—</span></div>
          <button class="fx-x" id="fxMute" aria-label="Attiva/disattiva audio">🔊</button>
        </div>
        <div class="fx-stage" id="fxStage">
          <svg class="fx-ring" viewBox="0 0 220 220" aria-hidden="true">
            <circle class="fx-ring-track" cx="110" cy="110" r="92"></circle>
            <circle class="fx-ring-prog" id="fxProg" cx="110" cy="110" r="92"></circle>
          </svg>
          <div class="fx-center">
            <div class="fx-metric" id="fxMetric">0:00</div>
            <div class="fx-unit" id="fxUnit">SEC</div>
          </div>
        </div>
        <p class="fx-hint" id="fxHint"></p>
        <div class="fx-controls">
          <button class="fx-cbtn" id="fxA" aria-label="Reimposta / meno">↺</button>
          <button class="fx-cbtn fx-cbtn-main" id="fxB" aria-label="Via / più">▶</button>
          <button class="fx-cbtn" id="fxC" aria-label="Chiudi serie">✓</button>
        </div>
        <p class="fx-saved" id="fxSaved"></p>
        <div class="fx-rest" id="fxRest" hidden>
          <p class="fx-rest-lab">Recupero</p>
          <div class="fx-rest-num" id="fxRestNum">0:30</div>
          <button class="btn ghost fx-skip" id="fxSkip">⏭ Salta recupero</button>
        </div>
        <div class="fx-flash" id="fxFlash"></div>
      </div>`;
    document.body.appendChild(root);

    /* background vivo (se bg-fx.js è caricato): luce + particelle dentro l'overlay */
    const bg = (typeof BgFX !== 'undefined') ? BgFX : null;
    bgHandle = bg ? bg.attach(q('#fxOverlay'), { intensity: 0.5, density: 0.6, zIndex: 3, radius: 340 }) : null;

    q('#fxClose').onclick = (e) => { e.stopPropagation(); close(); };
    q('#fxMute').onclick = (e) => {
      e.stopPropagation();
      muted = !muted;
      q('#fxMute').textContent = muted ? '🔇' : '🔊';
    };
    q('#fxSkip').onclick = (e) => { e.stopPropagation(); endRest(); };
    q('#fxA').onclick = (e) => {
      e.stopPropagation();
      if (cfg.mode === 'time') { tReset(); } else { addRep(-1); }
    };
    q('#fxB').onclick = (e) => {
      e.stopPropagation();
      if (cfg.mode === 'time') { phase === 'running' ? tPause() : tStart(); } else { addRep(1); }
    };
    q('#fxC').onclick = (e) => { e.stopPropagation(); finishSet(false); };
    q('#fxStage').onclick = (e) => {
      e.stopPropagation();
      if (phase === 'rest') return;
      if (cfg.mode === 'time') { phase === 'running' ? tPause() : tStart(); } else { addRep(1); }
    };
  }

  /* ---------- API pubblica ---------- */
  function open(options) {
    if (root) close();
    cfg = Object.assign({ name: 'Esercizio', mode: 'reps', target: 20, unit: 'REPS', rest: 30, onSave: null }, options || {});
    durMs = cfg.mode === 'time' ? Math.max(5, Number(cfg.target) || 60) * 1000 : 0;
    reps = 0; hitTarget = false; muted = false;
    phase = 'idle'; remMs = durMs; lastCue = -1;
    build();
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    lockOn();
    render();
  }
  function close() {
    cancelAnimationFrame(raf); raf = 0;
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    document.body.style.overflow = '';
    lockOff();
    if (bgHandle) { bgHandle.destroy(); bgHandle = null; }
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null; cfg = null; phase = 'idle';
  }

  return { open, close };
})();
