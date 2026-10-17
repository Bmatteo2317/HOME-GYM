# HOME-GYM · Design System «Cyber-Athletic»

Linee guida UI/UX per l'app di calistenics (Push-up, Trazioni, Plank, Addominali).
Stile: **high-contrast, dark mode nativa, orientata alla performance**. L'interfaccia
deve essere leggibile **a 2 metri di distanza** (atleta a terra che fa plank/push-up).

> File operativi: `public/design/` — `tokens.css`, `components.css`, `focus.css`, `focus-mode.js`, `bg-fx.js`, `focus-demo.html`
> Demo live (dopo il deploy): `/design/focus-demo.html` · in locale: aprire il file direttamente nel browser.

---

## 1. Design tokens (palette ufficiale)

| Token | HEX | Uso |
|---|---|---|
| `--bg-0` | `#0D0E12` | Background primario (nero profondo) |
| `--bg-1` | `#1A1C24` | Card / contenitori (antracite) |
| `--bg-2` | `#22252E` | Contenitori annidati, hover |
| `--volt` | `#CCFF00` | Giallo neon: azioni, progresso, focus, bordi attivi |
| `--cyan` | `#00E5FF` | Ciano elettrico: timer completati, record, recupero |
| `--text-0` | `#FFFFFF` | Titoli e metriche |
| `--text-1` | `#8F95A3` | Etichette, unità, descrizioni |

Contrasto verificato su `#0D0E12`: Volt ≈ **16:1**, Ciano ≈ **11:1**, secondario ≈ **6.4:1** (tutti ≥ AA).

### Tipografia
- Font: **Inter** (fallback: Roboto Flex / Montserrat / system-ui). Self-host consigliato per la PWA offline.
- Metriche/timer: peso **900 (Black)**, `letter-spacing: -.03em`, **`font-variant-numeric: tabular-nums`** (le cifre non "ballano").
- Dimensione metrica: `clamp(84px, 27vw, 168px)` → ≥72pt sui telefoni.
- Gerarchia: H1 26/900 · H2 20/800 · body 15/400 · label 11/700 uppercase `+.12em`.

### Geometria e motion
- Raggio fisso **12px** per card e pulsanti; pill `999px`; griglia spazi 4/8/12/16/24.
- Target tocco minimo **44px** (componente Focus: 76px per gli atleti a terra).
- Glow neon: `box-shadow: 0 0 24px` con accento al 35% di alpha. Transizioni 140–260ms, easing `(.2,.8,.2,1)`.
- `prefers-reduced-motion`: disattivare pulse e transizioni.

---

## 2. Struttura della cartella componenti (come è organizzata)

```
public/design/
├── tokens.css       # 1. Variabili: colori, tipografia, geometria, motion — sorgente unica
├── components.css   # 2. Componenti base riusabili (card, btn, chip, kpi, icone)
├── focus.css        # 3. Stile della Schermata B (Focus Mode)
├── focus-mode.js    # 4. Logica della Schermata B (componente autonomo, API FocusMode.open)
├── bg-fx.js         # 5. Background vivo: particelle + luce che segue il puntatore
└── focus-demo.html  # 6. Pagina d'esempio + test su telefono
```

Passo-passo:
1. **tokens.css per primo**: ogni altro file usa SOLO `var(--…)`, mai HEX diretti. Cambiare tema = toccare un solo file.
2. **components.css**: elementi generici senza logica (`.card`, `.btn.volt`, `.chip`, `.kpi`, `.icon`). Riusabili in tutte le schermate.
3. **Un file CSS per schermata complessa** (`focus.css`): evita collisioni e si carica solo dove serve.
4. **Un file JS per componente** con API esplicita (`focus-mode.js` → `FocusMode.open({...})` / `.close()`, `bg-fx.js` → `BgFX.attach(el)`): quando si integra nell'app basta una chiamata, e in futuro si può chiamare `saveDay()` dentro `onSave`.
5. **focus-demo.html**: pagina di prova isolata (foglio di lavoro del designer). Serve a validare su telefono senza toccare l'app reale.
6. **Integrazione nell'app** (prossimo passo): linkare i 3 CSS nelle pagine, aggiungere `focus-mode.js`, aprire il Focus dal pulsante timer. Allora sì: bump `?v=N` delle pagine + `CACHE`/`CORE` in `sw.js`, come da convenzione del repo.

---

## 3. Schermate chiave

### Schermata A — Dashboard selezione esercizi
- Lista verticale di card `#1A1C24`, una per esercizio, raggio 12px.
- Contenuto card: icona **vettoriale a contorno bianco** (mai emoji nelle card ufficiali), nome in grassetto `#FFFFFF`, riga record in `#8F95A3` (`RAGGIUNTO: 25 reps` / `3:00 min`).
- Stato hover/focus: **bordo 1px `#CCFF00`** (`.card:hover` / `:focus-within` in `components.css`).

```html
<a class="card" href="pushups.html" style="display:flex;align-items:center;gap:12px">
  <svg class="icon" viewBox="0 0 24 24"><path d="M3 18h18"/><path d="M7 12v6"/><path d="M17 12v6"/><path d="M7 12h10"/></svg>
  <div style="flex:1"><b>Push-up</b><div class="last">RAGGIUNTO: 25 reps</div></div>
</a>
```

