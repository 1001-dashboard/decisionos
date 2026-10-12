// Contesto personale («Cosa sa Decision OS di me»): elementi strutturati, confermati da te, usati in tutte le decisioni.
// Ingresso: un documento nel formato qui sotto (lo prepara ChatGPT/Claude/Gemini con il prompt CONTEXT_PROMPT) letto
// senza AI, oppure un testo libero estratto dall'Analista. Niente entra nel profilo finché non lo confermi.
import { redactMoney, hashOf, type Decision, type Crit, type Resources, type Opt } from "./engine.ts";

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
  /** ambiti che l'elemento riguarda (se assenti: riconosciuti dal testo); global = vale per ogni decisione (es. un limite di liquidità) */
  scope?: Scope[]; global?: boolean;
  /** cosa influenza (risorse e ambiti su cui pesa: es. un progetto influenza tempo e soldi) */
  affects?: Scope[];
  /** relazioni con altri elementi: lo studio «richiede» Roma Est, il nuovo lavoro «consuma» tempo… */
  links?: { to: string; rel: LinkRel }[];
  /** affidabilità, separata dallo stato: un elemento può essere confermato ma vecchio, o attivo ma incerto */
  conf?: "alta" | "media" | "bassa";
};

/* ---------- Ambiti e relazioni tra ambiti: il grafo minimo del contesto ---------- */
export type LinkRel = "influenza" | "consuma" | "richiede" | "dipende" | "riguarda";
export const LINK_L: Record<LinkRel, string> = { influenza: "influenza", consuma: "consuma", richiede: "richiede", dipende: "dipende da", riguarda: "riguarda" };
export type Scope = "soldi" | "tempo" | "casa" | "luogo" | "famiglia" | "lavoro" | "progetti" | "salute" | "formazione" | "relazioni";
export const SCOPE_L: Record<Scope, string> = { soldi: "soldi", tempo: "tempo", casa: "casa", luogo: "dove vivi", famiglia: "famiglia", lavoro: "lavoro", progetti: "progetti", salute: "salute", formazione: "formazione", relazioni: "relazioni" };
const SCOPE_RE: Record<Scope, RegExp> = {
  soldi: /liquid|risparm|reddit|stipend|soldi|€|\beur|capital|invest|affitt|mutuo|spes[ae]|cost[oi]|prezz|debit|nasp|ral\b|guadagn|margin|fattur|finanz|budget|entrat|netto/i,
  tempo: /\bore\b|tempo|settiman|disponibilit|weekend|orari|part.?time|full.?time|impegn/i,
  casa: /\bcasa|affitt|mutuo|propriet|abitaz|trasloc|appartament|alloggi/i,
  luogo: /\broma\b|milano|torino|napoli|bologna|firenze|ibiza|spagna|estero|citt[aà]|trasfer|vicino|zona|quartier|resid|fuori\b|monastero|torraccia|lontan/i,
  famiglia: /famigl|moglie|marito|figli|partner|asilo|genitor|madre|padre|sposat|bambin/i,
  lavoro: /lavor|ruolo|posizion|contratt|aziend|carrier|candidat|colloqu|manager|impieg|assunz|offert|dipendent/i,
  progetti: /progett|startup|piattaform|brand|lancio|prodotto/i,
  salute: /salut|medic|malatt|terap|benesser|sonno|stress/i,
  formazione: /master|corso|universit|formazion|certific|laurea|studiare/i,
  relazioni: /amic|collega|relazion|fiducia|rapport|conflitt/i,
};
/** Ambiti collegati: una scelta che tocca il primo spesso tocca anche gli altri (relazione indiretta). */
const SCOPE_NEXT: Record<Scope, Scope[]> = {
  lavoro: ["soldi", "tempo", "luogo"], casa: ["soldi", "luogo", "famiglia"], luogo: ["casa", "famiglia", "lavoro"], famiglia: ["tempo", "luogo"],
  progetti: ["tempo", "soldi"], soldi: [], tempo: ["progetti", "famiglia"], salute: ["tempo"], formazione: ["tempo", "soldi", "lavoro"], relazioni: [],
};
const TIPO_SCOPE: Record<string, Scope[]> = {
  lavoro: ["lavoro", "soldi"], casa: ["casa", "soldi", "luogo"], acquisto: ["soldi"], soldi: ["soldi"], progetto: ["progetti", "tempo", "soldi"], fornitore: ["soldi", "progetti"],
  persona: ["lavoro", "soldi"], auto: ["soldi"], studio: ["formazione", "tempo", "soldi"], famiglia: ["famiglia"], relazioni: ["relazioni"], morale: ["relazioni"], salute: ["salute"],
};
const RES_SCOPE: Record<string, Scope> = { cash0: "soldi", cash_m: "soldi", hours_w: "tempo" };
export const autoScope = (t: string): Scope[] => (Object.keys(SCOPE_RE) as Scope[]).filter((k) => SCOPE_RE[k].test(t));
export const scopesOf = (x: CtxItem): Scope[] => (x.scope?.length ? x.scope : [...new Set([...autoScope(x.t), ...(x.res ? [RES_SCOPE[x.res]] : []), ...(x.k === "progetto" ? ["progetti" as Scope] : [])])]);
/** soldi e tempo toccano quasi tutto: da soli non bastano a rendere pertinente un fatto o un progetto */
const GENERIC: Scope[] = ["soldi", "tempo"];
/** Ambiti di una decisione: dal tipo, dalle risorse che le strade consumano e dalle parole del racconto. */
export function decScopes(dec: Pick<Decision, "name" | "descr"> & { model?: Decision["model"] }): { direct: Scope[]; near: Scope[] } {
  const m = dec.model;
  const txt = [dec.name, dec.descr ?? "", ...(m?.options ?? []).map((o) => o.name), ...(m?.criteria ?? []).map((c) => c.name)].join(" ");
  const res = (m?.options ?? []).flatMap((o) => (o.impacts ?? []).map((i) => RES_SCOPE[i.r])).filter(Boolean) as Scope[];
  const direct = [...new Set([...(TIPO_SCOPE[m?.tipo ?? ""] ?? []), ...res, ...autoScope(txt)])];
  // le relazioni indirette partono solo dagli ambiti specifici: «soldi» e «tempo» toccano tutto e allargherebbero troppo
  const near = [...new Set(direct.filter((s) => s !== "soldi" && s !== "tempo").flatMap((s) => SCOPE_NEXT[s]))].filter((s) => !direct.includes(s));
  return { direct, near };
}

