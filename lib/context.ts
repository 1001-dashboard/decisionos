// Contesto personale («Cosa sa Decision OS di me»): elementi strutturati, confermati da te, usati in tutte le decisioni.
// Ingresso: un documento nel formato qui sotto (lo prepara ChatGPT/Claude/Gemini con il prompt CONTEXT_PROMPT) letto
// senza AI, oppure un testo libero estratto dall'Analista. Niente entra nel profilo finché non lo confermi.
import { redactMoney, type Decision, type Crit, type Resources } from "./engine.ts";

export type CtxKind = "fatto" | "risorsa" | "vincolo" | "obiettivo" | "valore" | "progetto" | "impegno" | "preferenza" | "incertezza" | "persona" | "regola" | "decisione";
export const CTX_L: Record<CtxKind, string> = {
  fatto: "Fatti", risorsa: "Risorse", vincolo: "Vincoli", obiettivo: "Obiettivi", valore: "Valori e priorità", progetto: "Progetti",
  impegno: "Impegni", preferenza: "Preferenze", incertezza: "Incertezze", persona: "Persone", regola: "Regole personali", decisione: "Decisioni in sospeso",
};
export const CTX_ONE: Record<CtxKind, string> = {
  fatto: "fatto", risorsa: "risorsa", vincolo: "vincolo", obiettivo: "obiettivo", valore: "valore", progetto: "progetto",
  impegno: "impegno", preferenza: "preferenza", incertezza: "incertezza", persona: "persona", regola: "regola", decisione: "decisione",
};
/** layer: stabile (valori, competenze, famiglia) o fase attuale (liquidità di oggi, urgenze, progetti aperti).
 *  st: proposto (da rivedere), confermato, superato («non è più vero»), escluso («non usare nelle decisioni»).
 *  priv: mai inviato all'AI (resta usabile dal motore). n/u: valore numerico e unità. res: risorsa a cui corrisponde (cash0, cash_m, hours_w).
 *  imp: importanza 1-5 per valori, obiettivi, preferenze. src/dt/until: fonte, data, validità. */
export type CtxItem = {
  id: string; k: CtxKind; t: string; layer: "stabile" | "fase"; st: "proposto" | "confermato" | "superato" | "escluso";
  priv?: boolean; sens?: boolean; n?: number; u?: string; res?: string; imp?: number; src?: string; dt?: string; until?: string;
};

/* ---------- Prompt da dare a un altro assistente ---------- */
export const CONTEXT_PROMPT = `Preparami il mio profilo per Decision OS con tutto ciò che sai di me dalle nostre conversazioni.
Regole:
- Scrivi SOLO cose che ti ho detto io. Se una cosa è una tua deduzione o non sei sicuro, mettila in DA VERIFICARE.
- Una riga per elemento, breve e concreta. Niente commenti fuori dal formato.
- Indica [stabile] per ciò che vale a lungo (valori, competenze, famiglia) e [fase] per ciò che vale adesso (liquidità di oggi, urgenze, progetti in corso).
- Campi facoltativi dopo il simbolo |: n=numero unità · imp=1-5 (importanza) · data=AAAA-MM-GG (quando è stato detto) · fino=AAAA-MM-GG · risorsa=liquidita|mensile|ore · sensibile
- Non inventare cifre: se non le conosci, non scriverle.

Formato esatto:
DECISION OS — CONTESTO PERSONALE
## FATTI
- [stabile] …
## RISORSE
- [fase] Liquidità disponibile | n=… € | risorsa=liquidita
## VINCOLI
- [fase] …
## OBIETTIVI
- [fase] … | imp=…
## VALORI E PRIORITÀ
- [stabile] … | imp=…
## PROGETTI
- [fase] …
## IMPEGNI
- [fase] …
## PREFERENZE
- [stabile] …
## PERSONE
- [stabile] …
## REGOLE PERSONALI
- [stabile] …
## DECISIONI IN SOSPESO
- [fase] …
## DA VERIFICARE
- [fase] …`;

