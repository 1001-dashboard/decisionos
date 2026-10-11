/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse, type NextRequest } from "next/server";

export const maxDuration = 30;
import { sbServer } from "@/lib/supabase/server";
import { redactMoney } from "@/lib/engine";

/** Seconda barriera: se l'utente non ha abilitato le cifre economiche, nessun importo in € esce verso l'AI,
 *  qualunque cosa abbia inviato la pagina. */
function scrub(x: unknown): unknown {
  if (typeof x === "string") return redactMoney(x);
  if (Array.isArray(x)) return x.map(scrub);
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([k]) => !["im", "mi", "base"].includes(k)).map(([k, v]) => [k, scrub(v)]));
  return x;
}

// Analista AI. Il modello interpreta e critica; i numeri li calcola il motore lato client.
// Prompt compatti, chiavi JSON brevi, max_tokens bassi: costi contenuti.

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const GEMINI = process.env.GEMINI_MODEL || "gemini-flash-latest";
const CAP = Number(process.env.AI_DAILY_CALLS || 60);

const BASE = "Sei l'analista critico di Decision OS. Italiano, conciso, concreto. Mai confermare per compiacere. Non inventare fatti: se manca un dato dillo. Rispondi SOLO con JSON valido, nessun testo fuori.";

const P: Record<string, { s: string; max: number }> = {
  struttura: {
    max: 3600,
    s: `Prepara il quadro di una decisione dal racconto. NON dire mai cosa scegliere: suggerisci cosa guardare. JSON:
{"n":"titolo breve","k":"tipo di scelta: lavoro|casa|acquisto|soldi|progetto|relazioni|famiglia|salute|studio|morale|altro",
"x":"in 1 frase cosa conta poco in questa scelta e perché (es. per una scelta morale i soldi pesano poco), oppure vuoto",
"serve":true se mancano informazioni senza cui il quadro è fuorviante,
"q":["max 3 domande mirate, solo se servono"],
"a":[{"n":"strada","kd":"base|cond|prova|cerca","p":["pro concreti, max 3, brevi"],"m":["contro concreti, max 3, brevi"],"tl":[{"h":1|3|6|12 mesi,"a":"soldi|tempo|famiglia|lavoro|casa|progetti|rischi","t":"cosa succede concretamente"}],"nx":["decisione che questa strada costringe a prendere dopo"],"cd":[{"t":"condizione verificabile perché la strada abbia senso, con soglia se il racconto la dà","h":"azione concreta per verificarla","g":true se senza di essa la strada non ha senso}],"rk":[{"t":"rischio concreto di questa strada","p":"bassa|media|alta","c":perdita una tantum in € se succede (solo se il racconto dà le cifre),"m":perdita €/mese mentre dura (idem),"d":mesi di durata,"x":"come ridurlo, se possibile"}]}],
"c":[{"n":"criterio","y":"perché conta in questa scelta, 1 riga","t":"num se misurabile (soldi, tempo, km) altrimenti g","u":"unità se num, es. €/mese","p":valore pessimo se num,"o":valore ottimo se num,"i":importanza 1-5}],
"v":[{"c":"nome criterio","min":soglia,"max":soglia,"n":"vincolo non negoziabile detto dall'utente"}],
"s":[{"a":"alternativa","c":"criterio","v":valore reale se num oppure livello 0-4 se g,"y":"motivo breve"}],
"mi":[{"a":"alternativa","r":"cash0|cash_m|hours_w","v":[sfav,centr,fav],"t":"tag se costo una tantum condiviso"}],
"i":[{"t":"dato o ipotesi da verificare","k":"F|D|S|?","a":"alta|media|bassa"}]}
Regole: le alternative sono PIANI, non sì/no. Oltre alla strada base, includi se plausibili: la stessa solo a condizioni (kd cond), una prova a tempo con verifica e uscita (kd prova), la ricerca attiva di altro invece di stare fermi (kd cerca). Max 5 strade. Negoziare non è una strada: mettilo nelle azioni h delle condizioni. tl: 2-4 tappe per strada sulla vita reale (casa, famiglia, lavoro, tempo), non solo soldi. cd: 2-4 per strada, specifiche e verificabili; g true solo se la strada cade senza. nx: le decisioni successive che la strada genera. rk: 1-3 rischi reali per strada (cosa può andare storto, non lo scenario peggiore generico); importi c/m solo se ricavabili dai dati, altrimenti omettili. 3-5 criteri adatti al TIPO di scelta, niente doppioni; per scelte morali o relazionali usa giudizi su valori, effetti sulle persone, coerenza con sé, rimorso; criteri economici solo se contano davvero. Importanze: parti da pr (priorità utente 1-5, chiavi soldi, stabilita, crescita, indipendenza, benessere) e dalle risposte r; senza questi usa 3. Pro e contro: specifici del racconto più buon senso, sono spunti da verificare, mai inventare fatti. s solo se il racconto dà basi. Soglie vincoli: unità reali se num, livello 0-4 se g (0 pessimo, 4 ottimo). cash0 = una tantum € (negativo se spesa). cash_m = variazione €/mese netta RISPETTO A OGGI con questa strada (entrate nuove meno spese nuove, togliendo le entrate attuali solo se finiscono davvero). v di cash_m = [se va male, probabile, se va bene] della STESSA strada: costi più alti o entrate più basse ma realistici (es. affitto +20%), MAI un altro evento come perdere il lavoro o non essere pagato: quello è una strada o un rischio a parte. hours_w = ore/settimana consumate (negativo). k: F verificato, D dichiarato, S stima, ? mancante.`,
  },
  strade: {
    max: 2600,
    s: `Strade e conseguenze di una decisione esistente. Le scelte reali raramente sono sì/no: cerca le strade mancanti (solo a condizioni, prova a tempo con uscita, ricerca attiva di altro) e completa quelle esistenti. Non dire cosa scegliere. JSON:
{"x":"se le strade attuali sono un falso dilemma, perché in 1 frase, altrimenti vuoto",
"a":[{"n":"strada","kd":"base|cond|prova|cerca","p":["pro concreti, max 3, brevi"],"m":["contro concreti, max 3, brevi"],"tl":[{"h":1|3|6|12 mesi,"a":"soldi|tempo|famiglia|lavoro|casa|progetti|rischi","t":"cosa succede concretamente"}],"nx":["decisione che questa strada costringe a prendere dopo"],"cd":[{"t":"condizione verificabile perché la strada abbia senso, con soglia se il racconto la dà","h":"azione concreta per verificarla","g":true se senza di essa la strada non ha senso}],"rk":[{"t":"rischio concreto","p":"bassa|media|alta","c":perdita una tantum €,"m":perdita €/mese,"d":mesi,"x":"come ridurlo"}]}]}
Regole: ripeti le strade esistenti con lo stesso nome n per completarne tl, nx, cd; aggiungi max 3 strade nuove. Negoziare non è una strada: va nelle azioni h. tl sulla vita reale, non solo soldi. rk: 1-3 rischi reali per strada con come ridurli. Non inventare cifre: soglie e importi solo se presenti nei dati.`,
  },
  dati: { max: 900, s: `Analisi dei dati. Separa fatti verificati, dichiarati, stime, mancanti. Trova contraddizioni e cifre che non tornano. JSON {"p":["punto"],"c":"conclusione 1-2 frasi"}` },
  contro: { max: 900, s: `Contraddittorio. Dai il miglior argomento CONTRO l'alternativa in testa, verifica alternative ignorate, metti alla prova ipotesi e pesi. JSON {"p":["obiezione"],"c":"conclusione 1-2 frasi"}` },
  svolta: { max: 900, s: `Punto di svolta. Indica soglie concrete (cifre, condizioni contrattuali, date) che ribaltano la scelta, usando sensibilità e impatti forniti. JSON {"p":["se X scende sotto Y allora ..."],"c":"verifica prioritaria"}` },
  retro: { max: 900, s: `Valutazione retrospettiva. Confronta previsto e accaduto; distingui errore di ragionamento, dato sbagliato, evento imprevedibile. Non giudicare dalla sola fortuna dell'esito. JSON {"p":["punto"],"c":"lezione","k":"ragionamento|dato|imprevisto|nessuno"}` },
  link: { max: 700, s: `Proponi collegamenti tra opzioni di decisioni diverse (risorse condivise: soldi, tempo, residenza). Solo collegamenti reali. JSON {"d":[{"if":"idOpzione","excl":"idOpzione incompatibile"|null,"req":"idOpzione richiesta"|null,"why":"motivo"}]}` },
};

