// Monitoraggio e debito decisionale. Una decisione non finisce quando premi «Scelta»: regge finché certe cose restano vere.
// Nessuna AI qui: le soglie vengono dal motore (dove la scelta smette di essere la migliore), dalle condizioni verificate,
// dai rischi e dai tuoi limiti di liquidità. Le osservazioni le inserisci tu.
import {
  type Decision, type Watch, type Resources, type Rule, type Model,
  normalize, feasible, score, fmt, eur, uid, cashBreakpoint, readiness, analyzeDecision, evidenceOf, STALE_DAYS,
} from "./engine.ts";
import { execPlan } from "./execution.ts";

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => new Date(Date.parse(iso.slice(0, 10)) + n * 86400000).toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Chi è in testa (stessa regola di analyzeDecision: punteggio arrotondato, a parità la prima). */
function leaderOf(model: Model): string {
  const { criteria: crit, constraints: cons, options } = normalize(model);
  let best = "-", bs = -Infinity;
  for (const x of options) { if (feasible(x, cons, crit).why.length) continue; const sc = r1(score(x, crit)); if (sc > bs) { bs = sc; best = x.id; } }
  return best;
}
const nice = (x: number, span: number) => { const st = span >= 5000 ? 100 : span >= 1000 ? 50 : span >= 100 ? 10 : span >= 10 ? 1 : 0.1; return Math.round(x / st) * st; };

/** Soglia di un valore reale della strada scelta oltre la quale smette di essere la migliore. null se nell'intervallo plausibile resta in testa. */
export function thresholdOf(dec: Decision, optId: string, critId: string): { op: "<" | ">"; v: number } | null {
  const c = dec.model.criteria.find((x) => x.id === critId);
  const o = dec.model.options.find((x) => x.id === optId);
  if (!c || !o || c.kind !== "num" || c.worst == null || c.best == null || c.worst === c.best) return null;
  const cur = o.raw?.[critId];
  if (cur == null) return null;
  const span = Math.abs(c.best - c.worst);
  const lo = Math.min(c.worst, c.best) - span / 2, hi = Math.max(c.worst, c.best) + span / 2;
  const at = (v: number) => leaderOf({ ...dec.model, options: dec.model.options.map((x) => (x.id === optId ? { ...x, raw: { ...(x.raw ?? {}), [critId]: v } } : x)) });
  if (at(cur) !== optId) return null;
  // cerco il punto più vicino al valore di oggi, prima scendendo poi salendo
  const find = (dir: -1 | 1) => {
    const end = dir < 0 ? lo : hi;
    const N = 40;
    let prev = cur;
    for (let i = 1; i <= N; i++) {
      const v = cur + ((end - cur) * i) / N;
      if (at(v) !== optId) {
        let a = prev, b = v;
        for (let k = 0; k < 18; k++) { const mid = (a + b) / 2; if (at(mid) === optId) a = mid; else b = mid; }
        return b;
      }
      prev = v;
    }
    return null;
  };
  const down = find(-1), up = find(1);
  const cand = [down != null ? { op: "<" as const, v: down } : null, up != null ? { op: ">" as const, v: up } : null].filter(Boolean) as { op: "<" | ">"; v: number }[];
  if (!cand.length) return null;
  const pick = cand.sort((a, b) => Math.abs(a.v - cur) - Math.abs(b.v - cur))[0];
  return { op: pick.op, v: nice(pick.v, span) };
}

