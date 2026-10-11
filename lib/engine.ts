// Decision OS - motore deterministico. Nessuna AI qui: risultati ripetibili e ricostruibili.

export type Rel = "F" | "D" | "S" | "?";
/** kind: "num" = valore reale (es. €/mese) convertito su scala pessimo→ottimo; "g" = giudizio 5 livelli; assente = punteggio 0-100. */
export type Crit = {
  id: string; name: string; w: number; group?: string; lo?: string; hi?: string;
  kind?: "num" | "g"; unit?: string; worst?: number | null; best?: number | null; imp?: number;
  why?: string;   // perché conta (proposto dall'Analista o scritto da te)
};
export type Constraint = { id: string; name: string; crit: string; min?: number | null; max?: number | null };
/** src: chi ha messo il valore. "ai" = stima dell'Analista non ancora confermata da te. */
export type Impact = { r: string; v: number | [number, number, number]; tag?: string; src?: "ai" | "user" | "conti" };
/** Voce dei conti. k: e = entrata, s = spesa. v = importo probabile (positivo); lo/hi = caso peggiore/migliore (facoltativi).
 *  u: true = una tantum. f: D = detto da te, S = stima (AI o tua), F = verificato. from = voce copiata dai conti di oggi. */
export type Line = { id: string; t: string; k: "e" | "s"; v?: number | null; lo?: number | null; hi?: number | null; u?: boolean; f?: "D" | "S" | "F"; src?: "ai" | "user"; from?: string; note?: string };
export type Meta = { why?: string; rel?: Rel; src?: string; dt?: string };
/** Una tappa di «cosa succede dopo» se scegli questa strada. h = mesi (1 = entro 30 giorni). */
/** Area di una conseguenza: libera, proposta per tipo di scelta (soldi, clienti, salute…). */
export type Area = string;
export const AREAS: Area[] = ["soldi", "tempo", "famiglia", "lavoro", "casa", "progetti", "rischi"];
/** Aree predefinite per tipo di scelta: il dominio è un input, non è scritto nel motore. */
export const AREA_SETS: Record<string, Area[]> = {
  persona: ["soldi", "tempo", "famiglia", "lavoro", "casa", "benessere", "rischi"],
  impresa: ["soldi", "tempo", "clienti", "qualità", "team", "operatività", "reputazione", "rischi"],
  denaro: ["soldi", "sicurezza", "flessibilità", "tempo", "rischi"],
  valori: ["relazioni", "coerenza", "benessere", "reputazione", "rischi"],
  crescita: ["soldi", "tempo", "carriera", "benessere", "vita privata", "rischi"],
  generale: ["soldi", "tempo", "persone", "lavoro", "benessere", "rischi"],
};
const TIPO_AREAS: Record<string, string> = { lavoro: "persona", casa: "persona", famiglia: "persona", salute: "persona", progetto: "impresa", acquisto: "impresa", fornitore: "impresa", persona: "impresa", soldi: "denaro", auto: "denaro", relazioni: "valori", morale: "valori", studio: "crescita" };
export const areasOf = (m: Pick<Model, "areas" | "tipo">): Area[] => (m.areas?.length ? m.areas : AREA_SETS[TIPO_AREAS[m.tipo ?? ""] ?? "generale"]);

/** Orizzonti temporali: h = mesi dall'inizio (0 = subito), l = etichetta. Preset per tipo di scelta, modificabili. */
export type Horizon = { h: number; l: string };
export const PHASE_SETS: Record<string, { l: string; ph: Horizon[] }> = {
  mesi: { l: "30 giorni → 12 mesi", ph: [{ h: 1, l: "Entro 30 giorni" }, { h: 3, l: "Entro 3 mesi" }, { h: 6, l: "Entro 6 mesi" }, { h: 12, l: "Entro 12 mesi" }] },
  anni: { l: "Oggi → 5 anni", ph: [{ h: 0, l: "Subito" }, { h: 12, l: "Dopo 1 anno" }, { h: 36, l: "Dopo 3 anni" }, { h: 60, l: "Dopo 5 anni" }] },
  contratto: { l: "Prima della firma → 12 mesi", ph: [{ h: 0, l: "Prima della firma" }, { h: 0.5, l: "Prime 2 settimane" }, { h: 3, l: "Entro 90 giorni" }, { h: 12, l: "Entro 12 mesi" }] },
  breve: { l: "Subito → 1 anno", ph: [{ h: 0, l: "Subito" }, { h: 0.25, l: "Tra una settimana" }, { h: 3, l: "Tra 3 mesi" }, { h: 12, l: "Tra un anno" }] },
};
const TIPO_PH: Record<string, string> = { lavoro: "mesi", studio: "mesi", famiglia: "mesi", salute: "mesi", casa: "anni", soldi: "anni", auto: "anni", acquisto: "contratto", fornitore: "contratto", persona: "contratto", progetto: "mesi", relazioni: "breve", morale: "breve" };
export const phasesOf = (m: Pick<Model, "phases" | "tipo">): Horizon[] => (m.phases?.length ? [...m.phases].sort((a, b) => a.h - b.h) : PHASE_SETS[TIPO_PH[m.tipo ?? ""] ?? "mesi"].ph);
/** Etichetta della fase più vicina (le tappe salvate con un orizzonte diverso si agganciano alla più vicina). */
export const snapPhase = (ph: Horizon[], h: number) => ph.reduce((a, b) => (Math.abs(b.h - h) < Math.abs(a.h - h) ? b : a), ph[0]);
// compatibilità con il codice che usa gli orizzonti fissi
export const PHASES = [1, 3, 6, 12] as const;
export const PHASE_L: Record<number, string> = { 1: "Entro 30 giorni", 3: "Entro 3 mesi", 6: "Entro 6 mesi", 12: "Entro 12 mesi" };
export type Phase = { h: number; a?: Area; t: string; src?: "ai" | "user" };
/** Condizione perché questa strada abbia senso. gate = se è falsa la strada esce. st: ? da verificare, si, no. */
export type Cond = { id: string; t: string; how?: string; gate?: boolean; st: "?" | "si" | "no"; src?: "ai" | "user" };
/** Tipo di piano: base, cond = solo a condizioni, prova = a tempo con uscita, cerca = cerco altro prima/invece. */
/** Rischio di una strada. p = probabilità grossolana; c = perdita una tantum (€, negativa); m = variazione €/mese mentre dura (negativa); d = mesi di durata; x = come ridurlo. */
export type RiskP = "bassa" | "media" | "alta";
export type Risk = { id: string; t: string; p: RiskP; c?: number | null; m?: number | null; d?: number | null; x?: string; src?: "ai" | "user" };
/** Pesi convenzionali, dichiarati: servono a ordinare i rischi, non sono probabilità misurate. */
export const RISK_W: Record<RiskP, number> = { bassa: 0.1, media: 0.3, alta: 0.6 };
/** Strategia della strada: generale, non legata a un dominio. */
export type PlanKind = "base" | "cond" | "prova" | "temp" | "rinvio" | "cerca" | "sq";
export const PLAN_L: Record<PlanKind, string> = { base: "Diretta", cond: "Condizionata", prova: "Sperimentale / pilota", temp: "Temporanea", rinvio: "Rinviata", cerca: "Alternativa", sq: "Status quo" };
export const PLAN_D: Record<PlanKind, string> = { base: "la scelta così com'è", cond: "solo se certe condizioni sono garantite", prova: "in piccolo o in prova, con verifica e uscita", temp: "per un periodo definito, poi si rivede", rinvio: "più avanti, quando arrivano informazioni", cerca: "un'altra opzione al posto di questa", sq: "lasciare le cose come stanno" };
export type OptState = "attiva" | "verifica" | "np" | "abbandonata" | "scelta";
export const OPT_ST: Record<OptState, string> = { attiva: "Attiva", verifica: "Da verificare", np: "Non perseguibile", abbandonata: "Abbandonata", scelta: "Scelta" };
export const isOut = (o: Opt) => o.st === "np" || o.st === "abbandonata";
export type Opt = {
  id: string; name: string; note?: string;
  kd?: PlanKind;
  tl?: Phase[];      // cosa succede dopo, per fasi
  next?: string[];   // decisioni che questa strada ti costringe a prendere dopo
  cond?: Cond[];     // cosa deve essere vero
  risks?: Risk[];    // cosa può andare storto, con impatto
  conti?: Line[];    // bilancio mensile con questa strada (parte da una copia di quello di oggi)
  /** stato reale: attiva, da verificare, non perseguibile, abbandonata, scelta. «Esclusa da vincoli» è calcolata. */
  st?: OptState; stWhy?: string; stAt?: string;
  /** reversibilità: costo di entrare e di uscire (€), mesi per tornare indietro, lock-in */
  rev?: { in?: number | null; out?: number | null; back?: number | null; lock?: "basso" | "medio" | "alto" };
  exp?: string | null;   // data in cui questa strada scade (offerta, promozione, bando)
  pro?: string[]; con?: string[];   // pro e contro a parole (spunti da verificare)
  s: Record<string, number>;
  raw?: Record<string, number>;
  m?: Record<string, Meta>;
  block?: string;
  impacts?: Impact[];
};
export type Assumption = { id: string; t: string; rel: Rel; aff?: "alta" | "media" | "bassa"; src?: string; dt?: string };
export type AiNote = { p: string[]; c?: string; at: string; h: string };
export type Model = {
  criteria: Crit[]; constraints: Constraint[]; options: Opt[]; assumptions?: Assumption[];
  ai?: { contro?: AiNote; strade?: { at: string; h: string; x?: string }; premPrev?: string };
  phases?: Horizon[];   // orizzonti di questa decisione (se assenti: preset per tipo)
  /** strade proposte e scartate da te come non perseguibili, con il motivo: contano come «considerate» */
  scartate?: { kd: PlanKind; name: string; why?: string; at: string }[];
  /** il tuo bilancio di oggi, al mese: punto di partenza dei conti di ogni strada */
  oggi?: Line[];
  /** costo del non decidere: € al mese che perdi aspettando, e cosa succede */
  wait?: { m?: number | null; t?: string };
  /** valore dell'informazione: per ogni dato che può ribaltare la scelta, quanto costa saperlo */
  voi?: Record<string, { c: "facile" | "medio" | "difficile"; days?: number | null }>;
  areas?: Area[];       // aree delle conseguenze (se assenti: preset per tipo)
  tipo?: string;   // tipo di scelta riconosciuto (lavoro, casa, morale…)
  nota?: string;   // cosa conta poco in questa scelta, secondo l'Analista
};
export type Decision = {
  id: string; name: string; descr?: string; status: "aperta" | "presa" | "archiviata";
  imp: number; due?: string | null; model: Model;
};
export type Dep = {
  id: string; if: string; excl?: string; req?: string; and?: string;
  impacts?: Impact[]; why?: string; confirmed: boolean;
};
export type Rule = { id: string; name: string; r: string; min?: number | null; max?: number | null };
export type Resources = Record<string, number>;

