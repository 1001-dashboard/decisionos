import { BP } from "./bp.ts";
import { uid, LEVELS, levelOf, isMoneyCrit, redactMoney, normalize, type Decision, type DecResult, type Model, type Rel, type Resources, type Opt, type Phase, type PlanKind } from "./engine.ts";

export async function ai<T = unknown>(mode: string, payload: unknown): Promise<T> {
  const r = await fetch(`${BP}/api/ai`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, payload }) });
  const j = await r.json().catch(() => ({ e: "Risposta non valida" }));
  if (!r.ok || j.e) throw new Error(j.e || "Errore");
  return j.data as T;
}

/** Payload minimo per l'AI: chiavi brevi, solo ciò che serve.
 *  Con eco=false nessun importo in € esce: i valori dei criteri economici diventano una posizione sulla scala
 *  (es. "buono"), le soglie in € spariscono, i testi liberi vengono ripuliti. Il server applica comunque una seconda pulizia. */
export function compact(d: Decision, r: DecResult | undefined, opts: { eco: boolean; ctx?: string; res?: Resources }) {
  const m = d.model;
  const nm = normalize(m);
  const tx = (t?: string) => (t == null ? undefined : opts.eco ? t : redactMoney(t));
  const money = (cid: string) => { const c = m.criteria.find((x) => x.id === cid); return !!c && isMoneyCrit(c); };
  return {
    n: tx(d.name), t: tx(d.descr || undefined),
    ...(opts.eco ? { eco: true } : { privacy: "importi in € oscurati per scelta dell'utente: ragiona su posizioni relative" }),
    c: m.criteria.map((c) => [c.name, c.imp ? `imp ${c.imp}/5` : c.w,
      ...(c.kind === "num" ? [!opts.eco && isMoneyCrit(c) ? `scala in ${c.unit ?? "€"} (importi oscurati)` : `${c.worst}→${c.best} ${c.unit ?? ""}`.trim()] : [])]),
    v: m.constraints.map((k) => {
      const nmC = m.criteria.find((c) => c.id === k.crit)?.name;
      return !opts.eco && money(k.crit) ? `${nmC}: soglia minima/massima in € (oscurata)` : `${nmC} ${k.min != null ? "≥" + k.min : ""}${k.max != null ? "≤" + k.max : ""}`;
    }),
    o: m.options.map((o) => ({
      id: o.id, n: tx(o.name),
      s: Object.fromEntries(m.criteria.map((c) => {
        if (c.kind === "num") {
          if (o.raw?.[c.id] == null) return [c.name, null];
          if (!opts.eco && isMoneyCrit(c)) {
            const sc = nm.options.find((x) => x.id === o.id)?.s[c.id];
            return [c.name, sc == null ? "cifra oscurata" : `${LEVELS[levelOf(sc)].toLowerCase()} sulla scala (cifra oscurata)`];
          }
          return [c.name, `${o.raw[c.id]} ${c.unit ?? ""}`.trim()];
        }
        return [c.name, o.s[c.id] == null ? null : c.kind === "g" ? LEVELS[levelOf(o.s[c.id])] : o.s[c.id]];
      })),
      y: Object.fromEntries(Object.entries(o.m ?? {}).filter(([, x]) => x.why).map(([k, x]) => [m.criteria.find((c) => c.id === k)?.name ?? k, `${tx(x.why)} [${x.rel ?? "D"}]`])),
      ...(o.kd && o.kd !== "base" ? { kd: o.kd } : {}),
      ...(o.cond?.length ? { cd: o.cond.map((c) => `${tx(c.t)} [${c.st}${c.gate ? ",vincolante" : ""}]`) } : {}),
      ...((o.pro?.length || o.con?.length) ? { pc: [(o.pro ?? []).map((x) => tx(x)), (o.con ?? []).map((x) => tx(x))] } : {}),
      ...(opts.eco ? { im: (o.impacts ?? []).map((i) => [i.r, i.v, i.src === "ai" ? "stima AI" : ""]) } : {}),
    })),
    i: (m.assumptions ?? []).map((a) => `${tx(a.t)} [${a.rel}${a.aff ? "," + a.aff : ""}]`),
    ...(r ? {
      r: r.rows.map((x) => [x.name, x.score, x.excluded.length ? "ESCLUSA:" + tx(x.excluded.join(";")) : x.range ? `range ${x.range.join("-")}` : ""]),
      sens: r.sens.filter((s) => s.delta != null).map((s) => `${s.name} ${s.delta}pt→${r.rows.find((x) => x.id === s.newTop)?.name}`),
    } : {}),
    ...(opts.eco && opts.res ? { base: opts.res } : {}),
    ...(opts.ctx ? { ctx: tx(opts.ctx) } : {}),
  };
}

