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
export type Impact = { r: string; v: number | [number, number, number]; tag?: string; src?: "ai" | "user" };
export type Meta = { why?: string; rel?: Rel; src?: string; dt?: string };
export type Opt = {
  id: string; name: string; note?: string;
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
  ai?: { contro?: AiNote };
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
    const rows = D.model.options.map((x): CrossRow => {
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
export function redactMoney(t: string): string {
  return t
    .replace(/€\s*\d[\d.,']*(\s*(k|mila)\b)?/gi, "[cifra]")
    .replace(/\d[\d.,']*(\s*(k|mila))?\s*(€|euro\b|eur\b)/gi, "[cifra]");
}

/* ---------- Conclusività: la prima resta prima anche nel caso peggiore dei dati mancanti? ---------- */
export type Concl = { ok: boolean; missing: number; missW: number; contenders: string[] };
export function conclusive(dec: Decision, r: DecResult): Concl {
  const ok = r.rows.filter((x) => !x.excluded.length);
  const missing = ok.reduce((a, x) => a + x.missing.length, 0);
  const tw = r.weightSum || 1;
  const nm = normalize(dec.model);
  const missW = Math.round(Math.max(0, ...ok.map((x) => nm.criteria.filter((c) => x.missing.includes(c.name)).reduce((a, c) => a + c.w, 0))) / tw * 100);
  if (ok.length < 2 || !missing) return { ok: true, missing, missW, contenders: [] };
  const lo = (x: Row) => (x.range ? x.range[0] : x.score), hi = (x: Row) => (x.range ? x.range[1] : x.score);
  const best = ok.reduce((a, b) => (lo(b) > lo(a) ? b : a));              // chi ha il caso peggiore più alto
  const rivals = ok.filter((x) => x.id !== best.id && hi(x) >= lo(best));  // chi potrebbe ancora superarla
  return { ok: !rivals.length, missing, missW, contenders: rivals.length ? [best.name, ...rivals.map((x) => x.name)] : [] };
}