export const SCEN = ["sfavorevole", "centrale", "favorevole"] as const;
export type Scen = (typeof SCEN)[number];
export const FRAGILE = 10;

export const RES_LABEL: Record<string, string> = {
  cash0: "Liquidità (€)",
  cash_m: "Flusso netto (€/mese)",
  hours_w: "Ore libere/settimana",
  cash_end: "Liquidità a fine orizzonte (€)",
  autonomia_mesi: "Autonomia (mesi)",
};

const v = (x: Impact["v"], k: number) => (Array.isArray(x) ? x[k] : x);

/** Risorse definite dall'utente: chiavi «x_…» con nome e unità nei metadati del profilo. */
export type ResMeta = Record<string, { l?: string; u?: string }>;
export const customRes = (base: Resources, meta: ResMeta = {}) => Object.keys({ ...base, ...meta }).filter((k) => k.startsWith("x_") && meta[k]?.l);
export const resLabel = (k: string, meta: ResMeta = {}) => RES_LABEL[k] ?? (meta[k]?.l ? `${meta[k].l}${meta[k].u ? ` (${meta[k].u})` : ""}` : k);

export const LEVELS = ["Pessimo", "Scarso", "Medio", "Buono", "Ottimo"] as const;
export const levelOf = (s: number) => Math.max(0, Math.min(4, Math.round(s / 25)));

/** Pesi da importanza 1-5 (somma 100, resto distribuito ai più importanti). */
export function weightsFromImp(crit: Crit[]): number[] {
  const imp = crit.map((c) => Math.max(1, Math.min(5, c.imp ?? 3)));
  const tot = imp.reduce((a, b) => a + b, 0) || 1;
  const raw = imp.map((i) => (i * 100) / tot);
  const w = raw.map(Math.floor);
  let rest = 100 - w.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (rest > 0) { w[i]++; rest--; } });
  return w;
}

/** Converte un valore reale in 0-100 sulla scala pessimo→ottimo (funziona anche se "meno è meglio"). */
export function scaleNum(raw: number, c: Crit): number | null {
  if (c.worst == null || c.best == null || c.worst === c.best) return null;
  return Math.max(0, Math.min(100, Math.round(((raw - c.worst) / (c.best - c.worst)) * 1000) / 10));
}

/** Modello pronto per il calcolo: pesi da importanza, valori reali convertiti. Non muta l'input. */
export function normalize(m: Model): Model {
  const useImp = m.criteria.some((c) => c.imp != null);
  const w = useImp ? weightsFromImp(m.criteria) : null;
  const criteria = m.criteria.map((c, i) => (w ? { ...c, w: w[i] } : c));
  const options = m.options.map((o) => {
    const s = { ...o.s };
    for (const c of criteria) {
      if (c.kind !== "num") continue;
      const r = o.raw?.[c.id];
      const x = r == null ? null : scaleNum(r, c);
      if (x == null) delete s[c.id]; else s[c.id] = x;
    }
    return { ...o, s };
  });
  return { ...m, criteria, options };
}
const r1 = (n: number) => Math.round(n * 10) / 10;

export function score(o: Opt, crit: Crit[], override?: Record<string, number>) {
  let num = 0, den = 0;
  for (const c of crit) {
    const w = override?.[c.id] ?? c.w;
    const s = o.s?.[c.id];
    if (s == null || Number.isNaN(s)) continue;
    num += w * s; den += w;
  }
  return den ? num / den : 0;
}

export function feasible(o: Opt, cons: Constraint[], crit: Crit[]) {
  const why: string[] = [], pending: string[] = [];
  if (o.block) why.push(o.block);
  for (const c of o.cond ?? []) if (c.gate && c.st === "no") why.push(`condizione non soddisfatta: ${c.t}`);
  if (isOut(o)) why.push(`${o.st === "np" ? "non perseguibile" : "abbandonata"}${o.stWhy ? `: ${o.stWhy}` : ""}`);
  if (o.exp && o.exp < new Date().toISOString().slice(0, 10)) why.push(`scaduta il ${new Date(o.exp).toLocaleDateString("it-IT")}`);
  for (const k of cons) {
    const c = crit.find((x) => x.id === k.crit);
    if (!c) continue;
    const nm = k.name || c.name;
    const num = c.kind === "num";
    const val = num ? o.raw?.[k.crit] : o.s?.[k.crit];
    const f = (n: number) => (num ? `${fmt(n)}${c.unit ? " " + c.unit : ""}` : c.kind === "g" ? LEVELS[levelOf(n)] : fmt(n));
    if (val == null) pending.push(`${nm}: manca il dato`);
    else if (k.min != null && val < k.min) why.push(`${nm}: ${f(val)} sotto il minimo ${f(k.min)}`);
    else if (k.max != null && val > k.max) why.push(`${nm}: ${f(val)} sopra il massimo ${f(k.max)}`);
  }
  return { why, pending };
}

export type Sens = { crit: string; name: string; delta: number | null; newTop: string | null };

export function sensitivity(opts: Opt[], crit: Crit[]): Sens[] {
  if (opts.length < 2) return [];
  const top = (ov?: Record<string, number>) =>
    opts.reduce((a, b) => (score(b, crit, ov) > score(a, crit, ov) ? b : a)).id;
  const t0 = top();
  return crit.map((c) => {
    for (let d = 1; d <= 100; d++) {
      for (const sg of [1, -1]) {
        const w = c.w + sg * d;
        if (w < 0) continue;
        const t = top({ [c.id]: w });
        if (t !== t0) return { crit: c.id, name: c.name, delta: sg * d, newTop: t };
      }
    }
    return { crit: c.id, name: c.name, delta: null, newTop: null };
  });
}

export type Row = {
  id: string; name: string; score: number; range: [number, number] | null;
  excluded: string[]; pending: string[]; missing: string[];
  detail: { crit: string; name: string; w: number; s: number | null; contrib: number | null; meta?: Meta; raw?: number; unit?: string; kind?: Crit["kind"] }[];
};
export type DecResult = {
  id: string; name: string; warn: string[]; rows: Row[]; sens: Sens[];
  margin: number | null; feasible: string[]; fragile: Sens[]; tie: boolean; weightSum: number;
};

export function analyzeDecision(dec: Decision): DecResult {
  const { criteria: crit, constraints: cons, options } = normalize(dec.model);
  const tw = crit.reduce((a, c) => a + (c.w || 0), 0);
  const warn: string[] = [];
  if (crit.length && tw !== 100) warn.push(`Somma pesi = ${tw} (attesa 100): punteggi normalizzati sul totale.`);
  const groups: Record<string, string[]> = {};
  for (const c of crit) if (c.group) (groups[c.group] ??= []).push(c.name);
  for (const [g, n] of Object.entries(groups))
    if (n.length > 1) warn.push(`Possibile doppio conteggio nel gruppo "${g}": ${n.join(", ")}.`);
  if (options.length < 2) warn.push("Servono almeno due alternative per un confronto.");
  for (const c of crit) if (c.kind === "num" && (c.worst == null || c.best == null || c.worst === c.best)) warn.push(`"${c.name}": indica valore pessimo e ottimo, altrimenti non entra nel calcolo.`);

  const ok: Opt[] = [];
  const rows: Row[] = options.map((o) => {
    const miss = crit.filter((c) => o.s?.[c.id] == null).map((c) => c.name);
    const { why, pending } = feasible(o, cons, crit);
    if (!why.length) ok.push(o);
    const lo = crit.reduce((a, c) => a + c.w * (o.s?.[c.id] ?? 0), 0) / (tw || 1);
    const hi = crit.reduce((a, c) => a + c.w * (o.s?.[c.id] ?? 100), 0) / (tw || 1);
    return {
      id: o.id, name: o.name, score: r1(score(o, crit)),
      range: miss.length ? [r1(lo), r1(hi)] : null,
      excluded: why, pending, missing: miss,
      detail: crit.map((c) => {
        const s = o.s?.[c.id];
        return { crit: c.id, name: c.name, w: c.w, s: s ?? null, contrib: s == null ? null : r1((c.w * s) / (tw || 1)), meta: o.m?.[c.id], raw: o.raw?.[c.id], unit: c.unit, kind: c.kind };
      }),
    };
  });
  rows.sort((a, b) => Number(!!a.excluded.length) - Number(!!b.excluded.length) || b.score - a.score);
  const okr = rows.filter((r) => !r.excluded.length);
  const margin = okr.length > 1 ? r1(okr[0].score - okr[1].score) : null;
  const sens = sensitivity(ok, crit);
  return {
    id: dec.id, name: dec.name, warn, rows, sens, margin,
    feasible: ok.map((o) => o.id),
    fragile: sens.filter((s) => s.delta != null && Math.abs(s.delta) <= FRAGILE),
    tie: margin === 0, weightSum: tw,
  };
}