export async function POST(req: NextRequest) {
  const gkey = process.env.GEMINI_API_KEY, key = process.env.ANTHROPIC_API_KEY;
  if (!gkey && !key) return NextResponse.json({ e: "Nessuna chiave AI configurata su Vercel (GEMINI_API_KEY o ANTHROPIC_API_KEY)." }, { status: 500 });
  const s = await sbServer();
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.json({ e: "Non autenticato" }, { status: 401 });

  const { mode, payload } = await req.json().catch(() => ({}));
  const p = P[mode as string];
  if (!p || !payload) return NextResponse.json({ e: "Richiesta non valida" }, { status: 400 });
  // vale solo il consenso della richiesta corrente: la preferenza del profilo decide solo lo stato iniziale del toggle
  const eco = payload?.eco === true;
  const clean = eco ? payload : scrub(payload);
  if (clean && typeof clean === "object") delete (clean as Record<string, unknown>).eco;
  const body = JSON.stringify(clean);
  if (body.length > 24000) return NextResponse.json({ e: "Contenuto troppo lungo" }, { status: 413 });

  const day = new Date().toISOString().slice(0, 10);
  const { data: use } = await s.from("ai_usage").select("calls,tokens").eq("user_id", user.id).eq("day", day).maybeSingle();
  if ((use?.calls ?? 0) >= CAP) return NextResponse.json({ e: `Limite giornaliero di ${CAP} analisi raggiunto.` }, { status: 429 });

  const sys = `${BASE}\n${p.s}`;
  let txt = "", tok = 0;
  if (gkey) {
    // Gemini: piano gratuito con limiti di frequenza
    // fallback: se il modello è sovraccarico (503/429) riprova e poi passa al modello lite
    const models = [...new Set([GEMINI, "gemini-flash-lite-latest", "gemini-2.5-flash-lite"])];
    let j: any = null, last = "";
    outer: for (const m of models) {
      for (let k = 0; k < 2; k++) {
        const r = await fetch(`${process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com"}/v1beta/models/${m}:generateContent`, {
          method: "POST",
          headers: { "x-goog-api-key": gkey, "content-type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: sys }] },
            contents: [{ role: "user", parts: [{ text: body }] }],
            generationConfig: { maxOutputTokens: p.max * 4, responseMimeType: "application/json", temperature: 0.4 },
          }),
        });
        const x = await r.json().catch(() => ({}));
        if (r.ok) { j = x; break outer; }
        last = x?.error?.message || `Errore ${r.status}`;
        if (r.status === 404) break; // modello non disponibile: prova il successivo
        if (r.status !== 503 && r.status !== 429 && r.status !== 500) return NextResponse.json({ e: last }, { status: 502 });
        await new Promise((ok) => setTimeout(ok, 900 * (k + 1)));
      }
    }
    if (!j) return NextResponse.json({ e: "Gemini sovraccarico in questo momento, riprova tra un minuto." + (last ? ` (${last.slice(0, 80)})` : "") }, { status: 503 });
    txt = (j.candidates?.[0]?.content?.parts ?? []).map((c: { text?: string; thought?: boolean }) => (c.thought ? "" : c.text ?? "")).join("");
    tok = j.usageMetadata?.totalTokenCount ?? 0;
  } else {
    const r = await fetch(`${process.env.AI_BASE_URL || "https://api.anthropic.com"}/v1/messages`, {
      method: "POST",
      headers: { "x-api-key": key!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: MODEL, max_tokens: p.max,
        system: [{ type: "text", text: sys, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: body }],
      }),
    });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ e: j?.error?.message || "Errore AI" }, { status: 502 });
    txt = (j.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    tok = (j.usage?.input_tokens ?? 0) + (j.usage?.output_tokens ?? 0);
  }
  await s.from("ai_usage").upsert({ user_id: user.id, day, calls: (use?.calls ?? 0) + 1, tokens: (use?.tokens ?? 0) + tok });

  const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
  try {
    return NextResponse.json({ data: JSON.parse(txt.slice(a, b + 1)), tok });
  } catch {
    return NextResponse.json({ e: "Risposta AI non strutturata, riprova.", raw: txt.slice(0, 500) }, { status: 502 });
  }
}
