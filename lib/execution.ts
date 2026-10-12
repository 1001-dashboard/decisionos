// I passi aggiunti da te hanno chiave «t_…»; gli altri usano la chiave della verifica (es. «u<id condizione>», «d<strada><criterio>»).
// Decision → Execution: le verifiche della decisione diventano passi con responsabile, scadenza e dipendenze.
// Non è una checklist separata: completare un passo cambia il modello (condizione vera/falsa, dato verificato, contromisura),
// e la decisione si ricalcola. Nessuna AI qui.
import { type Decision, type Ready, type CondView, type PlanStep, stopText } from "./engine.ts";

/** Cosa fa il pulsante del passo. vai = porta al passo della procedura (0 Strade … 5 Decisione). */
export type PlanAction =
  | { k: "cond"; opt: string; cond: string }
  | { k: "dato"; opt: string; crit: string }
  | { k: "rischio"; opt: string; risk: string }
  | { k: "ver"; opt: string }
  | { k: "vai"; step: number; label: string }
  | { k: "spunta" };
export type PlanItem = {
  key: string; t: string; why?: string; gate: boolean; auto: boolean; ph: "prima" | "dopo";
  who?: string; due?: string; dep?: string; done?: string;
  late: boolean; blocked?: string; stop?: string; act: PlanAction;
};
export type Plan = { prima: PlanItem[]; dopo: PlanItem[]; fatti: PlanItem[]; late: number; blocked: number };

const STEP_OF: Partial<Record<CondView["kind"], [number, string]>> = {
  dilemma: [0, "Strade"], rev: [0, "Strade"], utente: [0, "Strade"],
  basi: [3, "Valuta"], prove: [3, "Valuta"], doppio: [2, "Cosa conta"], requisito: [3, "Valuta"],
  stimeAI: [4, "Soldi e tempo"], liquidita: [4, "Soldi e tempo"], scenario: [4, "Soldi e tempo"], rischio: [1, "Conseguenze"],
};

function actionOf(c: CondView): PlanAction {
  if (c.condId && c.optId) return { k: "cond", opt: c.optId, cond: c.condId };
  if (c.kind === "dato" && c.optId && c.critId) return { k: "dato", opt: c.optId, crit: c.critId };
  if (c.kind === "rischio" && c.optId && c.riskId && c.key.startsWith("rx")) return { k: "rischio", opt: c.optId, risk: c.riskId };
  if (c.key === "ver" && c.optId) return { k: "ver", opt: c.optId };
  const s = STEP_OF[c.kind];
  return s ? { k: "vai", step: s[0], label: s[1] } : { k: "spunta" };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Il piano della decisione: prima (verifiche, nell'ordine di readiness, poi i tuoi passi), dopo (attuazione della scelta), fatti. */
export function execPlan(dec: Decision, rd: Ready, now = today()): Plan {
  const st = dec.model.act ?? {};
  const mk = (key: string, base: Omit<PlanItem, "who" | "due" | "dep" | "done" | "late" | "blocked">): PlanItem => {
    const s: PlanStep = st[key] ?? {};
    return { ...base, who: s.who, due: s.due, dep: s.dep, done: s.done, late: !s.done && !!s.due && s.due < now };
  };
  const open = new Set(rd.open.map((c) => c.key));
  const prima: PlanItem[] = rd.open.map((c) => mk(c.key, {
    key: c.key, t: c.how, why: c.t !== c.how ? c.t : undefined, gate: c.gate, auto: true, ph: "prima",
    stop: c.gate ? stopText(rd) : undefined, act: actionOf(c),
  }));
  const mine = Object.entries(st).filter(([k, s]) => k.startsWith("t_") && s.t);
  for (const [k, s] of mine.filter(([, s]) => (s.ph ?? "prima") === "prima" && !s.done)) prima.push(mk(k, { key: k, t: s.t!, gate: false, auto: false, ph: "prima", act: { k: "spunta" } }));
  const dopo = mine.filter(([, s]) => s.ph === "dopo" && !s.done).map(([k, s]) => mk(k, { key: k, t: s.t!, gate: false, auto: false, ph: "dopo", act: { k: "spunta" } }));
  // fatti: passi chiusi dal piano (anche quelli automatici, che non sono più aperti perché il modello è cambiato)
  const fatti = Object.entries(st).filter(([k, s]) => s.done && !open.has(k)).map(([k, s]) => ({
    key: k, t: s.t ?? doneText(k, dec), gate: false, auto: !k.startsWith("t_"), ph: s.ph ?? "prima", who: s.who, due: s.due, dep: s.dep, done: s.done, late: false, act: { k: "spunta" } as PlanAction,
  })).sort((a, b) => (b.done ?? "").localeCompare(a.done ?? ""));
  // dipendenze: un passo aspetta l'altro finché quello non è fatto; ordine: prima chi non aspetta nessuno
  const all = [...prima, ...dopo];
  const title = new Map(all.map((x) => [x.key, x.t]));
  for (const x of all) if (x.dep && title.has(x.dep)) x.blocked = title.get(x.dep);
  const ord = (l: PlanItem[]) => {
    const out: PlanItem[] = [], seen = new Set<string>();
    const put = (x: PlanItem) => {
      if (seen.has(x.key)) return;
      seen.add(x.key);   // segnato prima di scendere: due passi che si aspettano a vicenda non creano un ciclo
      const d = x.dep ? l.find((y) => y.key === x.dep) : undefined;
      if (d) put(d);
      out.push(x);
    };
    l.forEach((x) => put(x));
    return out;
  };
  return { prima: ord(prima), dopo: ord(dopo), fatti, late: all.filter((x) => x.late).length, blocked: all.filter((x) => x.blocked).length };
}

/** Testo di un passo automatico già chiuso: ricostruito dal modello (la condizione o il dato a cui si riferiva). */
function doneText(key: string, dec: Decision): string {
  for (const o of dec.model.options) {
    const c = (o.cond ?? []).find((x) => key === "u" + x.id);
    if (c) return `${c.t}: ${c.st === "si" ? "verificata" : c.st === "no" ? "non soddisfatta" : "da verificare"}`;
    for (const r of o.risks ?? []) if (key === "rx" + r.id || key === "rk" + r.id) return `Contromisura per «${r.t}»${r.x ? `: ${r.x}` : ""}`;
    for (const k of dec.model.criteria) if (key === "d" + o.id + k.id) return `Verificato «${k.name}» di ${o.name}`;
  }
  return key === "ver" ? "Strada in testa verificata" : "Passo completato";
}

/** Aggiorna i metadati di un passo (chi, entro, dopo, fatto). Restituisce un nuovo oggetto act. */
export function setStep(act: Record<string, PlanStep> | undefined, key: string, pt: Partial<PlanStep>): Record<string, PlanStep> {
  const cur = act?.[key] ?? {};
  const nx: PlanStep = { ...cur, ...pt };
  for (const k of Object.keys(nx) as (keyof PlanStep)[]) if (nx[k] === "" || nx[k] == null) delete nx[k];
  return { ...(act ?? {}), [key]: nx };
}