export type ScenState = { res: Resources; viol: string[] };
export type Combo = {
  key: string; combo: string[]; names: string[]; score: number;
  excluded: string[]; scen: Record<Scen, ScenState>; fragileSfav: boolean;
};

export function applyCombo(
  combo: string[], optById: Map<string, Opt>, deps: Dep[], base: Resources, rules: Rule[], horizon: number, k: number,
): ScenState {
  const set = new Set(combo);
  const r: Resources = { ...base };
  const seen = new Set<string>();
  const imps: Impact[] = combo.flatMap((id) => optById.get(id)?.impacts ?? []);
  for (const d of deps) if (d.confirmed && d.and && set.has(d.if) && set.has(d.and)) imps.push(...(d.impacts ?? []));
  for (const i of imps) {
    if (i.tag) { if (seen.has(i.tag)) continue; seen.add(i.tag); }
    r[i.r] = (r[i.r] ?? 0) + v(i.v, k);
  }
  if ("cash0" in r && "cash_m" in r) {
    r.cash_end = r.cash0 + r.cash_m * horizon;
    r.autonomia_mesi = r.cash_m >= 0 ? Infinity : Math.max(0, r1(r.cash0 / -r.cash_m));   // mesi prima di finire i risparmi, mai negativo
  }
  const viol: string[] = [];
  for (const ru of rules) {
    const x = r[ru.r];
    if (x == null) continue;
    if (ru.min != null && x < ru.min) viol.push(`${ru.name}: si arriverebbe a ${fmt(x)}, sotto il minimo di ${fmt(ru.min)}`);
    if (ru.max != null && x > ru.max) viol.push(`${ru.name}: si arriverebbe a ${fmt(x)}, sopra il massimo di ${fmt(ru.max)}`);
  }
  return { res: r, viol };
}

export function combos(
  decs: Decision[], results: DecResult[], deps: Dep[], base: Resources, rules: Rule[], horizon: number,
): Combo[] {
  if (!decs.length || results.some((r) => !r.feasible.length)) return [];
  const optById = new Map<string, Opt>();
  const optName = new Map<string, string>();
  for (const d of decs) for (const o of d.model.options) { optById.set(o.id, o); optName.set(o.id, o.name); }
  const conf = deps.filter((d) => d.confirmed);
  const prod = results.reduce<string[][]>((acc, r) => acc.flatMap((a) => r.feasible.map((f) => [...a, f])), [[]]);
  const totImp = decs.reduce((a, d) => a + (d.imp || 1), 0) || 1;
  const out = prod.map((combo) => {
    const set = new Set(combo);
    const why: string[] = [];
    for (const d of conf) {
      if (set.has(d.if) && d.excl && set.has(d.excl)) why.push(d.why || `${optName.get(d.if)} incompatibile con ${optName.get(d.excl)}`);
      if (set.has(d.if) && d.req && !set.has(d.req)) why.push(d.why || `${optName.get(d.if)} richiede ${optName.get(d.req)}`);
    }
    const scen = Object.fromEntries(SCEN.map((s, k) => [s, applyCombo(combo, optById, conf, base, rules, horizon, k)])) as Record<Scen, ScenState>;
    if (scen.centrale.viol.length) why.push(...scen.centrale.viol.map((x) => `[centrale] ${x}`));
    const sc = combo.reduce((a, id, i) => a + (results[i].rows.find((x) => x.id === id)?.score ?? 0) * (decs[i].imp || 1), 0) / totImp;
    return {
      key: combo.join("+"), combo, names: combo.map((c) => optName.get(c) ?? c), score: r1(sc),
      excluded: why, scen, fragileSfav: !why.length && scen.sfavorevole.viol.length > 0,
    };
  });
  out.sort((a, b) => Number(!!a.excluded.length) - Number(!!b.excluded.length) || b.score - a.score);
  return out;
}

/** Proiezione mensile della liquidità, lineare (flusso costante). */
export function cashSeries(res: Resources, horizon: number) {
  const c0 = res.cash0 ?? 0, m = res.cash_m ?? 0;
  return Array.from({ length: horizon + 1 }, (_, i) => c0 + m * i);
}

/** Soglia di flusso mensile sotto cui un piano viola le regole sulla liquidità (punto di svolta economico). */
export function cashBreakpoint(res: Resources, rules: Rule[], horizon: number) {
  const c0 = res.cash0 ?? 0;
  let worst: number | null = null;
  for (const ru of rules) {
    if (ru.min == null) continue;
    let need: number | null = null;
    if (ru.r === "cash_end") need = (ru.min - c0) / horizon;
    if (ru.r === "autonomia_mesi") need = -c0 / ru.min;
    if (need != null) worst = worst == null ? need : Math.max(worst, need);
  }
  return worst == null ? null : Math.ceil(worst);
}

export function fmt(n: number) {
  if (n === Infinity) return "∞";
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1, useGrouping: "always" } as Intl.NumberFormatOptions).format(n);
}
export function eur(n: number) {
  if (n === Infinity) return "∞";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0, useGrouping: "always" } as Intl.NumberFormatOptions).format(n);
}
export const uid = () => Math.random().toString(36).slice(2, 10);

/** Punto di svolta deterministico: per ogni criterio, il valore che porterebbe la prima alla pari con la seconda. */
export type Turn = { crit: string; name: string; opt: string; text: string };
export function turningPoints(dec: Decision, r: DecResult): Turn[] {
  const m = normalize(dec.model);
  const ok = r.rows.filter((x) => !x.excluded.length);
  if (ok.length < 2 || r.margin == null || r.margin === 0) return [];
  const [top, sec] = ok;
  if (top.missing.length || sec.missing.length) return [];   // con dati mancanti il confronto non è affidabile
  const tw = m.criteria.reduce((a, c) => a + c.w, 0) || 1;
  const out: Turn[] = [];
  for (const c of m.criteria) {
    const st = top.detail.find((d) => d.crit === c.id)?.s;
    if (st == null || !c.w) continue;
    const need = (r.margin * tw) / c.w;           // punti di scala da perdere per arrivare alla pari
    const s2 = st - need;
    if (s2 < 0) continue;                           // questo criterio da solo non basta a ribaltare
    if (c.kind === "num" && c.worst != null && c.best != null) {
      const rawAt = c.worst + (s2 / 100) * (c.best - c.worst);
      const less = c.best > c.worst;
      out.push({ crit: c.id, name: c.name, opt: top.id,
        text: `Se per ${top.name} «${c.name}» ${less ? "scendesse sotto" : "salisse sopra"} ${fmt(Math.round(rawAt))}${c.unit ? " " + c.unit : ""}, passerebbe in testa ${sec.name}.` });
    } else if (c.kind === "g") {
      const lv = Math.floor(s2 / 25 + 1e-9);
      if (lv < levelOf(st)) out.push({ crit: c.id, name: c.name, opt: top.id,
        text: `Se per ${top.name} «${c.name}» fosse ${LEVELS[lv].toLowerCase()} o peggio, passerebbe in testa ${sec.name}.` });
    } else {
      out.push({ crit: c.id, name: c.name, opt: top.id, text: `Se per ${top.name} «${c.name}» scendesse sotto ${fmt(Math.round(s2))}/100, passerebbe in testa ${sec.name}.` });
    }
  }
  return out;
}

/* ---------- Scambio esplicito tra le prime due ---------- */
export type Trade = { a: string; b: string; gains: string[]; losses: string[]; risks: string[] };

export function tradeoff(dec: Decision, r: DecResult): Trade | null {
  const ok = r.rows.filter((x) => !x.excluded.length);
  if (ok.length < 2) return null;
  const [A, B] = ok;
  const m = normalize(dec.model);
  const desc = (c: Crit, d: Row["detail"][0]) =>
    c.kind === "num" ? `${fmt(d.raw!)}${c.unit ? " " + c.unit : ""}` : c.kind === "g" ? LEVELS[levelOf(d.s!)].toLowerCase() : `${fmt(d.s!)}/100`;
  const items = m.criteria.flatMap((c) => {
    const da = A.detail.find((d) => d.crit === c.id)!, db = B.detail.find((d) => d.crit === c.id)!;
    if (da.s == null || db.s == null || da.s === db.s) return [];
    return [{ diff: (da.s - db.s) * c.w, t: `${c.name}: ${desc(c, da)} invece di ${desc(c, db)}` }];
  }).sort((x, y) => Math.abs(y.diff) - Math.abs(x.diff));
  const risks: string[] = [];
  const oA = dec.model.options.find((o) => o.id === A.id)!;
  const est = A.detail.filter((d) => d.meta?.rel === "S" && d.s != null).map((d) => d.name);
  if (est.length) risks.push(`${est.join(", ")}: ${est.length > 1 ? "sono stime" : "è una stima"}, non un dato certo.`);
  if (A.pending.length) risks.push(`Requisito non ancora verificato: ${A.pending.join("; ")}.`);
  if ((oA.impacts ?? []).some((i) => i.src === "ai")) risks.push(`Gli importi su soldi e tempo di ${A.name} sono stime dell'AI, non dati tuoi.`);
  const cm = (oA.impacts ?? []).find((i) => i.r === "cash_m");
  if (cm && Array.isArray(cm.v) && cm.v[0] < cm.v[1]) risks.push(`Se va male, al mese cambia di ${eur(cm.v[0])} invece di ${eur(cm.v[1])}.`);
  for (const a of (dec.model.assumptions ?? []).filter((x) => x.rel === "?").slice(0, 2)) risks.push(`Ancora da chiarire: ${a.t}${/[.?!]$/.test(a.t) ? "" : "."}`);
  return {
    a: A.name, b: B.name,
    gains: items.filter((x) => x.diff > 0).slice(0, 3).map((x) => x.t),
    losses: items.filter((x) => x.diff < 0).slice(0, 3).map((x) => x.t),
    risks: risks.slice(0, 4),
  };
}