/** Strada proposta dall'AI: tipo di piano, conseguenze nel tempo, decisioni generate, condizioni. */
export type AiPlan = {
  n: string; kd?: string; p?: string[]; m?: string[];
  tl?: { h?: number; a?: string; t?: string }[]; nx?: string[]; cd?: { t?: string; h?: string; g?: boolean }[];
};
export type AiStrade = { x?: string; a?: AiPlan[] };

const KD = ["base", "cond", "prova", "cerca"];
const AR = ["soldi", "tempo", "famiglia", "lavoro", "casa", "progetti", "rischi"];
/** Converte in modo difensivo la parte «piano» di una strada proposta dall'AI. Tutto resta marcato come proposto dall'AI. */
export function planFromAi(o: Partial<AiPlan>): Pick<Opt, "kd" | "tl" | "next" | "cond"> {
  const tx = (v: unknown, n = 160) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const tl = arr<NonNullable<AiPlan["tl"]>[0]>(o.tl).filter((x) => x && tx(x.t)).slice(0, 8).map((x) => {
    const h = [1, 3, 6, 12].reduce((a, b) => (Math.abs(b - Number(x.h ?? 3)) < Math.abs(a - Number(x.h ?? 3)) ? b : a), 3);
    return { h, a: (AR.includes(String(x.a)) ? x.a : undefined) as Phase["a"], t: tx(x.t), src: "ai" as const };
  });
  const next = arr<string>(o.nx).map((x) => tx(x, 140)).filter(Boolean).slice(0, 5);
  const cond = arr<NonNullable<AiPlan["cd"]>[0]>(o.cd).filter((x) => x && tx(x.t)).slice(0, 5).map((x) => ({
    id: uid(), t: tx(x.t), how: tx(x.h) || undefined, gate: x.g === true, st: "?" as const, src: "ai" as const }));
  return { kd: (KD.includes(String(o.kd)) ? o.kd : "base") as PlanKind, ...(tl.length ? { tl } : {}), ...(next.length ? { next } : {}), ...(cond.length ? { cond } : {}) };
}

/** Unisce le strade proposte dall'AI al modello: completa quelle esistenti (solo dove vuote) e aggiunge le nuove. */
export function mergeStrade(m: Model, x: AiStrade): { model: Model; added: string[] } {
  const mm: Model = structuredClone(m);
  const added: string[] = [];
  for (const a of arr<AiPlan>(x.a).filter((a) => a && typeof a.n === "string" && a.n.trim()).slice(0, 6)) {
    const pl = planFromAi(a);
    const ex = mm.options.find((o) => norm(o.name) === norm(a.n));
    if (ex) {
      if (!ex.tl?.length && pl.tl) ex.tl = pl.tl;
      if (!ex.next?.length && pl.next) ex.next = pl.next;
      if (!ex.cond?.length && pl.cond) ex.cond = pl.cond;
      if (!ex.kd) ex.kd = pl.kd;
    } else if (mm.options.length < 6) {
      const sh = (l?: string[]) => arr<string>(l).filter((t) => typeof t === "string" && t.trim()).slice(0, 4).map((t) => t.trim().slice(0, 140));
      mm.options.push({ id: uid(), name: a.n.trim().slice(0, 80), s: {}, raw: {}, pro: sh(a.p), con: sh(a.m), ...pl });
      added.push(a.n.trim());
    }
  }
  return { model: mm, added };
}

export type AiStruct = {
  n?: string; k?: string; x?: string; serve?: boolean;
  a?: (string | AiPlan)[];
  mi?: { a: string; r: string; v: number | number[]; t?: string }[];
  c?: { n: string; w?: number; t?: string; u?: string; p?: number; o?: number; i?: number; g?: string; y?: string }[];
  v?: { c: string; min?: number; max?: number; n?: string }[];
  s?: { a: string; c: string; v: number; y?: string }[];
  m?: { a: string; r: string; v: number | number[]; t?: string }[];
  i?: { t: string; k?: Rel; a?: "alta" | "media" | "bassa" }[];
  q?: string[];
};