/** Condizioni di revisione proposte quando registri la scelta. Le puoi togliere o aggiungerne di tue. */
export function watchProposals(dec: Decision, optId: string, base: Resources = {}, rules: Rule[] = [], from = today()): Watch[] {
  const o = dec.model.options.find((x) => x.id === optId);
  if (!o) return [];
  const out: Watch[] = [];
  const W = (w: Omit<Watch, "id" | "src" | "every" | "from">): Watch => ({ id: uid(), src: "auto", every: 30, from, ...w });
  // 1. soglie: dove la strada scelta smette di essere la migliore (le più vicine al valore di oggi)
  const ths = dec.model.criteria.map((c) => ({ c, th: thresholdOf(dec, optId, c.id), cur: o.raw?.[c.id] }))
    .filter((x) => x.th && x.cur != null)
    .sort((a, b) => Math.abs(a.th!.v - a.cur!) / Math.abs((a.c.best ?? 1) - (a.c.worst ?? 0) || 1) - Math.abs(b.th!.v - b.cur!) / Math.abs((b.c.best ?? 1) - (b.c.worst ?? 0) || 1))
    .slice(0, 3);
  for (const { c, th, cur } of ths) out.push(W({ k: "num", opt: optId, crit: c.id, op: th!.op, v: th!.v, unit: c.unit,
    t: `«${c.name}» ${th!.op === "<" ? "scende sotto" : "sale sopra"} ${fmt(th!.v)}${c.unit ? " " + c.unit : ""} (oggi ${fmt(cur!)}${c.unit ? " " + c.unit : ""})` }));
  // 2. liquidità: sotto quale differenza mensile i tuoi limiti saltano
  const cm = (o.impacts ?? []).find((i) => i.r === "cash_m");
  const c0 = (o.impacts ?? []).find((i) => i.r === "cash0");
  if (cm && rules.length) {
    const c0v = Array.isArray(c0?.v) ? c0!.v[1] : (c0?.v as number | undefined) ?? 0;
    const bp = cashBreakpoint({ cash0: (base.cash0 ?? 0) + c0v }, rules, 24);
    const cv = Array.isArray(cm.v) ? cm.v[1] : cm.v;
    if (bp != null && bp < cv) out.push(W({ k: "num", opt: optId, metric: "cash_m", op: "<", v: Math.round(bp / 10) * 10, unit: "€/mese",
      t: `La differenza mensile reale rispetto a prima scende sotto ${eur(Math.round(bp / 10) * 10)}/mese (previsti ${eur(cv)}): oltre, i tuoi limiti di liquidità non reggono` }));
  }
  // 3. condizioni verificate: devono restare vere
  for (const c of (o.cond ?? []).filter((x) => x.st === "si")) out.push(W({ k: "cond", opt: optId, cond: c.id, t: `${c.t}: resta vero` }));
  // 4. rischi medi e alti: se succedono, il quadro cambia
  for (const r of (o.risks ?? []).filter((x) => x.p !== "bassa")) out.push(W({ k: "rischio", opt: optId, risk: r.id, t: `Succede: ${r.t}` }));
  return out.slice(0, 8);
}

export type WatchState = { hit: boolean; last?: { at: string; v?: number; ok?: boolean }; next: string; due: boolean };
/** Stato di una condizione di revisione: scattata (il presupposto non è più vero) e se è ora di ricontrollarla. */
export function watchState(w: Watch, now = today()): WatchState {
  const last = w.obs?.length ? w.obs[w.obs.length - 1] : undefined;
  let hit = false;
  if (last) {
    if (w.k === "num" && last.v != null && w.v != null) hit = w.op === "<" ? last.v < w.v : last.v > w.v;
    else if (w.k === "rischio") hit = last.ok === true;
    else hit = last.ok === false;
  }
  const next = addDays(last?.at ?? w.from ?? now, w.every ?? 30);
  return { hit, last, next, due: !hit && next <= now };
}

export type Monitor = { state: "osservazione" | "rivedere"; hits: Watch[]; due: Watch[] } | null;
/** Una decisione presa con condizioni di revisione è «in osservazione»; se una scatta, va «rivista». */
export function monitorOf(dec: Decision, now = today()): Monitor {
  if (dec.status !== "presa" || !dec.model.watch?.length) return null;
  const st = dec.model.watch.map((w) => ({ w, s: watchState(w, now) }));
  const hits = st.filter((x) => x.s.hit).map((x) => x.w);
  return { state: hits.length ? "rivedere" : "osservazione", hits, due: st.filter((x) => x.s.due).map((x) => x.w) };
}

/** Registra un'osservazione: valore di oggi (numeri) o sì/no. */
export function observe(m: Model, id: string, ob: { v?: number; ok?: boolean }, now = today()): Model {
  const w = m.watch?.find((x) => x.id === id);
  if (w) (w.obs ??= []).push({ at: now, ...ob });
  return m;
}

/* ---------- Debito decisionale ---------- */
export type DebtItem = { id: string; name: string; why: string; h: string };
export type DebtGroup = { k: string; t: string; items: DebtItem[] };
type OutcomeLike = { id: string; decision_id: string | null; decision_name: string; review_at?: string | null; observed?: string | null; act?: object | null };

