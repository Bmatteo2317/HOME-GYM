# HOME-GYM — Calistenica a casa · Vercel + Neon

PWA multi-pagina (`public/`) + una singola Serverless API (`/api/workouts`) + Postgres su Neon.
Quattro miniapp (💪 Flessioni, 🔥 Addominali, ⏱️ Plank, 🧗 Trazioni) con streak, volumi, PR,
obiettivi giornalieri intelligenti, classifica globale (cloud) e stanze private tra amici.

## 1. Crea il database Neon

1. Vai su https://neon.tech → New Project (region vicina, es. EU West).
2. Apri **SQL Editor** e incolla il contenuto di `schema.sql` → Run.
   Crea le tabelle `workouts`, `profile`, `rooms`, `room_members` (sicuro da rieseguire).
3. Vai su **Connect** → copia la **pooled connection string**, es:
   `postgresql://user:pass@ep-xxx-pooler.eu-west-1.aws.neon.tech/dbname?sslmode=require`
   (quella *pooled* è importante: l'app usa il driver `pg` in serverless).

## 2. Deploy su Vercel

```bash
npm i -g vercel
vercel          # primo deploy (anteprima)
```

Poi imposta la variabile d'ambiente (oppure da Dashboard → Project → Settings → Environment Variables):

```bash
vercel env add DATABASE_URL production
# incolla la connection string di Neon
vercel --prod
```

Oppure da Dashboard Vercel:
- **Settings → Environment Variables** → `DATABASE_URL` = connection string Neon (tutti gli env: Production, Preview, Development).
- **Senza redeploy la variabile non viene applicata.**

## 3. Test locale

```bash
npm install
# crea .env da .env.example con la tua DATABASE_URL
vercel dev
# apri http://localhost:3000
```

## Struttura

```
public/                 → frontend servito alla radice (output directory Vercel)
  index.html            → Home: volume di oggi, griglia esercizi, stanze
  pushups.html          → Flessioni   (subtab: Inserisci · Stats · Obiettivi · Rank · Storico)
  abs.html              → Addominali
  plank.html            → Plank (in secondi)
  pullups.html          → Trazioni
  stats.html            → Statistiche generali dell'atleta
  profile.html          → Profilo: username, stato, obiettivo giornaliero
  rank.html             → Classifiche: tutti e 4 gli esercizi + filtro per variante
  app.js / app.css      → logica UX e stile condivisi (versione ?v=N per cache busting)
  sw.js                 → service worker (offline + installabile)
  manifest.webmanifest  → PWA
api/
  workouts.js           → tutte le API (/api/workouts?type=...) con client pg
schema.sql              → tabelle su Neon (workouts, profile, rooms, room_members)
vercel.json             → header per sw.js e manifest
```

## API (`/api/workouts`)

- `GET  /api/workouts` → tutte le serie (le pagine filtrano per username)
- `POST /api/workouts` body `{category, variant, amount, unit, date, username, country}` → singola serie
- `PATCH /api/workouts?id=N` body `{date:"YYYY-MM-DD"}` → sposta una serie (usato da ✏️ Data nello Storico)
- `DELETE /api/workouts?id=N` → cancella una serie
- `POST /api/workouts?type=day` body `{category, date, username, country, entries:[{variant, amount}]}` →
  salva l'intera giornata (sostituisce le serie di quella categoria/data; `entries: []` svuota la giornata)
- `GET/POST /api/workouts?type=profile` → profilo unico (id=1)
- `GET  /api/workouts?type=leaderboard&scope=global|country&country=&period=today|week|all&metric=volume|pr|streak&exercise=&room=` → top 50
- `GET  /api/workouts?type=rooms` · `POST type=rooms {name, exercise, username, country}` → crea stanza
- `POST /api/workouts?type=room_join {code, username, country}` · `GET type=room&code=` → stanza + membri
- `GET  /api/workouts?type=schema` → diagnostica (colonne reali, conteggi, ultime righe)

Il frontend mostra i dati cloud e, se `/api` non risponde, ripiega su `localStorage`
(avviso arancione in Home con il pulsante "Riprova").

## I dati non si salvano su Neon? Checklist

1. **`DATABASE_URL non configurata`** → Vercel Dashboard → Settings → Environment Variables →
   aggiungi `DATABASE_URL` (pooled di Neon) per Production + Preview + Development → **redeploy**.
2. **Tabella mancante** (`relation "workouts" does not exist`) → Neon Dashboard → SQL Editor →
   incolla `schema.sql` → Run.
3. **Stai aprendo i file HTML come `file://...`** → le `/api` non esistono: apri l'URL Vercel o `vercel dev`.
4. **Test rapido**: apri `https://TUO-APP.vercel.app/api/workouts?type=schema` — mostra se le tabelle
   esistono, quante righe ci sono e le ultime serie salvate.

## Note tecniche

- Il frontend usa `app.js?v=N`: **alza N in tutte le pagine HTML e in `CORE` di `sw.js` quando modifichi
  `app.js`** (e alza anche `CACHE` in `sw.js`), altrimenti il service worker può servire la versione vecchia.
- Il timer di recupero (30/60/90/120s) vive nella scheda Inserisci di ogni esercizio.
- Gli obiettivi giornalieri per esercizio sono **locali** (`localStorage: hg_goal_<categoria>`):
  Auto = mediana degli ultimi 7 giorni allenati +10%, oppure Manuale.
- La classifica usa solo `username` + `country` del Profilo: nessun dato personale extra.
