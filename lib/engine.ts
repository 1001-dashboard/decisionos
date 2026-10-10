// Decision OS - motore deterministico. Nessuna AI qui: risultati ripetibili e ricostruibili.

export type Rel = "F" | "D" | "S" | "?";
export type Crit = { id: string; name: string; w: number; group?: string; lo?: string; hi?: string };
export type Constraint = { id: string; name: string; crit: string; min?: number | null; max?: number | null };
export type Impact = { r: string; v: number | [number, number, number]; tag?: string };
export type Meta = { why?: string; rel?: Rel; src?: string; dt?: string };
export type Opt = {
  id: string; name: string;
  s: Record<string, number>;
  m?: Record<string, Meta>;
  block?: string;
  impacts?: Impact[];
};
export type Assumption = { id: string; t: string; rel: Rel; aff?: "alta" | "media" | "bassa"; src?: string; dt?: string };
export type Model = { criteria: Crit[]; constraints: Constraint[]; options: Opt[]; assumptions?: Assumption[] };
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
  const why: string[] = [];
  if (o.block) why.push(o.block);
  for (const k of cons) {
    const cn = crit.find((c) => c.id === k.crit)?.name ?? k.crit;
    const s = o.s?.[k.crit];
    if (s == null) why.push(`${k.name || cn}: dato mancante`);
    else if (k.min != null && s < k.min) why.push(`${k.name || cn}: ${s} < ${k.min}`);
    else if (k.max != null && s > k.max) why.push(`${k.name || cn}: ${s} > ${k.max}`);
  }
  return why;
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
  excluded: string[]; missing: string[];
  detail: { crit: string; name: string; w: number; s: number | null; contrib: number | null; meta?: Meta }[];
};
export type DecResult = {
  id: string; name: string; warn: string[]; rows: Row[]; sens: Sens[];
  margin: number | null; feasible: string[]; fragile: Sens[]; tie: boolean; weightSum: number;
};

export function analyzeDecision(dec: Decision): DecResult {
  const { criteria: crit, constraints: cons, options } = dec.model;
  const tw = crit.reduce((a, c) => a + (c.w || 0), 0);
  const warn: string[] = [];
  if (crit.length && tw !== 100) warn.push(`Somma pesi = ${tw} (attesa 100): punteggi normalizzati sul totale.`);
  const groups: Record<string, string[]> = {};
  for (const c of crit) if (c.group) (groups[c.group] ??= []).push(c.name);
  for (const [g, n] of Object.entries(groups))
    if (n.length > 1) warn.push(`Possibile doppio conteggio nel gruppo "${g}": ${n.join(", ")}.`);
  if (options.length < 2) warn.push("Servono almeno due alternative per un confronto.");

  const ok: Opt[] = [];
  const rows: Row[] = options.map((o) => {
    const miss = crit.filter((c) => o.s?.[c.id] == null).map((c) => c.name);
    const why = feasible(o, cons, crit);
    if (!why.length) ok.push(o);
    const lo = crit.reduce((a, c) => a + c.w * (o.s?.[c.id] ?? 0), 0) / (tw || 1);
    const hi = crit.reduce((a, c) => a + c.w * (o.s?.[c.id] ?? 100), 0) / (tw || 1);
    return {
      id: o.id, name: o.name, score: r1(score(o, crit)),
      range: miss.length ? [r1(lo), r1(hi)] : null,
      excluded: why, missing: miss,
      detail: crit.map((c) => {
        const s = o.s?.[c.id];
        return { crit: c.id, name: c.name, w: c.w, s: s ?? null, contrib: s == null ? null : r1((c.w * s) / (tw || 1)), meta: o.m?.[c.id] };
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
    r.autonomia_mesi = r.cash_m >= 0 ? Infinity : r1(r.cash0 / -r.cash_m);
  }
  const viol: string[] = [];
  for (const ru of rules) {
    const x = r[ru.r];
    if (x == null) continue;
    if (ru.min != null && x < ru.min) viol.push(`${ru.name}: ${fmt(x)} < ${fmt(ru.min)}`);
    if (ru.max != null && x > ru.max) viol.push(`${ru.name}: ${fmt(x)} > ${fmt(ru.max)}`);
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
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n);
}
export function eur(n: number) {
  if (n === Infinity) return "∞";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}
export const uid = () => Math.random().toString(36).slice(2, 10);
