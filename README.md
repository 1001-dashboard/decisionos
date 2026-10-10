# Decision OS · V1

Next.js 15 + Supabase + Claude API. Servita sotto il percorso `/decisionos` (`basePath`).

- `/decisionos`: presentazione con demo interattiva (caso Ibiza, dati dimostrativi calcolati dal vero motore).
- `/decisionos/login`: accesso.
- `/decisionos/app`: piattaforma con Panoramica, Decisioni, Connessioni, Scenari, Analista AI, Registro e Impostazioni.

## Struttura
| Percorso | Ruolo |
|---|---|
| `lib/engine.ts` | Motore deterministico: punteggi, vincoli, sensibilità, combinazioni, scenari, costi condivisi |
| `lib/report.ts` | Report a 6 sezioni, senza AI |
| `app/api/ai/route.ts` | Analista AI: struttura, dati, contraddittorio, punto di svolta, retrospettiva, collegamenti. Limite giornaliero di chiamate |
| `supabase/schema.sql` | Tabelle e Row Level Security |
| `tests/engine.test.ts` | `npm test` |

## 1. Supabase
1. Crea un progetto e apri **SQL Editor**. Incolla ed esegui `supabase/schema.sql`.
2. Vai in **Authentication → URL Configuration**:
   - Site URL: `https://danilorusciano.it/decisionos`
   - Redirect URLs: `https://danilorusciano.it/decisionos/auth/callback` e `https://TUO-PROGETTO.vercel.app/decisionos/auth/callback`
3. Vai in **Authentication → Users → Add user**. Crea il tuo utente con email e password e spunta "Auto confirm".
4. La piattaforma è privata. Vai in **Authentication → Sign In / Providers → Email** e disattiva "Allow new users to sign up".
5. In **Project Settings → API** copia `Project URL` e la chiave `anon public`.

## 2. Vercel
1. Carica la cartella su GitHub e poi fai **New Project → Import**, oppure usa `npx vercel` dalla cartella.
2. Imposta le **Environment Variables**:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ANTHROPIC_API_KEY=...
   ANTHROPIC_MODEL=claude-haiku-5-5   # facoltativo
   AI_DAILY_CALLS=60                  # facoltativo, tetto di spesa
   ```
3. Avvia il deploy. Verifica che funzioni su `https://TUO-PROGETTO.vercel.app/decisionos`.

## 3. Collegamento a danilorusciano.it/decisionos
Il metodo dipende da dove è ospitato il sito principale.

**Se danilorusciano.it è anche lui su Vercel**, aggiungi questo `vercel.json` nel progetto del sito principale:
```json
{
  "rewrites": [
    { "source": "/decisionos", "destination": "https://TUO-PROGETTO.vercel.app/decisionos" },
    { "source": "/decisionos/:path*", "destination": "https://TUO-PROGETTO.vercel.app/decisionos/:path*" }
  ]
}
```

**Se il sito è su un hosting Apache con `mod_proxy` attivo**, aggiungi al `.htaccess`:
```
RewriteEngine On
RewriteRule ^decisionos(/.*)?$ https://TUO-PROGETTO.vercel.app/decisionos$1 [P,L]
```
Molti hosting condivisi non abilitano `[P]`. In quel caso le alternative sono due:
- spostare il dominio su Vercel;
- usare Cloudflare davanti al dominio, con una regola che inoltra `/decisionos*` a Vercel.

## Sviluppo locale
```
cp .env.example .env.local   # compila i valori
npm install
npm run dev                  # http://localhost:3000/decisionos
npm test
```

## Note di progetto
- **Calcoli e AI sono separati.** L'AI interpreta e critica, i numeri li produce il motore. I valori proposti dall'AI vengono marcati come «stima».
- **Le analisi congelate (snapshots) non si sovrascrivono mai.** Il Registro le confronta con lo stato attuale.
- **Limiti V1:**
  - massimo 3 decisioni combinate, con al massimo 3 alternative ciascuna;
  - proiezione lineare a flusso costante;
  - nessuna probabilità sugli scenari.
- **Privacy:** RLS su ogni tabella. Le cifre economiche e il contesto personale vengono inviati all'AI solo se li abiliti. Puoi esportare tutto in JSON e cancellare tutto.
- **Grafiche:** il logo e l'icona sono quelli forniti, ritagliati in `public/brand/`. Le altre tavole (icone, dashboard, illustrazioni) sono state ricostruite in italiano con icone vettoriali e grafici SVG calcolati, così restano nitide, coerenti con la palette e con dati veri.