/* ---------- Solidità delle stime ---------- */
export type Solidity = { estShare: number; unkShare: number; nEst: number; tested: boolean; holds: boolean; newTop?: string; pct: number; alone?: boolean };

/** Frase quando la prova di stress non si può fare. */
export function untestedText(s: Solidity) {
  if (s.alone) return `Non c'è un'altra alternativa valida con cui confrontarla, quindi la prova di stress non si applica${s.estShare + s.unkShare > 0 ? ": le stime e i valori senza fonte restano da verificare" : ""}.`;
  if (s.estShare + s.unkShare > 0) return "Nessuna stima marcata da mettere alla prova, ma alcuni valori non hanno una fonte: indicala per sapere quanto fidarti.";
  return "Nessuna stima da mettere alla prova: il risultato si basa su dati certi o dichiarati.";
}

export function solidity(dec: Decision, r: DecResult, pct = 0.2): Solidity | null {
  const ok = r.rows.filter((x) => !x.excluded.length);
  if (!ok.length) return null;
  const A = ok[0];
  const tot = A.detail.reduce((a, d) => a + (d.contrib ?? 0), 0) || 1;
  const estShare = Math.round((A.detail.filter((d) => d.meta?.rel === "S").reduce((a, d) => a + (d.contrib ?? 0), 0) / tot) * 100);
  const unkShare = Math.round((A.detail.filter((d) => d.s != null && !d.meta?.rel).reduce((a, d) => a + (d.contrib ?? 0), 0) / tot) * 100);
  // prova: le stime della prima peggiorano del pct della scala, quelle delle altre migliorano
  const mm: Model = JSON.parse(JSON.stringify(dec.model));
  let nEst = 0;
  for (const o of mm.options) {
    const dir = o.id === A.id ? -1 : 1;
    for (const c of mm.criteria) {
      if (o.m?.[c.id]?.rel !== "S") continue;
      if (c.kind === "num") {
        const v = o.raw?.[c.id];
        if (v == null || c.worst == null || c.best == null) continue;
        o.raw![c.id] = v + dir * pct * (c.best - c.worst); nEst++;
      } else if (o.s?.[c.id] != null) {
        const step = c.kind === "g" ? 25 : pct * 100;
        o.s[c.id] = Math.max(0, Math.min(100, o.s[c.id] + dir * step)); nEst++;
      }
    }
  }
  if (!nEst || ok.length < 2) return { estShare, unkShare, nEst, tested: false, holds: true, pct, alone: ok.length < 2 };
  const r2 = analyzeDecision({ ...dec, model: mm });
  const t2 = r2.rows.find((x) => !x.excluded.length);
  const holds = t2?.id === A.id;
  return { estShare, unkShare, nEst, tested: true, holds, newTop: holds ? undefined : t2?.name ?? "nessuna", pct };
}

/* ---------- Effetti sulle altre decisioni ---------- */
export type CrossRow = { id: string; name: string; ok: boolean; why: string[]; auto: boolean; hours?: number; cashM?: number };
export type Cross = { dec: string; name: string; rows: CrossRow[] }[];

/** Per una alternativa di questa decisione: cosa resta possibile nelle altre decisioni aperte. */
export function crossEffects(optId: string, dec: Decision, others: Decision[], deps: Dep[], base: Resources, rules: Rule[], horizon: number): Cross {
  const me = normalize(dec.model).options.find((o) => o.id === optId);
  if (!me) return [];
  const conf = deps.filter((d) => d.confirmed);
  return others.filter((D) => D.id !== dec.id && D.model.options.length).map((D) => {
    const rD = analyzeDecision(D);
    const rows = D.model.options.filter((x) => !isOut(x)).map((x): CrossRow => {
      const own = rD.rows.find((y) => y.id === x.id)!;
      if (own.excluded.length) return { id: x.id, name: x.name, ok: false, why: ["già scartata nella sua decisione"], auto: false };
      const why: string[] = [];
      for (const d of conf) {
        if ((d.if === optId && d.excl === x.id) || (d.if === x.id && d.excl === optId)) why.push(d.why || "incompatibili");
        if (d.if === x.id && d.req && dec.model.options.some((o) => o.id === d.req) && d.req !== optId) why.push(d.why || "richiede un'altra scelta");
        if (d.if === optId && d.req && D.model.options.some((o) => o.id === d.req) && d.req !== x.id) why.push(d.why || "richiede un'altra scelta");
      }
      const st = applyCombo([optId, x.id], new Map([[optId, me], [x.id, x]]), conf, base, rules, horizon, 1);
      const auto = !why.length && st.viol.length > 0;
      for (const v of st.viol) if (!why.includes(v)) why.push(v);
      return { id: x.id, name: x.name, ok: !why.length, why, auto, hours: st.res.hours_w, cashM: st.res.cash_m };
    });
    return { dec: D.id, name: D.name, rows };
  });
}