/** Il debito decisionale: decisioni scadute, rinviate più volte, ferme, passi in ritardo, scelte da rivedere, controlli scaduti,
 *  scelte senza condizioni di revisione, esiti mai verificati. Solo ciò che si può contare: nessuna stima. */
export function decisionDebt(decisions: (Decision & { updated_at?: string })[], outcomes: OutcomeLike[], base: Resources = {}, rules: Rule[] = [], now = today()): { groups: DebtGroup[]; n: number } {
  const h = (d: Decision) => `/app/decisioni/${d.id}`;
  const g: Record<string, DebtGroup> = {
    rivedere: { k: "rivedere", t: "Scelte da rivedere: un presupposto non è più vero", items: [] },
    scadute: { k: "scadute", t: "Decisioni oltre la data che ti eri dato", items: [] },
    ritardo: { k: "ritardo", t: "Passi del piano in ritardo", items: [] },
    controlli: { k: "controlli", t: "Controlli da fare sulle scelte prese", items: [] },
    ferme: { k: "ferme", t: "Decisioni ferme da oltre 3 settimane", items: [] },
    rinviate: { k: "rinviate", t: "Decisioni rinviate più volte", items: [] },
    esiti: { k: "esiti", t: "Esiti mai verificati", items: [] },
    senza: { k: "senza", t: "Scelte prese senza condizioni di revisione", items: [] },
    dati: { k: "dati", t: `Decisioni che poggiano su dati scaduti o vecchi di oltre ${STALE_DAYS} giorni`, items: [] },
  };
  const old = addDays(now, -21);
  for (const d of decisions) {
    if (d.status === "aperta") {
      if (d.due && d.due < now) g.scadute.items.push({ id: d.id, name: d.name, why: `scaduta il ${new Date(d.due).toLocaleDateString("it-IT")}`, h: h(d) });
      if ((d.model.rinvii ?? 0) >= 2) g.rinviate.items.push({ id: d.id, name: d.name, why: `data spostata ${d.model.rinvii} volte`, h: h(d) });
      if (d.model.options.length >= 2 && d.model.criteria.length) {
        const rd = readiness(d, analyzeDecision(d), base, rules);
        const pl = execPlan(d, rd, now);
        if (pl.late) g.ritardo.items.push({ id: d.id, name: d.name, why: `${pl.late} ${pl.late === 1 ? "passo" : "passi"} oltre la scadenza`, h: h(d) });
        if (rd.state === "non_pronta" && d.updated_at && d.updated_at.slice(0, 10) < old) g.ferme.items.push({ id: d.id, name: d.name, why: `ferma dal ${new Date(d.updated_at).toLocaleDateString("it-IT")}, ${rd.open.length} verifiche aperte`, h: h(d) });
      }
    }
    if ((d.status === "aperta" || d.status === "presa") && d.model.options.length >= 2 && d.model.criteria.length) {
      const ev = evidenceOf(d, analyzeDecision(d), now);
      if (ev && (ev.old || ev.expired)) g.dati.items.push({ id: d.id, name: d.name, why: ev.items.filter((x) => x.old || x.expired).map((x) => `«${x.name}» ${x.expired ? "scaduto" : `di ${x.age} giorni fa`}`).join(", "), h: h(d) });
    }
    if (d.status === "presa") {
      const mo = monitorOf(d, now);
      if (mo?.hits.length) g.rivedere.items.push({ id: d.id, name: d.name, why: mo.hits.map((w) => w.t).join("; "), h: h(d) });
      if (mo?.due.length) g.controlli.items.push({ id: d.id, name: d.name, why: `${mo.due.length} ${mo.due.length === 1 ? "condizione da ricontrollare" : "condizioni da ricontrollare"}`, h: h(d) });
      if (!d.model.watch?.length) g.senza.items.push({ id: d.id, name: d.name, why: "non sai quando andrebbe riaperta", h: h(d) });
    }
  }
  for (const o of outcomes) if (o.review_at && o.review_at <= now && !o.observed && !(o.act && Object.keys(o.act).length))
    g.esiti.items.push({ id: o.id, name: o.decision_name, why: `revisione prevista il ${new Date(o.review_at).toLocaleDateString("it-IT")}`, h: "/app/registro" });
  const groups = Object.values(g).filter((x) => x.items.length);
  return { groups, n: groups.reduce((a, x) => a + x.items.length, 0) };
}