### Schermata B — Focus Mode (Allenamento continuo hands-free)
Implementata in `focus.css` + `focus-mode.js`. Specifiche:
- **Fullscreen** senza barre; metrica centrale ≥72pt bianca, `tabular-nums`.
- **Anello SVG** (stroke 10, linecap round): riempimento orario in `#CCFF00`. Tempo (Plank): l'anello **si svuota**; reps: **si riempie** verso l'obiettivo. A serie completata → **Ciano**.
- **Recupero**: overlay soffuso `rgba(0,229,255,.10)` + blur, countdown gigante `#00E5FF` con glow, pulsante "Salta".
- **Comandi**: 3 pulsanti circolari 76px (reset/play/chiudi serie; in modalità reps: −1 / +1 / ✓). Intero stage tappabile (▶/⏸ o +1). Tastiera: `SPACE`, `ESC`.
- **Wake Lock**: schermo sempre acceso durante la sessione (dove supportato).
- Countdown calcolato su `Date.now()` (immune al throttling dei timer in background), mai a tick decrementali.

Matematica dell'anello (snippet chiave):
```js
const R = 92, CIRC = 2 * Math.PI * R;              // viewBox 220×220
ring.style.strokeDasharray  = CIRC;                 // ≈ 578.05
ring.style.strokeDashoffset = CIRC * (1 - progress); // progress 0→1 = riempimento orario
```

### Schermata C — Riepilogo e statistiche
- Grafici a linea minimale, stroke **gradiente `#CCFF00 → #00E5FF`** (3px, linecap round), area sottostante stessa gradiente a **opacità 10%**.
- Assi/label in `#8F95A3` 11px; nessuna griglia pesante.

```html
<svg viewBox="0 0 300 120">
  <defs>
    <linearGradient id="cg" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#CCFF00"/><stop offset="1" stop-color="#00E5FF"/>
    </linearGradient>
  </defs>
  <path d="M0 100 L60 80 L120 84 L180 50 L240 55 L300 20" fill="none" stroke="url(#cg)" stroke-width="3" stroke-linecap="round"/>
  <path d="M0 100 L60 80 L120 84 L180 50 L240 55 L300 20 L300 120 L0 120 Z" fill="url(#cg)" opacity="0.1"/>
</svg>
```

---

## 4. Background vivo — particelle + luce (`bg-fx.js`)

Lo sfondo non è mai "solo nero": un canvas dedicato disegna **puntini bianchi** (`#FFFFFF`) e una **luce bianca soffusa, molto debole**, che segue il puntatore (mouse o dito) con inerzia morbida. Le particelle vicine alla luce si illuminano, l'accelerano e le orbitano intorno; senza input per 3 secondi la luce **deriva da sola** (lissajous lenta), quindi anche su mobile lo sfondo è vivo. Si ferma a tab nascosta e rispetta `prefers-reduced-motion` (particelle ferme, niente derive).

Attivazione (due righe, in qualsiasi pagina):
```html
<script src="/design/bg-fx.js"></script>
<script>BgFX.attach(document.body, { intensity: 1, density: 1 });</script>
```

- Su un contenitore: `BgFX.attach('#fxOverlay', { intensity: 0.5, zIndex: 3 })` — **già attivo nel Focus Mode** (intensità ridotta per non disturbare la lettura a 2 metri).
- Automatico: `BgFX.auto()` attiva tutti gli elementi con `data-bgfx="0.8"`.
- Opzioni: `intensity` 0–1 · `density` 0.2–2 · `zIndex` · `radius` (raggio luce px). Restituisce `{ destroy() }`.
- Performance: dpr max 2, max 150 particelle, `pointer-events:none`, pausa in background — l'effetto non tocca mai i click.

---

## 5. UX & accessibilità (atleta a terra)

| Momento | Audio (WebAudio, square) | Vibrazione (`navigator.vibrate`) |
|---|---|---|
| Ultimi 5 s (ogni secondo) | bip 880 Hz, 70 ms | `35` ms |
| Fine serie | 1174 Hz + 1568 Hz (doppio) | `[120, 60, 160]` |
| Fine recupero | 1568 Hz + 2093 Hz (doppio acuto) | `[80, 40, 80, 40, 160]` |

- **iOS**: `navigator.vibrate` non esiste (fallback: flash visivo + bip). L'`AudioContext` parte solo dopo un gesto utente → `ensureAudio()` alla prima pressione (già gestito in `focus-mode.js`).
- **Wake Lock**: supportato su Chrome/Android e iOS ≥16.4. Rilasciato alla chiusura; riacquisito al `visibilitychange`.
- **Pulsante 🔊/🔇** in alto a destra: modalità silenziosa per allenarsi di notte.
- Ogni feedback è **ridondante** (audio + vibrazione + visivo): chi non sente vede, chi non guarda sente.

### Nota di migrazione dai token attuali dell'app
L'app oggi usa liquid-glass (`--bg0:#04060c`, lime `#a3e635`, cyan `#38bdf8`, raggio 18px).
Il nuovo sistema è **più piatto, più contrastato, più "tecnico"** (12px, `#CCFF00`/`#00E5FF`).
La migrazione definitiva di `app.css` ai nuovi token è un passo dedicato (una PR "reskin") da fare
con calma dopo aver validato il Focus Mode su telefono — i due sistemi possono convivere.