const norm = (s: string) => String(s ?? "").trim().toLowerCase();
/** L'AI può restituire forme inattese: tutto ciò che deve essere una lista lo diventa, il resto si scarta. */
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

export function structToModel(x: AiStruct): { name: string; model: Model; questions: string[]; serve: boolean } {
  const criteria = arr<NonNullable<AiStruct["c"]>[0]>(x.c).filter((c) => c && typeof c.n === "string").slice(0, 8).map((c) => {
    const num = c.t === "num" && typeof c.p === "number" && typeof c.o === "number";
    return { id: uid(), name: c.n, w: 0, imp: Math.max(1, Math.min(5, Math.round(c.i ?? 3))), group: c.g || undefined, why: c.y || undefined,
      kind: (num ? "num" : "g") as "num" | "g", ...(num ? { unit: c.u ?? "", worst: c.p, best: c.o } : {}) };
  });
  const crit = (id: string) => criteria.find((c) => c.id === id)!;
  const cid = (n: string) => criteria.find((c) => norm(c.name) === norm(n))?.id;
  const short = (l?: string[]) => arr<string>(l).filter((t) => typeof t === "string" && t.trim()).slice(0, 4).map((t) => t.trim().slice(0, 140));
  const options = arr<NonNullable<AiStruct["a"]>[0]>(x.a).filter((a) => typeof a === "string" || (a && typeof a.n === "string")).slice(0, 5).map((a) => {
    const o: AiPlan = typeof a === "string" ? { n: a } : a;
    return { id: uid(), name: o.n, s: {} as Record<string, number>, raw: {} as Record<string, number>, m: {} as NonNullable<Model["options"][0]["m"]>,
      impacts: [] as NonNullable<Model["options"][0]["impacts"]>, pro: short(o.p), con: short(o.m), ...planFromAi(o) };
  });
  const oid = (n: string) => options.find((o) => norm(o.name) === norm(n));
  for (const s of arr<NonNullable<AiStruct["s"]>[0]>(x.s)) {
    const o = oid(s.a), c = cid(s.c);
    if (!o || !c || typeof s.v !== "number") continue;
    if (crit(c).kind === "num") o.raw[c] = s.v;
    else o.s[c] = Math.max(0, Math.min(4, Math.round(s.v))) * 25;
    o.m[c] = { why: `Stima AI: ${s.y ?? "da verificare"}`, rel: "S" };
  }
  for (const i of [...arr<NonNullable<AiStruct["mi"]>[0]>(x.mi), ...arr<NonNullable<AiStruct["m"]>[0]>(x.m)]) {
    const o = oid(i.a);
    if (!o || !["cash0", "cash_m", "hours_w"].includes(i.r)) continue;
    // solo la differenza mensile ha tre scenari; spesa iniziale e ore sono un valore unico (il centrale)
    const v = i.r === "cash_m" && Array.isArray(i.v) && i.v.length === 3 ? (i.v.map(Number) as [number, number, number])
      : Number(Array.isArray(i.v) ? i.v[i.v.length === 3 ? 1 : 0] : i.v);
    if (Array.isArray(v) ? v.some((n) => !Number.isFinite(n)) : !Number.isFinite(v)) continue;
    o.impacts.push({ r: i.r, v, src: "ai", ...(i.t ? { tag: i.t } : {}) });   // importo proposto dall'AI: resta «stima» finché non lo confermi
  }
  const constraints = arr<NonNullable<AiStruct["v"]>[0]>(x.v).flatMap((k) => {
    const c = cid(k.c);
    if (!c) return [];
    const f = (n?: number) => (n == null ? null : crit(c).kind === "num" ? n : Math.max(0, Math.min(4, n)) * 25);
    return [{ id: uid(), name: k.n || k.c, crit: c, min: f(k.min), max: f(k.max) }];
  });
  const assumptions = arr<NonNullable<AiStruct["i"]>[0]>(x.i).filter((a) => a && typeof a.t === "string").map((a) => ({ id: uid(), t: a.t, rel: (a.k ?? "S") as Rel, aff: a.a }));
  return {
    name: typeof x.n === "string" && x.n ? x.n : "Nuova decisione",
    model: { criteria, constraints, options, assumptions, tipo: typeof x.k === "string" ? x.k : undefined, nota: typeof x.x === "string" && x.x ? x.x : undefined },
    questions: arr<string>(x.q).filter((q) => typeof q === "string").slice(0, 3), serve: !!x.serve,
  };
}