/* ---------- Prompt da dare a un altro assistente ---------- */
export const CONTEXT_PROMPT = `Preparami il mio profilo per Decision OS con tutto ciò che sai di me dalle nostre conversazioni.
Regole:
- Scrivi SOLO cose che ti ho detto io. Se una cosa è una tua deduzione o non sei sicuro, mettila in DA VERIFICARE.
- Una riga per elemento, breve e concreta. Niente commenti fuori dal formato.
- Indica [stabile] per ciò che vale a lungo (valori, competenze, famiglia) e [fase] per ciò che vale adesso (liquidità di oggi, urgenze, progetti in corso).
- Campi facoltativi dopo il simbolo |: n=numero unità · imp=1-5 (importanza) · data=AAAA-MM-GG (quando è stato detto) · fino=AAAA-MM-GG · risorsa=liquidita|mensile|ore · ambito=soldi,tempo,casa,luogo,famiglia,lavoro,progetti,salute,formazione,relazioni · globale (solo se vale per OGNI decisione, es. un limite di liquidità) · affidabilita=alta|media|bassa · sensibile
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
      if (/^global/.test(fl) || /vale per tutt/.test(fl)) { it.global = true; continue; }
      const am = f.match(/^ambit[oi]\s*=\s*(.+)$/i); if (am) { const sc = am[1].split(/[,;\s]+/).map((z) => norm(z)).filter((z) => z in SCOPE_RE) as Scope[]; if (sc.length) it.scope = sc; continue; }
      const cm = f.match(/^affidabilit[aà]\s*=\s*(alta|media|bassa)/i); if (cm) { it.conf = cm[1].toLowerCase() as CtxItem["conf"]; continue; }
      if (/privat/.test(fl)) { it.priv = true; continue; }
    }
    if (k === "incertezza" && !it.conf) it.conf = "bassa";
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
const STOP = new Set("il lo la i gli le un una uno di da in con su per tra fra e o ma se che non piu più mi ti si ci vi del della dei delle al alla ai agli nel nella sono essere ho hai ha abbiamo come anche solo molto poco questo questa quello quella mio mia miei mie suo sua oggi personale piattaforma decisione decisioni scelta scelte cosa fare vita voglio posso devo nata pensata diventare essere avere quanto quale quali quando dove perche perché devo dovrei potrei vorrei sarebbe decidere decido deciso scegliere scelgo".split(" "));
const toks = (s: string) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(" ").filter((w) => w.length > 3 && !STOP.has(w)).map((w) => w.slice(0, 6)));
const overlap = (a: Set<string>, b: Set<string>) => { let n = 0; for (const x of a) if (b.has(x)) n++; return n; };
const inter = <T,>(a: T[], b: T[]) => a.filter((x) => b.includes(x)).length;
/** Elementi utilizzabili: confermati e non scaduti. Una scadenza esplicita passata li toglie dall'uso finché non li riconfermi;
 *  i dati della fase attuale vecchi di 6 mesi restano usabili ma vengono segnalati. */
export const expired = (x: CtxItem, now = new Date().toISOString().slice(0, 10)) => !!x.until && x.until < now;
export const usable = (items: CtxItem[], now = new Date().toISOString().slice(0, 10)) => items.filter((x) => x.st === "confermato" && !expired(x, now));
const STRONG: CtxKind[] = ["vincolo", "regola", "risorsa", "valore", "obiettivo"];

export type CtxHit = { x: CtxItem; s: number; via: "globale" | "diretto" | "indiretto" | "parole" | "collegato"; from?: string; rel?: LinkRel };
/** Pertinenza a una decisione, in quest'ordine: vale per tutte (globale), stesso ambito (diretto), ambito collegato (indiretto),
 *  parole in comune; poi importanza e freschezza. Vincoli e regole non sono più sempre pertinenti: solo se globali o nello stesso ambito. */
export function rankCtx(items: CtxItem[], dec: Pick<Decision, "name" | "descr"> & { model?: Decision["model"] }, off: string[] = [], now = new Date().toISOString().slice(0, 10)): CtxHit[] {
  const txt = [dec.name, dec.descr ?? "", ...(dec.model?.options ?? []).map((o) => o.name), ...(dec.model?.criteria ?? []).map((c) => c.name)].join(" ");
  const tk = toks(txt);
  const { direct, near } = decScopes(dec);
  const out: CtxHit[] = [];
  const pool = usable(items, now).filter((x) => !off.includes(x.id));
  for (const x of pool) {
    const sc = [...new Set([...scopesOf(x), ...(x.affects ?? [])])];
    const d = inter(sc, direct), n = inter(sc, near), lex = overlap(toks(x.t), tk);
    const old = (x.until && x.until < now) || (x.layer === "fase" && x.dt && (Date.parse(now) - Date.parse(x.dt)) / 86400000 > 180);
    const strong = STRONG.includes(x.k);
    const spec = sc.filter((z) => !GENERIC.includes(z));
    const dS = inter(spec, direct), nS = inter(spec, near);
    const onlyGeneric = sc.length > 0 && !spec.length;
    let via: CtxHit["via"] | null = null;
    if (x.global) via = "globale";
    else if (strong) {
      // vincoli, regole, risorse, valori, obiettivi: stesso ambito specifico, oppure parole in comune, oppure un limite su soldi/tempo in una scelta che li tocca
      if (dS || lex) via = "diretto";
      else if (onlyGeneric && (d || n)) via = d ? "diretto" : "indiretto";
      else if (nS && ((x.imp ?? 3) >= 4 || x.k === "vincolo" || x.k === "risorsa")) via = "indiretto";
    } else {
      // fatti, progetti, persone, incertezze: servono parole in comune o più ambiti specifici
      if (lex >= 2 || (lex && d)) via = "parole";
      else if (dS >= 2) via = "diretto";
      else if (dS && nS && (x.k === "fatto" || x.k === "impegno")) via = "indiretto";
    }
    if (!via) continue;
    // un'altra decisione in sospeso è pertinente solo se ne parla davvero
    if (x.k === "decisione" && lex < 1) continue;
    const s = (x.global ? 6 : 0) + dS * 3 + (d - dS) + n + lex * 2 + (strong ? 1 : 0) + (x.imp ?? 0) / 5 + (x.layer === "fase" ? 0.5 : 0) - (old ? 1 : 0) - (x.conf === "bassa" ? 0.5 : 0);
    out.push({ x, s, via });
  }
  // relazioni esplicite: un elemento collegato a uno pertinente entra anche lui (un passo, nei due versi)
  const inn = new Map(out.map((h) => [h.x.id, h]));
  for (const h of [...out].sort((a, b) => b.s - a.s)) {
    const nb = [
      ...(h.x.links ?? []).map((l) => ({ id: l.to, rel: l.rel })),
      ...pool.filter((y) => (y.links ?? []).some((l) => l.to === h.x.id)).map((y) => ({ id: y.id, rel: (y.links ?? []).find((l) => l.to === h.x.id)!.rel })),
    ];
    for (const { id, rel } of nb) {
      if (inn.has(id)) continue;
      const y = pool.find((z) => z.id === id);
      if (!y || (y.k === "decisione")) continue;
      const hh: CtxHit = { x: y, s: h.s * 0.6, via: "collegato", from: h.x.t, rel };
      inn.set(id, hh); out.push(hh);
    }
  }
  return out.sort((a, b) => b.s - a.s);
}

/** Contesto per una richiesta all'AI, in un punto solo: senza consenso niente contesto personale né priorità.
 *  Restituisce i campi da passare a compact() (e lo stesso oggetto serve all'impronta che dice se un parere è ancora attuale). */
export function aiContext(items: CtxItem[], dec: Pick<Decision, "name" | "descr"> & { model?: Decision["model"] }, o: { consent: boolean; eco: boolean; profile?: Record<string, string> }): { ctx?: string; cx?: string[]; cxok?: boolean } {
  if (!o.consent) return {};
  const ctx = o.profile ? Object.entries(o.profile).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ") || undefined : undefined;
  return { ctx, cx: ctxForAi(relevantCtx(items, dec, 15, dec.model?.cxOff ?? []), o.eco), cxok: true };
}
export function relevantCtx(items: CtxItem[], dec: Pick<Decision, "name" | "descr"> & { model?: Decision["model"] }, limit = 15, off: string[] = []): CtxItem[] {
  return rankCtx(items, dec, off).slice(0, limit).map((h) => h.x);
}

/** Righe da inviare all'AI: niente elementi privati o sensibili; importi oscurati senza consenso. */
export function ctxForAi(items: CtxItem[], eco: boolean): string[] {
  return items.filter((x) => !x.priv && !x.sens).map((x) => `[${CTX_ONE[x.k]}${x.layer === "fase" ? ", oggi" : ""}] ${eco ? x.t : redactMoney(x.t)}${x.n != null && (eco || !/€|eur/i.test(x.u ?? "")) ? `: ${x.n}${x.u ? " " + x.u : ""}` : ""}${x.imp ? ` (importanza ${x.imp}/5)` : ""}${x.conf === "bassa" ? " (da verificare)" : ""}`);
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
      out.push({ crit: c.id, item: x, imp: x.imp, text: x.layer === "stabile"
        ? `Normalmente dai a «${x.t}» importanza ${x.imp}/5. In questa decisione vuoi partire da ${x.imp}/5?`
        : `In questa fase hai dichiarato «${x.t}» con importanza ${x.imp}/5: vuoi partire da ${x.imp}/5 anche qui?` });
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
  const conf = items.filter((x) => x.st === "confermato");
  const exp = conf.filter((x) => expired(x, now));
  if (exp.length) out.push(`${exp.length} ${exp.length === 1 ? "elemento è scaduto e non viene più usato" : "elementi sono scaduti e non vengono più usati"} finché non ${exp.length === 1 ? "lo riconfermi" : "li riconfermi"}: ${exp.slice(0, 3).map((x) => `«${x.t}»`).join(", ")}${exp.length > 3 ? "…" : ""}.`);
  const old = usable(items, now).filter((x) => x.layer === "fase" && x.dt && (Date.parse(now) - Date.parse(x.dt)) / 86400000 > 180);
  if (old.length) out.push(`${old.length} ${old.length === 1 ? "elemento della fase attuale non è aggiornato" : "elementi della fase attuale non sono aggiornati"} da oltre 6 mesi: ${old.slice(0, 3).map((x) => `«${x.t}»`).join(", ")}${old.length > 3 ? "…" : ""}. Vengono ancora usati: verificali.`);
  const pend = items.filter((x) => x.st === "proposto").length;
  if (pend) out.push(`${pend} ${pend === 1 ? "elemento importato aspetta" : "elementi importati aspettano"} la tua conferma: finché non li confermi non li uso.`);
  return out;
}

/** Elementi «risorsa» con un numero e una risorsa riconosciuta: possono aggiornare le tue risorse di partenza. */
export const resUpdates = (items: CtxItem[], res: Resources) => usable(items).filter((x) => x.k === "risorsa" && x.res && x.n != null && res[x.res] !== x.n);

/* ---------- Fotografia del contesto e aggiornamenti dopo una decisione ---------- */
/** Cosa sapeva Decision OS quando hai deciso: fra un anno potrai distinguere una cattiva decisione da una decisione giusta con le informazioni di allora. */
export function ctxSnapshot(items: CtxItem[], dec: Decision): { n: number; t: string[]; h: string } {
  const used = relevantCtx(items, dec, 15, dec.model.cxOff ?? []);
  return { n: used.length, t: used.map((x) => `[${CTX_ONE[x.k]}] ${x.t}`), h: ctxVersion(items) };
}
/** Versione del contesto: impronta degli elementi utilizzabili. Cambia se aggiungi, modifichi, superi o fai scadere qualcosa. */
export const ctxVersion = (items: CtxItem[]) => hashOf(usable(items).map((x) => `${x.k}|${x.t}|${x.n ?? ""}|${x.layer}`).sort());
/** Contesto da congelare nell'analisi: versione e solo gli elementi effettivamente usati, con il motivo per cui erano pertinenti. */
export function ctxFreeze(items: CtxItem[], dec: Decision): { version: string; items: { k: CtxKind; t: string; n?: number; u?: string; via: string; priv?: boolean }[] } {
  return { version: ctxVersion(items), items: rankCtx(items, dec, dec.model.cxOff ?? []).slice(0, 15).map((h) => ({ k: h.x.k, t: h.x.t, ...(h.x.n != null ? { n: h.x.n, u: h.x.u } : {}), via: h.via, ...(h.x.priv || h.x.sens ? { priv: true } : {}) })) };
}

export type CtxUpdate = { id: string; t: string; on: boolean } & ({ kind: "supera"; item: string } | { kind: "nuovo"; item: CtxItem });
/** Cosa la decisione presa ha insegnato al contesto. Mai applicato da solo: lo proponi tu, lo confermi tu. */
export function contextUpdates(items: CtxItem[], dec: Decision, ch: Opt, res: Resources = {}, now = new Date().toISOString().slice(0, 10)): CtxUpdate[] {
  const out: CtxUpdate[] = [];
  const tk = toks([dec.name, dec.descr ?? "", ch.name].join(" "));
  for (const x of usable(items).filter((y) => y.k === "decisione" && overlap(toks(y.t), tk) >= 1))
    out.push({ id: "s" + x.id, kind: "supera", item: x.id, t: `«${x.t}»: è stata decisa, non è più in sospeso`, on: true });
  const it = (k: CtxKind, t: string, extra: Partial<CtxItem> = {}): CtxItem => ({ id: nid(), k, t, layer: "fase", st: "confermato", src: `decisione «${dec.name}»`, dt: now, ...extra });
  out.push({ id: "f", kind: "nuovo", item: it("fatto", `Ho scelto «${ch.name}» (decisione «${dec.name}»)`), t: `Nuovo fatto: ho scelto «${ch.name}»`, on: true });
  const v = (r: string) => { const i = (ch.impacts ?? []).find((z) => z.r === r); return i == null ? null : Array.isArray(i.v) ? i.v[1] : i.v; };
  const h = v("hours_w");
  if (h) { const n = Math.max(0, (res.hours_w ?? 0) + h); out.push({ id: "h", kind: "nuovo", item: it("risorsa", `Ore libere a settimana dopo «${ch.name}»`, { n, u: "ore", res: "hours_w" }), t: `Ore libere a settimana: da ${res.hours_w ?? 0} a circa ${n}`, on: true }); }
  const m = v("cash_m");
  if (m) { const n = (res.cash_m ?? 0) + m; out.push({ id: "m", kind: "nuovo", item: it("risorsa", `Flusso mensile dopo «${ch.name}»`, { n, u: "€/mese", res: "cash_m" }), t: `Flusso mensile: da ${res.cash_m ?? 0} a circa ${n} €`, on: true }); }
  return out;
}
/** Applica gli aggiornamenti scelti: superati e nuovi elementi, confermati da te. */
export function applyUpdates(items: CtxItem[], ups: CtxUpdate[]): CtxItem[] {
  let out = items.map((x) => (ups.some((u) => u.on && u.kind === "supera" && u.item === x.id) ? { ...x, st: "superato" as const } : x));
  out = mergeCtx(out, ups.filter((u) => u.on && u.kind === "nuovo").map((u) => (u as { item: CtxItem }).item)).items;
  return out;
}