/* ---------- Lettura del documento (senza AI) ---------- */
const SECTIONS: [RegExp, CtxKind][] = [
  [/regol/i, "regola"], [/decision/i, "decisione"], [/vincol|limit/i, "vincolo"], [/risors|patrimon|disponibilit/i, "risorsa"],
  [/obiettiv|goal/i, "obiettivo"], [/valor|priorit/i, "valore"], [/progett/i, "progetto"], [/impegn/i, "impegno"],
  [/preferen|professional/i, "preferenza"], [/incert|verific|rischi|fragil|dubb/i, "incertezza"], [/person|stakeholder/i, "persona"],
  [/fatt|identit|situazion|chi sono|anagraf/i, "fatto"],
];
const RES_MAP: Record<string, string> = { liquidita: "cash0", liquidità: "cash0", risparmi: "cash0", mensile: "cash_m", flusso: "cash_m", ore: "hours_w", tempo: "hours_w" };
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
let seq = 0;
const nid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Legge il documento nel formato del prompt. Tollerante: titoli simili, elenchi con - * • o numeri, campi in qualsiasi ordine. */
export function parseContext(text: string, src = "documento importato", today = new Date().toISOString().slice(0, 10)): CtxItem[] {
  const out: CtxItem[] = [];
  let k: CtxKind | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const isBullet = /^(?:[-*•]|\d+[.)])\s+/.test(line);
    if (!isBullet) {
      const title = line.replace(/^#+\s*/, "").replace(/[[\]:]/g, "").trim();
      if (/^#/.test(line) || (title.length <= 50 && (title === title.toUpperCase() || line.endsWith(":")))) {
        if (/contesto personale|decision os/i.test(title)) continue;
        const f = SECTIONS.find(([re]) => re.test(title));
        k = f ? f[1] : null;
      }
      continue;
    }
    const b = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (!b || !k) continue;
    let body = b[1];
    let layer: CtxItem["layer"] = k === "valore" || k === "preferenza" || k === "persona" || k === "fatto" || k === "regola" ? "stabile" : "fase";
    const lm = body.match(/^\[(stabile|fase|attuale)\]\s*/i);
    if (lm) { layer = /stabile/i.test(lm[1]) ? "stabile" : "fase"; body = body.slice(lm[0].length); }
    const [t0, ...fields] = body.split("|").map((x) => x.trim());
    const t = t0.replace(/\s+/g, " ").trim();
    if (!t || t === "…" || t.length < 3) continue;
    const it: CtxItem = { id: nid(), k, t: t.slice(0, 240), layer, st: "proposto", src, dt: today };
    for (const f of fields) {
      const fl = f.toLowerCase();
      const nm = f.match(/^n\s*=\s*(-?[\d.,']+)\s*(.*)$/i);
      if (nm) { const v = Number(nm[1].replace(/[.']/g, "").replace(",", ".")); if (Number.isFinite(v)) { it.n = v; if (nm[2]) it.u = nm[2].trim().slice(0, 16); } continue; }
      const im = f.match(/^imp\s*=\s*([1-5])/i); if (im) { it.imp = +im[1]; continue; }
      const dm = f.match(/^data\s*=\s*(\d{4}-\d{2}(?:-\d{2})?)/i); if (dm) { it.dt = dm[1].length === 7 ? dm[1] + "-01" : dm[1]; continue; }
      const um = f.match(/^fino\s*=\s*(\d{4}-\d{2}-\d{2})/i); if (um) { it.until = um[1]; continue; }
      const rm = f.match(/^risorsa\s*=\s*(\S+)/i); if (rm) { const r = RES_MAP[norm(rm[1])]; if (r) it.res = r; continue; }
      const sm = f.match(/^fonte\s*=\s*(.+)$/i); if (sm) { it.src = sm[1].slice(0, 60); continue; }
      if (/sensibil/.test(fl)) { it.sens = true; it.priv = true; continue; }
      if (/privat/.test(fl)) { it.priv = true; continue; }
    }
    out.push(it);
  }
  return out;
}

/** Elementi dall'Analista (testo libero): stessi controlli, sempre «proposti». */
export type AiCtx = { e?: { k?: string; t?: string; l?: string; n?: number; u?: string; imp?: number; s?: boolean; r?: string }[] };
export function ctxFromAi(x: AiCtx, src = "estratto dall'Analista", today = new Date().toISOString().slice(0, 10)): CtxItem[] {
  const K = Object.keys(CTX_L) as CtxKind[];
  return (Array.isArray(x?.e) ? x.e : []).filter((e) => e && typeof e.t === "string" && e.t.trim().length > 2 && K.includes(e.k as CtxKind)).slice(0, 120).map((e) => ({
    id: nid(), k: e.k as CtxKind, t: e.t!.trim().slice(0, 240), layer: e.l === "stabile" ? "stabile" : "fase", st: "proposto", src, dt: today,
    ...(typeof e.n === "number" && Number.isFinite(e.n) ? { n: e.n, ...(e.u ? { u: String(e.u).slice(0, 16) } : {}) } : {}),
    ...(typeof e.imp === "number" && e.imp >= 1 && e.imp <= 5 ? { imp: Math.round(e.imp) } : {}),
    ...(e.s ? { sens: true, priv: true } : {}),
    ...(e.r && RES_MAP[norm(e.r)] ? { res: RES_MAP[norm(e.r)] } : {}),
  }));
}

/** Unisce elementi nuovi a quelli che hai già: lo stesso testo non entra due volte. */
export function mergeCtx(cur: CtxItem[], add: CtxItem[]): { items: CtxItem[]; dup: number } {
  const seen = new Set(cur.map((x) => norm(x.t)));
  const fresh = add.filter((x) => { const n = norm(x.t); if (seen.has(n)) return false; seen.add(n); return true; });
  return { items: [...cur, ...fresh], dup: add.length - fresh.length };
}

export const countBy = (items: CtxItem[]) => (Object.keys(CTX_L) as CtxKind[]).map((k) => ({ k, n: items.filter((x) => x.k === k).length })).filter((x) => x.n);

/* ---------- Pertinenza: quali elementi riguardano questa decisione ---------- */
const STOP = new Set("il lo la i gli le un una uno di da in con su per tra fra e o ma se che non piu più mi ti si ci vi del della dei delle al alla ai agli nel nella sono essere ho hai ha abbiamo come anche solo molto poco questo questa quello quella mio mia miei mie suo sua oggi".split(" "));
const toks = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 6)));
const overlap = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };
/** Elementi utilizzabili: confermati, ancora veri, non esclusi. */
export const usable = (items: CtxItem[]) => items.filter((x) => x.st === "confermato");
const ALWAYS: CtxKind[] = ["vincolo", "regola"];

/** Elementi pertinenti a una decisione: parole in comune con titolo, racconto, strade e criteri; vincoli e regole sempre. */
export function relevantCtx(items: CtxItem[], dec: Pick<Decision, "name" | "descr"> & { model?: Decision["model"] }, limit = 15, off: string[] = []): CtxItem[] {
  const txt = [dec.name, dec.descr ?? "", ...(dec.model?.options ?? []).map((o) => o.name), ...(dec.model?.criteria ?? []).map((c) => c.name)].join(" ");
  const tk = toks(txt);
  const sc = usable(items).filter((x) => !off.includes(x.id)).map((x) => {
    const ov = overlap(toks(x.t), tk);
    return { x, s: ov * 3 + (ALWAYS.includes(x.k) ? 2 : 0) + (x.layer === "fase" ? 1 : 0) + (x.k === "risorsa" ? 1 : 0) };
  }).filter((y) => y.s >= 3 || ALWAYS.includes(y.x.k));
  return sc.sort((a, b) => b.s - a.s).slice(0, limit).map((y) => y.x);
}

/** Righe da inviare all'AI: niente elementi privati o sensibili; importi oscurati senza consenso. */
export function ctxForAi(items: CtxItem[], eco: boolean): string[] {
  return items.filter((x) => !x.priv && !x.sens).map((x) => `[${CTX_ONE[x.k]}${x.layer === "fase" ? ", oggi" : ""}] ${eco ? x.t : redactMoney(x.t)}${x.n != null && (eco || !/€|eur/i.test(x.u ?? "")) ? `: ${x.n}${x.u ? " " + x.u : ""}` : ""}${x.imp ? ` (importanza ${x.imp}/5)` : ""}`);
}

/* ---------- Suggerimenti sui pesi: il contesto propone, non decide ---------- */
export type CritHint = { crit: string; item: CtxItem; imp?: number; asConstraint?: boolean; text: string };
export function critHints(items: CtxItem[], crit: Crit[]): CritHint[] {
  const out: CritHint[] = [];
  const pool = usable(items).filter((x) => ["valore", "obiettivo", "preferenza", "vincolo", "regola"].includes(x.k));
  for (const c of crit) {
    const ct = toks(c.name + " " + (c.why ?? ""));
    const m = pool.map((x) => ({ x, ov: overlap(toks(x.t), ct) })).filter((y) => y.ov > 0).sort((a, b) => b.ov - a.ov)[0];
    if (!m) continue;
    const x = m.x;
    if (x.k === "vincolo" || x.k === "regola")
      out.push({ crit: c.id, item: x, asConstraint: true, text: `Nel tuo contesto «${x.t}» è un ${CTX_ONE[x.k]}: forse non va pesato come criterio ma messo come requisito non negoziabile.` });
    else if (x.imp && x.imp !== (c.imp ?? 3))
      out.push({ crit: c.id, item: x, imp: x.imp, text: `Dal tuo contesto «${x.t}» ha importanza ${x.imp}/5: vuoi partire da ${x.imp}/5?` });
  }
  return out;
}

/* ---------- Il tuo quadro attuale ---------- */
const RES_L: Record<string, string> = { cash0: "liquidità", cash_m: "flusso mensile", hours_w: "tempo disponibile" };
export function contextPicture(items: CtxItem[], decisions: Decision[], now = new Date().toISOString().slice(0, 10)): string[] {
  const out: string[] = [];
  const open = decisions.filter((d) => d.status === "aperta");
  // decisioni aperte che competono per la stessa risorsa
  for (const r of ["cash0", "cash_m", "hours_w"]) {
    const ds = open.filter((d) => d.model.options.some((o) => (o.impacts ?? []).some((i) => i.r === r && (Array.isArray(i.v) ? i.v[1] : i.v) < 0)));
    if (ds.length >= 2) out.push(`${ds.length} decisioni aperte consumano la stessa risorsa, ${RES_L[r]}: ${ds.map((d) => `«${d.name}»`).join(", ")}. Valutale insieme in Scenari.`);
  }
  // incertezze e progetti che toccano più decisioni
  for (const x of usable(items).filter((y) => y.k === "incertezza" || y.k === "progetto")) {
    const tk = toks(x.t);
    const ds = open.filter((d) => overlap(toks([d.name, d.descr ?? "", ...d.model.options.map((o) => o.name)].join(" ")), tk) >= 1);
    if (ds.length >= 2) out.push(`${x.k === "incertezza" ? "L'incertezza" : "Il progetto"} «${x.t}» tocca ${ds.length} decisioni aperte: ${ds.map((d) => `«${d.name}»`).join(", ")}.`);
  }
  // elementi da aggiornare
  const old = usable(items).filter((x) => (x.until && x.until < now) || (x.layer === "fase" && x.dt && (Date.parse(now) - Date.parse(x.dt)) / 86400000 > 180));
  if (old.length) out.push(`${old.length} ${old.length === 1 ? "elemento della fase attuale non è" : "elementi della fase attuale non sono"} aggiornati da oltre 6 mesi o sono scaduti: ${old.slice(0, 3).map((x) => `«${x.t}»`).join(", ")}${old.length > 3 ? "…" : ""}.`);
  const pend = items.filter((x) => x.st === "proposto").length;
  if (pend) out.push(`${pend} ${pend === 1 ? "elemento importato aspetta" : "elementi importati aspettano"} la tua conferma: finché non li confermi non li uso.`);
  return out;
}

/** Elementi «risorsa» con un numero e una risorsa riconosciuta: possono aggiornare le tue risorse di partenza. */
export const resUpdates = (items: CtxItem[], res: Resources) => usable(items).filter((x) => x.k === "risorsa" && x.res && x.n != null && res[x.res] !== x.n);