/** Impronta breve di un contenuto (per sapere se un'analisi AI salvata è ancora attuale). */
export function hashOf(x: unknown) {
  const t = JSON.stringify(x);
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/* ---------- Controllo onestà: segnali che stai scegliendo con la pancia ---------- */
const MONEY = /soldi|stipend|reddit|guadagn|margine|economic|risparm|€/i;
export type Bias = { k: string; t: string };

export function biasChecks(dec: Decision, r: DecResult): Bias[] {
  const out: Bias[] = [];
  // 0. due o più criteri che misurano i soldi: lo stesso beneficio conta più volte
  // stessa unità in € (es. due criteri in €/mese) oppure un giudizio "economico" accanto a una cifra in €.
  // Spesa iniziale (€) e costo mensile (€/mese) sono cose diverse: non vengono segnalati.
  const euro = dec.model.criteria.filter((c) => c.kind === "num" && /€/.test(c.unit ?? ""));
  const byUnit = new Map<string, Crit[]>();
  for (const c of euro) byUnit.set((c.unit ?? "").replace(/\s/g, ""), [...(byUnit.get((c.unit ?? "").replace(/\s/g, "")) ?? []), c]);
  const sameUnit = [...byUnit.values()].find((g) => g.length > 1);
  const gMoney = dec.model.criteria.filter((c) => c.kind !== "num" && MONEY.test(c.name));
  const money = sameUnit ?? (gMoney.length && euro.length ? [...gMoney, euro[0]] : gMoney.length > 1 ? gMoney : []);
  if (money.length > 1)
    out.push({ k: "doppio", t: `${money.map((c) => `«${c.name}»`).join(" e ")} misurano entrambi i soldi: lo stesso vantaggio viene contato più volte. Tienine uno solo, o abbassa l'importanza degli altri.` });
  const m = normalize(dec.model);
  const ok = r.rows.filter((x) => !x.excluded.length);
  const A = ok[0];
  if (!A || ok.length < 2 || A.missing.length) return out;
  const B = ok[1];
  // 1. il vantaggio nasce quasi tutto da un solo criterio pesante
  const gaps = m.criteria.map((c) => {
    const a = A.detail.find((d) => d.crit === c.id)?.contrib ?? 0, b = B.detail.find((d) => d.crit === c.id)?.contrib ?? 0;
    return { c, d: a - b };
  });
  const posTot = gaps.filter((g) => g.d > 0).reduce((s, g) => s + g.d, 0);
  const big = gaps.filter((g) => g.d > 0).sort((x, y) => y.d - x.d)[0];
  if (big && posTot > 0 && big.d / posTot >= 0.7 && big.c.w >= 30 && (r.margin ?? 0) > 0)
    out.push({ k: "uno", t: `${A.name} prevale quasi solo grazie a «${big.c.name}», che pesa il ${big.c.w}%. Vale davvero così tanto per te, o l'hai spinto perché ti piace già ${A.name}?` });
  // 2. le stime favoriscono proprio la prima
  const estA = A.detail.filter((d) => d.meta?.rel === "S" && d.s != null);
  const favored = estA.filter((d) => {
    const others = ok.slice(1).map((o) => o.detail.find((x) => x.crit === d.crit)?.s ?? 0);
    return d.s! > Math.max(...others);
  });
  if (favored.length >= 2 || (favored.length === 1 && favored[0].w >= 30))
    out.push({ k: "stime", t: `I valori stimati di ${A.name} sono i migliori proprio su ${favored.map((d) => `«${d.name}»`).join(" e ")}. Se sono stime ottimistiche, il vantaggio è costruito su un desiderio: verificale.` });
  // 3. più contro che pro elencati, ma è prima
  const oA = dec.model.options.find((o) => o.id === A.id);
  const np = oA?.pro?.length ?? 0, nc = oA?.con?.length ?? 0;
  if (nc >= 2 && nc > np)
    out.push({ k: "contro", t: `Per ${A.name} hai ${nc} contro e ${np} pro, eppure è prima. I contro sono già tutti dentro i criteri, o ce n'è qualcuno che stai ignorando?` });
  // 4. manca l'alternativa di non cambiare
  if (!dec.model.options.some((o) => /com'è|status quo|resto|restare|rimango|rimanere|non (cambio|faccio|assumo|compro)|aspett|rimand|tengo/i.test(o.name)))
    out.push({ k: "statusquo", t: "Tra le alternative manca «lasciare tutto com'è». Senza un confronto con lo stato attuale ogni novità sembra migliore di quello che è." });
  // 5. margine minimo con un solo criterio decisivo: decisione di pancia mascherata
  if ((r.margin ?? 0) > 0 && (r.margin ?? 0) < 2)
    out.push({ k: "pari", t: `Tra ${A.name} e ${B.name} ci sono meno di 2 punti: i numeri non decidono. Va bene scegliere con il cuore, purché tu lo sappia.` });
  return out;
}

/* ---------- Privacy: cosa è una cifra economica ---------- */
const MONEY_NAME = /soldi|stipend|reddit|guadagn|margine|economic|risparm|costo|prezz|spes|affitt|rata|anticip|investiment|€|euro/i;
export const isMoneyCrit = (c: Crit) => (c.kind === "num" && /€|eur/i.test(c.unit ?? "")) || (c.kind === "num" && MONEY_NAME.test(c.name));
/** Oscura gli importi in € in un testo libero ("3.200 €", "€ 1.450", "2k euro", "1.500 euro al mese"). */
// Importi senza simbolo: «RAL 40k», «stipendio 3200 al mese», «affitto 1450», «pago 900 di affitto».
const MKW = "(?:ral|stipend\\w*|salari\\w*|reddit\\w*|nett[oi]|lord[oi]|guadagn\\w*|affitt\\w*|canone|rat[ae]|mutuo|prezz\\w*|cost[oi]|spes[ae]|anticip\\w*|cauzion\\w*|budget|risparm\\w*|debit\\w*|entrat[ae]|uscit[ae]|paga|compens\\w*|fattur\\w*|bonus|tredicesima|quattordicesima|bollett\\w*|investiment\\w*|prestit\\w*|finanziament\\w*)";
const MNUM = "\\d+(?:[.,]\\d+)?\\s*(?:k|mila)\\b|\\d{1,3}(?:[.']\\d{3})+(?:,\\d+)?|\\d{3,}(?:[.,]\\d+)?";
const R_AFTER = new RegExp(`(\\b${MKW}\\b[^\\d\\n;]{0,30}?)(?:${MNUM})`, "gi");
const R_BEFORE = new RegExp(`(?:${MNUM})(?=(?:\\s+[^\\s\\d]+){0,4}?\\s+${MKW}\\b)`, "gi");
const R_PERIOD = new RegExp(`(?:${MNUM})(?=\\s*(?:\\/\\s*mese|al mese|a mese|mensil\\w*|l'anno|all'anno|annu\\w*|\\/\\s*anno))`, "gi");

export function redactMoney(t: string): string {
  let x = t
    .replace(/€\s*\d(?:[\d.,']*\d)?(\s*(k|mila)\b)?/gi, "[cifra]")
    .replace(/\d(?:[\d.,']*\d)?(\s*(k|mila))?\s*(€|euro\b|eur\b)/gi, "[cifra]")
    .replace(/\b\d+(?:[.,]\d+)?\s*k\b/gi, "[cifra]");
  for (let i = 0; i < 3; i++) x = x.replace(R_AFTER, "$1[cifra]");   // più importi dopo la stessa parola
  return x.replace(R_BEFORE, "[cifra]").replace(R_PERIOD, "[cifra]");
}

/* ---------- Conclusività: la prima resta prima anche nel caso peggiore dei dati mancanti? ---------- */
export type Concl = { ok: boolean; missing: number; missW: number; contenders: string[]; pend?: { name: string; req: string[] } };
export function conclusive(dec: Decision, r: DecResult): Concl {
  const ok = r.rows.filter((x) => !x.excluded.length);
  const missing = ok.reduce((a, x) => a + x.missing.length, 0);
  const tw = r.weightSum || 1;
  const nm = normalize(dec.model);
  const missW = Math.round(Math.max(0, ...ok.map((x) => nm.criteria.filter((c) => x.missing.includes(c.name)).reduce((a, c) => a + c.w, 0))) / tw * 100);
  const lo = (x: Row) => (x.range ? x.range[0] : x.score), hi = (x: Row) => (x.range ? x.range[1] : x.score);
  if (!ok.length) return { ok: true, missing, missW, contenders: [] };
  const best = ok.reduce((a, b) => (lo(b) > lo(a) ? b : a));              // chi ha il caso peggiore più alto
  // un requisito obbligatorio ancora da verificare può scartarla del tutto: non è una prima robusta
  if (best.pending.length) return { ok: false, missing, missW, contenders: ok.map((x) => x.name), pend: { name: best.name, req: best.pending } };
  if (ok.length < 2 || !missing) return { ok: true, missing, missW, contenders: [] };
  const rivals = ok.filter((x) => x.id !== best.id && hi(x) >= lo(best));  // chi potrebbe ancora superarla
  return { ok: !rivals.length, missing, missW, contenders: rivals.length ? [best.name, ...rivals.map((x) => x.name)] : [] };
}

/* ---------- Valore dell'informazione: quale dato può ribaltare la scelta ---------- */
// Per ogni valore mancante o stimato, lo facciamo variare nel suo intervallo plausibile (tutta la scala se manca,
// ±25% della scala attorno alla stima) e guardiamo chi resta in testa. Nessuna probabilità: solo «può cambiare / non può».
export type InfoItem = {
  opt: string; optName: string; crit: string; critName: string; kind: "manca" | "stima";
  flips: boolean; share: number; w: number; cur?: string; text: string; num?: boolean;
  cut?: { lowId: string; highId: string; low: string; high: string };   // un solo punto di svolta: chi vince sotto e sopra
};

const niceRound = (x: number, span: number) => {
  const st = span >= 5000 ? 100 : span >= 1000 ? 50 : span >= 100 ? 10 : span >= 10 ? 1 : 0.1;
  return Math.round(x / st) * st;
};

export function infoValue(dec: Decision): InfoItem[] {
  const nm = normalize(dec.model);
  const out: InfoItem[] = [];
  const leader = (model: Model) => analyzeDecision({ ...dec, model }).rows.find((x) => !x.excluded.length)?.id ?? "-";
  const nameOf = (id: string) => (id === "-" ? "nessuna (tutte scartate)" : dec.model.options.find((o) => o.id === id)?.name ?? id);
  for (const o of dec.model.options.filter((x) => !isOut(x))) {
    for (const c of nm.criteria) {
      const isNum = c.kind === "num";
      if (isNum && (c.worst == null || c.best == null || c.worst === c.best)) continue;
      const cur = isNum ? o.raw?.[c.id] : o.s?.[c.id];
      const rel = o.m?.[c.id]?.rel;
      const kind: InfoItem["kind"] | null = cur == null ? "manca" : rel === "S" || rel === "?" ? "stima" : null;
      if (!kind) continue;
      const lo = isNum ? Math.min(c.worst!, c.best!) : 0, hi = isNum ? Math.max(c.worst!, c.best!) : 100;
      const span = hi - lo;
      let a = lo, b = hi;
      if (kind === "stima") { a = Math.max(lo, cur! - span / 4); b = Math.min(hi, cur! + span / 4); if (cur! < lo || cur! > hi) { a = cur! - span / 4; b = cur! + span / 4; } }
      const pts = c.kind === "g" ? [0, 25, 50, 75, 100].filter((v) => v >= a - 0.1 && v <= b + 0.1) : Array.from({ length: 17 }, (_, i) => a + ((b - a) * i) / 16);
      const at = (v: number) => {
        const mm: Model = JSON.parse(JSON.stringify(dec.model));
        const oo = mm.options.find((x) => x.id === o.id)!;
        if (isNum) (oo.raw ??= {})[c.id] = v; else (oo.s ??= {})[c.id] = v;
        return leader(mm);
      };
      const tops = pts.map(at);
      const cnt = new Map<string, number>();
      tops.forEach((t) => cnt.set(t, (cnt.get(t) ?? 0) + 1));
      const flips = cnt.size > 1;
      const share = flips ? 1 - Math.max(...cnt.values()) / tops.length : 0;
      const fv = (v: number) => (isNum ? `${fmt(niceRound(v, span))}${c.unit ? " " + c.unit : ""}` : c.kind === "g" ? LEVELS[levelOf(v)] : fmt(Math.round(v)));
      const curTxt = cur == null ? undefined : fv(cur);
      let text = "";
      let cut: InfoItem["cut"];
      if (!flips) text = `qualunque valore plausibile, in testa resta ${nameOf(tops[0])}`;
      else {
        const ch: number[] = [];
        for (let i = 1; i < tops.length; i++) if (tops[i] !== tops[i - 1]) ch.push(i);
        if (ch.length === 1) {
          const i = ch[0];
          let x = pts[i - 1], y = pts[i];
          if (c.kind !== "g") for (let k = 0; k < 14; k++) { const mid = (x + y) / 2; if (at(mid) === tops[i - 1]) x = mid; else y = mid; }
          // «più alto» in valore reale non è sempre «meglio»: parliamo di sotto/sopra la soglia nell'unità dell'utente
          if (c.kind === "g") {
            text = `se è ${LEVELS[levelOf(pts[i - 1])]} o meno prevale ${nameOf(tops[i - 1])}, se è ${LEVELS[levelOf(pts[i])]} o più prevale ${nameOf(tops[i])}`;
            cut = { lowId: tops[i - 1], highId: tops[i], low: `resta al massimo «${LEVELS[levelOf(pts[i - 1])]}»`, high: `è almeno «${LEVELS[levelOf(pts[i])]}»` };
          } else {
            text = `sotto ${fv(y)} prevale ${nameOf(tops[i - 1])}, sopra prevale ${nameOf(tops[i])}`;
            cut = { lowId: tops[i - 1], highId: tops[i], low: `resta sotto ${fv(y)}`, high: `è almeno ${fv(y)}` };
          }
        } else text = `a seconda del valore può prevalere ${[...new Set(tops)].map(nameOf).join(" oppure ")}`;
      }
      out.push({ opt: o.id, optName: o.name, crit: c.id, critName: c.name, kind, flips, share, w: c.w, cur: curTxt, text, cut, num: isNum });
    }
  }
  return out.sort((x, y) => Number(y.flips) - Number(x.flips) || y.share - x.share || y.w - x.w);
}

/* ---------- «Dove sei»: la scelta vera, il dato che decide, cosa fare adesso ---------- */
export type Focus = {
  trade: string; decide: string; decideItem?: InfoItem; also: InfoItem[]; calm: InfoItem[];
  todo: string; act: "dato" | "pesi" | "requisiti" | "decidi" | "completa";
};

export function focus(dec: Decision, r: DecResult, turns: Turn[] = [], info?: InfoItem[]): Focus | null {
  const nm = normalize(dec.model);
  if (nm.options.length < 2 || !nm.criteria.length) return null;
  const ok = r.rows.filter((x) => !x.excluded.length);
  info ??= infoValue(dec);
  const hot = info.filter((x) => x.flips);
  const calm = info.filter((x) => !x.flips);
  // la scelta vera: su cosa vince la prima e su cosa vince la seconda
  let trade: string;
  if (!ok.length) trade = "Nessuna alternativa rispetta i tuoi requisiti: la scelta vera è quale requisito sei disposto ad allentare.";
  else if (ok.length < 2) trade = `Solo ${ok[0].name} rispetta i tuoi requisiti: la domanda non è quale scegliere, ma se ${ok[0].name} ti va bene o se cercare altre strade.`;
  else {
    const [A, B] = ok;
    const d = nm.criteria.map((c) => {
      const a = A.detail.find((x) => x.crit === c.id)?.s, b = B.detail.find((x) => x.crit === c.id)?.s;
      return { n: c.name, v: a == null || b == null ? 0 : (a - b) * c.w, miss: a == null ? A.name : b == null ? B.name : "" };
    });
    const ms = d.filter((x) => x.miss);
    const missTxt = ms.length ? ` Su ${ms.slice(0, 2).map((x) => `«${x.n}»`).join(" e ")} manca ancora il dato di ${[...new Set(ms.map((x) => x.miss))].join(" e ")}.` : "";
    const fa = d.filter((x) => x.v > 0).sort((x, y) => y.v - x.v).slice(0, 2).map((x) => `«${x.n}»`);
    const fb = d.filter((x) => x.v < 0).sort((x, y) => x.v - y.v).slice(0, 2).map((x) => `«${x.n}»`);
    const j = (l: string[]) => l.join(" e ");
    trade = fa.length && fb.length
      ? `${A.name} è meglio su ${j(fa)}; ${B.name} su ${j(fb)}. Stai decidendo quanto vale per te ${fa[0]} rispetto a ${fb[0]}.`
      : fa.length ? `${A.name} è uguale o meglio di ${B.name} su tutto ciò che hai valutato: la differenza sta in ${j(fa)}.`
      : `${A.name} e ${B.name} sono alla pari sui valori che hai inserito.`;
    trade += missTxt;
  }
  // il dato che decide
  let decide: string, todo: string, act: Focus["act"];
  const top = hot[0];
  if (top) {
    decide = `«${top.critName}» di ${top.optName}${top.kind === "manca" ? " (manca)" : ` (oggi stimato ${top.cur})`}: ${top.text}.`;
    todo = top.kind === "manca" ? `Trova il valore di «${top.critName}» per ${top.optName} e inseriscilo al passo «Valuta».` : `Verifica «${top.critName}» di ${top.optName}: oggi è una stima e da lei dipende la scelta.`;
    act = "dato";
  } else if (ok[0]?.pending.length) {
    decide = `${ok[0].name} deve ancora superare un requisito: ${ok[0].pending.join("; ")}.`;
    todo = "Verifica il requisito e inserisci il dato al passo «Valuta».";
    act = "requisiti";
  } else {
    decide = info.length
      ? `Nessun dato mancante o stimato può cambiare chi è in testa: le informazioni che hai bastano per decidere.`
      : turns[0] ? `Nessun dato è incerto. La scelta cambierebbe solo se: ${turns[0].text}` : "Nessun dato è incerto e nessun singolo valore ribalta la classifica.";
    if (r.fragile.length) {
      todo = `I dati bastano; la scelta dipende da quanto conta ${r.fragile.map((f) => `«${f.name}»`).join(" e ")}. Chiediti se l'importanza che hai dato è davvero quella, poi decidi.`;
      act = "pesi";
    } else if (r.rows.some((x) => x.missing.length)) {
      todo = "Puoi già decidere: i valori mancanti non cambiano la classifica. Completali solo se vuoi un report più preciso.";
      act = "completa";
    } else {
      todo = "Puoi decidere: fissa una data, congela l'analisi e registra la scelta.";
      act = "decidi";
    }
  }
  return { trade, decide, decideItem: top, also: hot.slice(1, 3), calm: calm.slice(0, 4), todo, act };
}

/* ---------- Strade mancanti: falso dilemma ---------- */
export type Dilemma = { msg: string; sugg: { kd: PlanKind; name: string; why: string }[] };
const SQ = /\b(resto|rest[ao] (dove|com)|rifiut|lascio|lasciare|com'è|com’è|fermo|non (faccio|accetto|cambio)|niente|rimango|status quo)/i;
export const isStatusQuo = (o: Opt) => o.kd === "sq" || SQ.test(o.name);
const norm2 = (s: string) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function falseDilemma(dec: Decision): Dilemma | null {
  const all = dec.model.options;
  const opts = all.filter((o) => !isOut(o));   // le strade attive
  if (!opts.length) return null;
  // una proposta è «considerata» se esiste una strada attiva di quel tipo, oppure se quella strada concreta (stesso nome) è già stata valutata e scartata
  const seen = new Set([...all.map((o) => norm2(o.name)), ...(dec.model.scartate ?? []).map((x) => norm2(x.name))]);
  const has = (k: PlanKind, name: string) => seen.has(norm2(name)) || opts.some((o) => o.kd === k || (k === "prova" && o.kd === "temp") || (k === "cerca" && o.kd === "rinvio"));
  const sq = opts.some(isStatusQuo);
  const L = (opts.find((o) => !isStatusQuo(o) && (!o.kd || o.kd === "base")) ?? opts[0]).name;
  const sugg: Dilemma["sugg"] = [];
  const cand: Dilemma["sugg"] = [
    { kd: "cond", name: `${L}, solo a condizioni`, why: "Dici sì solo se le condizioni chiave (soldi, casa, tempi) sono garantite, meglio per iscritto." },
    { kd: "prova", name: `${L} in prova o in piccolo, con verifica e uscita`, why: "Provi per un periodo o su scala ridotta (prova, pilota, test), con una data di verifica e un modo concreto per tornare indietro." },
    ...(sq ? [{ kd: "cerca" as PlanKind, name: "Non ora: cerco attivamente un'alternativa", why: "Restare fermo diventa una strada attiva: cerchi un'altra opzione, con una scadenza." }] : []),
  ];
  for (const c of cand) if (!has(c.kd, c.name)) sugg.push(c);
  const binary = opts.length <= 2;
  if (!(binary || sq) || sugg.length < 2) return null;
  const msg = sq && binary
    ? `Stai confrontando «${L}» con il restare dove sei: quasi sempre è un falso dilemma. Le scelte reali hanno strade intermedie, che spesso sono le migliori.`
    : binary ? "Ci sono solo due strade: probabilmente ne mancano." : "Manca almeno una strada intermedia tra sì e no.";
  return { msg, sugg };
}

/* ---------- Decisione condizionata ---------- */
export type CondKind = "utente" | "requisito" | "dato" | "liquidita" | "stimeAI" | "basi" | "doppio";
export type CondKind2 = CondKind | "scenario" | "rischio" | "dilemma" | "rev";
/** grp: «cond» = se è falsa la strada non regge; «chiarire» = l'analisi non è ancora abbastanza affidabile. */
export type VoiView = { key: string; power: number; c?: "facile" | "medio" | "difficile"; days?: number | null; worth: "si" | "forse" | "no" | "?"; late: boolean };
export type CondView = { key: string; t: string; how: string; gate: boolean; kind: CondKind2; grp: "cond" | "chiarire"; optId?: string; condId?: string; st?: Cond["st"]; voi?: VoiView };
export type Ready = {
  state: "vuota" | "nessuna" | "non_pronta" | "pronta";
  lead?: { id: string; name: string };
  /** strada di riserva; open = verifiche vincolanti ancora aperte anche su di lei */
  fallback?: { id: string; name: string; open: string[] } | null;
  open: CondView[]; done: CondView[]; failed: CondView[];
  dilemma: Dilemma | null;
  wait?: WaitView;
};

export function readiness(dec: Decision, r: DecResult, base: Resources = {}, rules: Rule[] = [], info?: InfoItem[]): Ready {
  const dilemma = falseDilemma(dec);
  const nm = normalize(dec.model);
  if (nm.options.length < 2 || !nm.criteria.length) return { state: "vuota", open: [], done: [], failed: [], dilemma };
  const ok = r.rows.filter((x) => !x.excluded.length);
  if (!ok.length) return { state: "nessuna", open: [], done: [], failed: [], dilemma };
  const L = ok[0];
  const o = dec.model.options.find((x) => x.id === L.id)!;
  // chi prevale se la prima cade
  const mm: Model = JSON.parse(JSON.stringify(dec.model));
  mm.options.find((x) => x.id === L.id)!.block = "esclusa per prova";
  const fb = analyzeDecision({ ...dec, model: mm }).rows.find((x) => !x.excluded.length);
  const fbo = fb ? dec.model.options.find((x) => x.id === fb.id) : undefined;
  const fallback = fb ? { id: fb.id, name: fb.name, open: [...(fbo?.cond ?? []).filter((c) => c.gate && c.st === "?").map((c) => c.t), ...fb.pending.map((p) => p.replace(": manca il dato", ""))] } : null;
  const open: CondView[] = [], done: CondView[] = [], failed: CondView[] = [];
  const uc = (o.cond ?? []).map((c): CondView => ({ key: "u" + c.id, t: c.t, how: c.how || `Verifica: ${c.t}`, gate: !!c.gate, kind: "utente", grp: "cond", optId: o.id, condId: c.id, st: c.st }));
  uc.filter((c) => c.st === "si").forEach((c) => done.push(c));
  // condizioni non soddisfatte di tutte le strade: spiegano perché una strada è uscita
  for (const x of dec.model.options) for (const c of x.cond ?? []) if (c.st === "no")
    failed.push({ key: "n" + c.id, t: x.id === o.id ? c.t : `${c.t} (${x.name}${c.gate ? ": esce" : ""})`, how: "", gate: !!c.gate, kind: "utente", grp: "cond", optId: x.id, condId: c.id, st: "no" });
  const uo = uc.filter((c) => c.st === "?");
  uo.filter((c) => c.gate).forEach((c) => open.push(c));
  for (const p of L.pending) open.push({ key: "p" + p, t: p.replace(": manca il dato", ""), how: `Trova il dato per «${p.replace(": manca il dato", "")}» e inseriscilo al passo «Valuta»`, gate: true, kind: "requisito", grp: "cond", optId: L.id });
  const wv = waitView(dec);
  const hot = (info ?? infoValue(dec)).filter((x) => x.flips).map((i) => ({ i, v: voiOf(dec, "d" + i.opt + i.crit, i.share, wv) }))
    .sort((a, b) => voiRank(b.v) - voiRank(a.v)).slice(0, 3);
  for (const { i, v } of hot)
    open.push({ key: "d" + i.opt + i.crit, voi: v,
      // una soglia su una cifra è una condizione; un giudizio ancora stimato è una cosa da chiarire
      grp: i.num ? "cond" : "chiarire",
      t: !i.num
        ? `La tua valutazione di «${i.critName}» per ${i.optName} è ancora ${i.cur ? `una stima (${i.cur})` : "da dare"}: ${i.text}`
        : i.cut && (i.cut.highId === L.id || i.cut.lowId === L.id)
        ? `«${i.critName}» di ${i.optName} ${i.cut.highId === L.id ? i.cut.high : i.cut.low}${i.cur ? ` (oggi stimato ${i.cur})` : " (oggi manca)"}`
        : `«${i.critName}» di ${i.optName}: ${i.text}`, how: i.kind === "manca" ? `Trova il valore di «${i.critName}» per ${i.optName}` : `Verifica «${i.critName}» di ${i.optName} (oggi stimato ${i.cur})`, gate: false, kind: "dato", optId: i.opt });
  if (rules.length) {
    const map = new Map(dec.model.options.map((x) => [x.id, x] as const));
    const sf = applyCombo([L.id], map, [], base, rules, 12, 0);
    if (sf.viol.length) open.push({ key: "liq", t: `Se va male, entro 12 mesi superi i tuoi limiti (${sf.viol.join("; ")}): perché la strada regga serve un cuscinetto o una garanzia`, how: "Prevedi un cuscinetto o una garanzia: anticipo, alloggio pagato, contratto più lungo, data di uscita", gate: false, kind: "liquidita", grp: "cond", optId: L.id });
  }
  const cd = contiDelta(o, dec.model.oggi ?? []);
  if (cd && (cd.missing.length || cd.stime)) open.push({ key: "conti", t: `Nei conti di ${L.name} ${cd.missing.length ? `mancano ${cd.missing.length} importi (${cd.missing.slice(0, 3).join(", ")})` : ""}${cd.missing.length && cd.stime ? " e " : ""}${cd.stime ? `${cd.stime} voci sono stime` : ""}: la differenza mensile non è ancora affidabile`, how: `Completa e verifica i conti di ${L.name} al passo «Soldi e tempo»`, gate: false, kind: "stimeAI", grp: "chiarire", optId: L.id });
  if ((o.impacts ?? []).some((i) => i.src === "ai")) open.push({ key: "ai", t: `Gli importi su soldi e tempo di ${L.name} sono confermati da te, non solo stimati dall'AI`, how: "Conferma o correggi gli importi al passo «Soldi e tempo»", gate: false, kind: "stimeAI", grp: "chiarire", optId: L.id });
  uo.filter((c) => !c.gate).forEach((c) => open.push(c));
  for (const rk of riskViews(o, base, rules).filter((x) => x.p !== "bassa")) {
    if (rk.breaks.length) open.push({ key: "rk" + rk.id, t: `Reggi il rischio «${rk.t}» (se succede: ${eur(rk.tot)}): oggi ti porterebbe oltre i tuoi limiti (${rk.breaks.join("; ")})`, how: rk.x ? `Riduci il rischio «${rk.t}»: ${rk.x}` : `Prepara un cuscinetto o una contromisura per «${rk.t}»`, gate: false, kind: "rischio", grp: "cond", optId: o.id });
    else if (rk.p === "alta" && !rk.x) open.push({ key: "rx" + rk.id, t: `Rischio alto senza contromisura: «${rk.t}»${rk.tot ? ` (se succede: ${eur(rk.tot)})` : ""}`, how: `Decidi cosa faresti se succede «${rk.t}» e scrivilo nel registro dei rischi`, gate: false, kind: "rischio", grp: "chiarire", optId: o.id });
  }
  const sol = solidity(dec, r);
  if (sol && sol.estShare + sol.unkShare >= 50) open.push({ key: "basi", t: `Solo il ${100 - sol.estShare - sol.unkShare}% del punteggio di ${L.name} poggia su dati certi o dichiarati; il ${sol.estShare + sol.unkShare}% deriva da stime o valori senza fonte`, how: "Rendi certi i valori che pesano di più e indica da dove vengono", gate: false, kind: "basi", grp: "chiarire", optId: L.id });
  const dop = biasChecks(dec, r).find((b) => b.k === "doppio");
  if (dop) open.push({ key: "dop", t: `Possibile doppio conteggio: ${dop.t}`, how: "Togli uno dei criteri che misurano la stessa cosa, o abbassane l'importanza", gate: false, kind: "doppio", grp: "chiarire" });
  for (const x of dec.model.options) {
    const iv = invertedScenario(x);
    if (iv && (x.id === L.id || x.id === fallback?.id))
      open.push({ key: "iv" + x.id, t: `Per ${x.name} «se va male» (${iv.sf} €/mese) è migliore di «se va bene» (${iv.fv} €/mese): probabilmente sono spese scritte senza il segno −, e i conti sui soldi sono rovesciati`, how: `Correggi la differenza mensile di ${x.name} al passo «Soldi e tempo»: le spese vanno col segno −, e va messa anche l'entrata (es. stipendio)`, gate: false, kind: "scenario", grp: "chiarire", optId: x.id });
  }
  for (const x of dec.model.options) {
    const od = oddScenario(x);
    if (od && (x.id === L.id || x.id === fallback?.id))
      open.push({ key: "sc" + x.id, t: `Lo scenario «se va male» di ${x.name} ipotizza ${od.sf} €/mese contro ${od.c} €/mese probabili: sembra un altro evento (es. perdere lo stipendio), non una variazione della stessa strada`, how: `Correggi «se va male» di ${x.name} al passo «Soldi e tempo» con una variazione realistica (es. affitto più alto); se temi di perdere il lavoro, rendilo una strada o un rischio a parte`, gate: false, kind: "scenario", grp: "chiarire", optId: x.id });
  }
  // un falso dilemma impedisce «Pronta»: la scelta migliore tra strade incomplete non è una decisione pronta
  if (dilemma) open.push({ key: "dil", t: `Stai confrontando solo poche strade: ${dilemma.msg}`, how: `Aggiungi almeno una strada intermedia al passo «Strade» (${dilemma.sugg.map((x) => `«${x.name}»`).join(", ")}) oppure scarta esplicitamente quelle proposte`, gate: false, kind: "dilemma", grp: "chiarire" });
  const rv = revCheck(dec, r);
  if (rv) open.push({ key: "rev", t: rv.t, how: rv.how, gate: false, kind: "rev", grp: "chiarire", optId: L.id });
  return { wait: wv, state: open.length ? "non_pronta" : "pronta", lead: { id: L.id, name: L.name }, fallback, open, done, failed, dilemma };
}

/** Frase della regola di stop per una condizione che, se falsa, fa uscire la strada. */
export const stopText = (rd: Ready) => !rd.fallback
  ? `Se la risposta è no, ${rd.lead?.name} esce: nessun'altra strada rispetta i requisiti, quindi va cercata una strada nuova.`
  : rd.fallback.open.length
  ? `Se la risposta è no, ${rd.lead?.name} esce e non serve approfondirla oltre. La prossima strada da valutare è ${rd.fallback.name}, che richiede ancora: ${rd.fallback.open.join("; ")}.`
  : `Se la risposta è no, ${rd.lead?.name} esce e la scelta passa a ${rd.fallback.name}: non serve approfondire oltre.`;

/** Frase sulla strada di riserva, prudente se anche lei ha verifiche vincolanti aperte. */
export const fallbackText = (rd: Ready) => !rd.fallback ? "" : rd.fallback.open.length
  ? `Se queste condizioni non si verificano, la prossima strada da valutare è ${rd.fallback.name}, che richiede ancora: ${rd.fallback.open.join("; ")}.`
  : `Se queste condizioni non si verificano, la scelta passa a ${rd.fallback.name}.`;

/* ---------- Scenari incoerenti: «se va male» che è un altro evento ---------- */
/** Segnala una differenza mensile dove «se va male» cambia segno e si allontana molto dal probabile
 *  (es. +2.000 probabile, −1.500 se va male): non è una variazione della stessa strada ma un altro evento. */
export function oddScenario(o: Opt): { sf: number; c: number; fv: number; fix: number } | null {
  const i = (o.impacts ?? []).find((x) => x.r === "cash_m" && Array.isArray(x.v));
  if (!i) return null;
  const [sf, c, fv] = i.v as [number, number, number];
  if (c > 0 && sf < 0 && c - sf > Math.max(c * 0.6, 400)) return { sf, c, fv, fix: Math.round((c * 0.75) / 50) * 50 };
  return null;
}

/* ---------- Registro dei rischi ---------- */
export type RiskView = Risk & { tot: number; breaks: string[]; endAfter: number | null; auto: number | null };
/** Impatto in € di un rischio se succede: una tantum + mensile × durata. */
export const riskTotal = (r: Risk) => (r.c ?? 0) + (r.m ?? 0) * (r.m ? Math.max(1, r.d ?? 1) : 0);

/** Per ogni rischio: impatto totale e se, sommato alla strada nello scenario probabile a 12 mesi, rompe i tuoi limiti. */
export function riskViews(o: Opt, base: Resources = {}, rules: Rule[] = []): RiskView[] {
  const map = new Map([[o.id, o]]);
  const st = applyCombo([o.id], map, [], base, rules, 12, 1);
  const hasCash = base.cash0 != null || base.cash_m != null || (o.impacts ?? []).some((i) => i.r === "cash0" || i.r === "cash_m");
  return (o.risks ?? []).map((r) => {
    const tot = riskTotal(r);
    const endAfter = hasCash && st.res.cash_end != null ? st.res.cash_end + tot : null;
    const breaks: string[] = [];
    if (endAfter != null) for (const ru of rules) if (ru.r === "cash_end" && ru.min != null && endAfter < ru.min) breaks.push(`${ru.name}: a 12 mesi resteresti con ${eur(endAfter)}`);
    // mesi di autonomia se l'impatto mensile del rischio si somma al flusso della strada
    const flow = (st.res.cash_m ?? 0) + (r.m ?? 0);
    const auto = hasCash && r.m && flow < 0 ? Math.max(0, Math.round((((st.res.cash0 ?? 0) + (r.c ?? 0)) / -flow) * 10) / 10) : null;
    for (const ru of rules) if (ru.r === "autonomia_mesi" && ru.min != null && auto != null && auto < ru.min) breaks.push(`${ru.name}: reggeresti ${fmt(auto)} mesi`);
    return { ...r, tot, breaks, endAfter, auto };
  });
}

export type RiskSum = { id: string; name: string; n: number; alte: number; pesato: number; worst: RiskView | null; rompe: number; senzaRimedio: number };
/** Confronto tra strade: numero di rischi, rischi alti, costo pesato (pesi convenzionali), rischio peggiore, quanti rompono i limiti. */
export function riskSummary(dec: Decision, base: Resources = {}, rules: Rule[] = []): RiskSum[] {
  return dec.model.options.map((o) => {
    const v = riskViews(o, base, rules);
    const worst = v.length ? v.reduce((a, b) => (b.tot < a.tot ? b : a)) : null;
    return { id: o.id, name: o.name, n: v.length, alte: v.filter((r) => r.p === "alta").length,
      pesato: Math.round(v.reduce((a, r) => a + RISK_W[r.p] * Math.min(0, r.tot), 0) / 50) * 50,
      worst, rompe: v.filter((r) => r.breaks.length && r.p !== "bassa").length, senzaRimedio: v.filter((r) => r.p !== "bassa" && !r.x).length };
  });
}

/** «Se va male» migliore di «se va bene» (es. 4.000 / 3.000 / 2.500): quasi sempre spese scritte senza il segno −, o ordine invertito. */
export function invertedScenario(o: Opt): { sf: number; c: number; fv: number } | null {
  const i = (o.impacts ?? []).find((x) => x.r === "cash_m" && Array.isArray(x.v));
  if (!i) return null;
  const [sf, c, fv] = i.v as [number, number, number];
  return sf > fv ? { sf, c, fv } : null;
}

/* ---------- Conti: bilancio di oggi e per strada → differenza calcolata ---------- */
/** Valore di una voce in uno scenario (0 sfavorevole, 1 probabile, 2 favorevole): per le spese il peggio è il valore più alto, per le entrate il più basso. */
export function lineVal(l: Line, k: number): number {
  const v = Math.abs(l.v ?? 0);
  const worst = l.k === "s" ? Math.max(v, Math.abs(l.hi ?? l.lo ?? v)) : Math.min(v, Math.abs(l.lo ?? l.hi ?? v));
  const best = l.k === "s" ? Math.min(v, Math.abs(l.lo ?? l.hi ?? v)) : Math.max(v, Math.abs(l.hi ?? l.lo ?? v));
  const x = k === 0 ? worst : k === 2 ? best : v;
  return l.k === "e" ? x : -x;
}
/** Saldo mensile di un insieme di voci, nei tre scenari (solo voci mensili). */
export const saldo = (ls: Line[] = []): [number, number, number] =>
  [0, 1, 2].map((k) => ls.filter((l) => !l.u).reduce((a, l) => a + lineVal(l, k), 0)) as [number, number, number];
export type ContiRes = { oggi: number; strada: [number, number, number]; delta: [number, number, number]; once: number; missing: string[]; stime: number };
/** Differenza rispetto a oggi calcolata dai conti: saldo con la strada − saldo di oggi; una tantum a parte. */
export function contiDelta(o: Opt, oggi: Line[] = []): ContiRes | null {
  if (!o.conti?.length) return null;
  const s0 = saldo(oggi)[1];
  const st = saldo(o.conti);
  const once = o.conti.filter((l) => l.u).reduce((a, l) => a + lineVal(l, 1), 0);
  const missing = [...oggi, ...o.conti].filter((l) => l.v == null).map((l) => l.t);
  return { oggi: s0, strada: st, delta: st.map((x) => Math.round(x - s0)) as [number, number, number], once: Math.round(once), missing, stime: o.conti.filter((l) => l.f === "S").length };
}
/** Riporta negli impatti la differenza calcolata dai conti (sostituisce i valori a mano su mensile e spesa iniziale). */
export function syncConti(m: Model): Model {
  for (const o of m.options) {
    const c = contiDelta(o, m.oggi ?? []);
    if (!c) continue;
    o.impacts = (o.impacts ?? []).filter((i) => i.r !== "cash_m" && !(i.r === "cash0" && i.src === "conti"));
    o.impacts.push({ r: "cash_m", v: c.delta, src: "conti" });
    if (c.once) { o.impacts = o.impacts.filter((i) => i.r !== "cash0"); o.impacts.push({ r: "cash0", v: c.once, src: "conti" }); }
  }
  return m;
}

/* ---------- Costo del non decidere ---------- */
export type WaitView = { left: number | null; m: number; c7: number; c30: number; c90: number; exp: { id: string; name: string; days: number }[]; t?: string };
/** Giorni di calendario da oggi a una data (oggi = 0). */
export const daysTo = (iso: string) => Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / 86400000);
/** Quanto costa aspettare 7/30/90 giorni: € persi al mese (indicati da te) e strade che scadono nel frattempo. */
export function waitView(dec: Decision): WaitView {
  const m = Math.abs(dec.model.wait?.m ?? 0);
  const exp = dec.model.options.filter((o) => o.exp && !isOut(o)).map((o) => ({ id: o.id, name: o.name, days: daysTo(o.exp!) })).filter((x) => x.days >= 0).sort((a, b) => a.days - b.days);
  const lefts = [dec.due ? daysTo(dec.due) : null, exp[0]?.days ?? null].filter((x): x is number => x != null);
  return { left: lefts.length ? Math.min(...lefts) : null, m, c7: Math.round((m * 7) / 30), c30: m, c90: m * 3, exp, t: dec.model.wait?.t };
}

/* ---------- Valore dell'informazione: potere di ribaltare × costo per saperlo ---------- */
const VC: Record<string, number> = { facile: 1, medio: 2, difficile: 4 };
export function voiOf(dec: Decision, key: string, share: number, wv?: WaitView): VoiView {
  const x = dec.model.voi?.[key];
  const power = Math.round(share * 100);
  const late = !!(x?.days && wv?.left != null && x.days > wv.left);
  let worth: VoiView["worth"] = "?";
  if (x) worth = late ? "no" : share >= 0.2 && x.c !== "difficile" ? "si" : share < 0.1 && x.c === "difficile" ? "no" : share >= 0.1 || x.c === "facile" ? "si" : "forse";
  return { key, power, c: x?.c, days: x?.days ?? null, worth, late };
}
const voiRank = (v: VoiView) => (v.worth === "no" ? -1 : v.power / (v.c ? VC[v.c] : 2));

/* ---------- Reversibilità ---------- */
export function revOf(o: Opt): { irr: boolean; rev: boolean; text: string } | null {
  const r = o.rev;
  if (!r || (r.out == null && r.back == null && !r.lock)) return null;
  const irr = r.lock === "alto" || (r.back ?? 0) >= 12;
  const rev = r.lock === "basso" || ((r.back ?? 99) <= 3 && r.lock !== "alto");
  const parts = [r.out ? `uscire costa ${eur(Math.abs(r.out))}` : "", r.back != null ? `per tornare indietro servono ${fmt(r.back)} mesi` : "", r.lock ? `lock-in ${r.lock}` : ""].filter(Boolean);
  return { irr, rev: rev && !irr, text: parts.join(", ") };
}
/** Una strada in testa poco reversibile, con un'alternativa reversibile vicina nel punteggio: va detto. */
export function revCheck(dec: Decision, r: DecResult): { t: string; how: string } | null {
  const ok = r.rows.filter((x) => !x.excluded.length);
  if (ok.length < 2) return null;
  const L = dec.model.options.find((o) => o.id === ok[0].id)!;
  const lr = revOf(L);
  if (!lr?.irr) return null;
  for (const row of ok.slice(1)) {
    const o = dec.model.options.find((x) => x.id === row.id)!;
    const orv = revOf(o);
    const gap = Math.round((ok[0].score - row.score) * 10) / 10;
    if (orv?.rev && gap <= 5)
      return { t: `«${L.name}» supera «${o.name}» di soli ${fmt(gap)} punti ma è molto più difficile da invertire (${lr.text}); «${o.name}» invece è reversibile (${orv.text})`, how: `Chiediti se ${fmt(gap)} punti valgono il lock-in, oppure rendi «${L.name}» più reversibile (clausola di uscita, periodo di prova)` };
  }
  return null;
}
