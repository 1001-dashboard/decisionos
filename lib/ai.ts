import { BP } from "./bp.ts";
import { uid, LEVELS, levelOf, isMoneyCrit, redactMoney, normalize, type Decision, type DecResult, type Model, type Rel, type Resources, type Opt, type PlanKind, type Risk, type Horizon, type Line, PHASE_SETS, snapPhase, phasesOf, areasOf, syncConti } from "./engine.ts";

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
      ...(o.st && o.st !== "attiva" ? { st: o.st === "np" ? `non perseguibile${o.stWhy ? ": " + tx(o.stWhy) : ""}` : o.st } : {}),
      ...(o.cond?.length ? { cd: o.cond.map((c) => `${tx(c.t)} [${c.st}${c.gate ? ",vincolante" : ""}]`) } : {}),
      ...((o.pro?.length || o.con?.length) ? { pc: [(o.pro ?? []).map((x) => tx(x)), (o.con ?? []).map((x) => tx(x))] } : {}),
      ...(opts.eco ? { im: (o.impacts ?? []).map((i) => [i.r, i.v, i.src === "ai" ? "stima AI" : ""]) } : {}),
    })),
    i: (m.assumptions ?? []).map((a) => `${tx(a.t)} [${a.rel}${a.aff ? "," + a.aff : ""}]`),
    ...(m.tipo ? { k: m.tipo } : {}),
    ...(m.scartate?.length ? { no: m.scartate.map((x) => `${tx(x.name)}${x.why ? ": " + tx(x.why) : ""}`) } : {}),
    // orizzonti e aree: inviati solo se già fissati, altrimenti l'Analista li propone
    ...(m.phases?.length || m.options.some((o) => o.tl?.length) ? { hz: { ph: phasesOf(m).map((x) => [x.h, x.l]), ar: areasOf(m) } } : {}),
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
  rk?: { t?: string; p?: string; c?: number; m?: number; d?: number; x?: string }[];
};
export type AiStrade = { x?: string; a?: AiPlan[] };
/** Orizzonti e aree proposti dall'AI, ripuliti: 3-5 orizzonti ordinati, max 8 aree. */
export function hzFromAi(ph: unknown, ar: unknown): { phases?: Horizon[]; areas?: string[] } {
  const phases = arr<{ h?: unknown; l?: unknown }>(ph).filter((x) => x && Number.isFinite(Number(x.h)) && typeof x.l === "string" && x.l.trim())
    .map((x) => ({ h: Math.max(0, Number(x.h)), l: String(x.l).trim().slice(0, 32) })).sort((a, b) => a.h - b.h)
    .filter((x, i, a) => i === 0 || x.h !== a[i - 1].h).slice(0, 5);
  const areas = [...new Set(arr<unknown>(ar).filter((x) => typeof x === "string" && x.trim()).map((x) => String(x).trim().toLowerCase().slice(0, 24)))].slice(0, 8);
  return { ...(phases.length >= 3 ? { phases } : {}), ...(areas.length >= 3 ? { areas } : {}) };
}

const KD = ["base", "cond", "prova", "temp", "rinvio", "cerca", "sq"];
/** Converte in modo difensivo la parte «piano» di una strada proposta dall'AI. Tutto resta marcato come proposto dall'AI. */
export function planFromAi(o: Partial<AiPlan>, phs: Horizon[] = PHASE_SETS.mesi.ph, ars?: string[]): Pick<Opt, "kd" | "tl" | "next" | "cond" | "risks"> {
  const tx = (v: unknown, n = 160) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const tl = arr<NonNullable<AiPlan["tl"]>[0]>(o.tl).filter((x) => x && tx(x.t)).slice(0, 8).map((x) => {
    const h = snapPhase(phs, Number.isFinite(Number(x.h)) ? Number(x.h) : phs[1]?.h ?? 0).h;
    const a = typeof x.a === "string" && x.a.trim() ? x.a.trim().toLowerCase().slice(0, 24) : undefined;
    return { h, a: a && (!ars || ars.includes(a)) ? a : a ?? undefined, t: tx(x.t), src: "ai" as const };
  });
  const next = arr<string>(o.nx).map((x) => tx(x, 140)).filter(Boolean).slice(0, 5);
  const cond = arr<NonNullable<AiPlan["cd"]>[0]>(o.cd).filter((x) => x && tx(x.t)).slice(0, 5).map((x) => ({
    id: uid(), t: tx(x.t), how: tx(x.h) || undefined, gate: x.g === true, st: "?" as const, src: "ai" as const }));
  const num = (v: unknown, neg = true) => (typeof v === "number" && Number.isFinite(v) && v !== 0 ? (neg ? -Math.abs(v) : Math.abs(v)) : null);
  const risks = arr<NonNullable<AiPlan["rk"]>[0]>(o.rk).filter((x) => x && tx(x.t)).slice(0, 5).map((x) => ({
    id: uid(), t: tx(x.t), p: (["bassa", "media", "alta"].includes(String(x.p)) ? x.p : "media") as Risk["p"],
    c: num(x.c), m: num(x.m), d: num(x.d, false), x: tx(x.x) || undefined, src: "ai" as const }));
  return { kd: (KD.includes(String(o.kd)) ? o.kd : "base") as PlanKind, ...(tl.length ? { tl } : {}), ...(next.length ? { next } : {}), ...(cond.length ? { cond } : {}), ...(risks.length ? { risks } : {}) };
}

/** Unisce le strade proposte dall'AI al modello: completa quelle esistenti (solo dove vuote) e aggiunge le nuove. */
export function mergeStrade(m: Model, x: AiStrade & { ph?: unknown; ar?: unknown }): { model: Model; added: string[] } {
  const mm: Model = structuredClone(m);
  const hz = hzFromAi(x.ph, x.ar);
  if (!mm.phases?.length && hz.phases && !mm.options.some((o) => o.tl?.length)) mm.phases = hz.phases;
  if (!mm.areas?.length && hz.areas) mm.areas = hz.areas;
  const added: string[] = [];
  for (const a of arr<AiPlan>(x.a).filter((a) => a && typeof a.n === "string" && a.n.trim()).slice(0, 6)) {
    const pl = planFromAi(a, phasesOf(mm), areasOf(mm));
    const ex = mm.options.find((o) => norm(o.name) === norm(a.n));
    if (ex) {
      if (!ex.tl?.length && pl.tl) ex.tl = pl.tl;
      const nx = new Set((ex.next ?? []).map(norm)), nc = new Set((ex.cond ?? []).map((c) => norm(c.t))), nr = new Set((ex.risks ?? []).map((r) => norm(r.t)));
      ex.next = [...(ex.next ?? []), ...(pl.next ?? []).filter((x) => !nx.has(norm(x)))].slice(0, 6);
      ex.cond = [...(ex.cond ?? []), ...(pl.cond ?? []).filter((c) => !nc.has(norm(c.t)))].slice(0, 7);
      ex.risks = [...(ex.risks ?? []), ...(pl.risks ?? []).filter((r) => !nr.has(norm(r.t)))].slice(0, 6);
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
  n?: string; k?: string; x?: string; serve?: boolean; ph?: { h: number; l: string }[]; ar?: string[];
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
  const tipo = typeof x.k === "string" ? x.k : undefined;
  const hz = hzFromAi(x.ph, x.ar);
  const phs = hz.phases ?? phasesOf({ tipo }), ars = hz.areas ?? areasOf({ tipo });
  const options = arr<NonNullable<AiStruct["a"]>[0]>(x.a).filter((a) => typeof a === "string" || (a && typeof a.n === "string")).slice(0, 5).map((a) => {
    const o: AiPlan = typeof a === "string" ? { n: a } : a;
    return { id: uid(), name: o.n, s: {} as Record<string, number>, raw: {} as Record<string, number>, m: {} as NonNullable<Model["options"][0]["m"]>,
      impacts: [] as NonNullable<Model["options"][0]["impacts"]>, pro: short(o.p), con: short(o.m), ...planFromAi(o, phs, ars) };
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
    model: { criteria, constraints, options, assumptions, tipo, nota: typeof x.x === "string" && x.x ? x.x : undefined, ...hz },
    questions: arr<string>(x.q).filter((q) => typeof q === "string").slice(0, 5), serve: !!x.serve,
  };
}

/* ---------- Conti dall'Analista ---------- */
type AiLine = { t?: string; k?: string; v?: number | null; lo?: number; hi?: number; u?: boolean; f?: string };
export type AiConti = { q?: string[]; o?: AiLine[]; s?: { a?: string; l?: AiLine[]; x?: string[] }[] };

const toLine = (l: AiLine): Line | null => {
  if (!l || typeof l.t !== "string" || !l.t.trim()) return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.abs(v) : null);
  return { id: uid(), t: l.t.trim().slice(0, 60), k: l.k === "e" ? "e" : "s", v: n(l.v), lo: n(l.lo), hi: n(l.hi), ...(l.u ? { u: true } : {}), f: l.f === "D" ? "D" : "S", src: "ai" };
};

/** Imposta i conti proposti dall'Analista senza toccare quello che hai già scritto: oggi (voci nuove per nome) e, per ogni strada senza conti,
 *  copia di oggi − voci che spariscono + voci nuove o cambiate. Poi ricalcola le differenze. */
export function contiFromAi(m: Model, x: AiConti): { model: Model; questions: string[] } {
  const mm: Model = structuredClone(m);
  // riempie solo gli importi vuoti: mai sovrascrivere un numero che c'è già
  // riempie gli importi vuoti e aggiorna le stime dell'AI che non hai toccato (src «ai»): i tuoi numeri non si toccano mai
  const fill = (dst: Line, src: Line) => { if (src.v != null && (dst.v == null || dst.src === "ai")) { dst.v = src.v; dst.lo = src.lo ?? dst.lo; dst.hi = src.hi ?? dst.hi; dst.f = src.f; } };
  const ai0 = arr<AiLine>(x.o).map(toLine).filter((l): l is Line => !!l);
  for (const l of ai0) { const ex = (mm.oggi ?? []).find((y) => norm(y.t) === norm(l.t)); if (ex) fill(ex, l); }
  const have = new Set((mm.oggi ?? []).map((l) => norm(l.t)));
  mm.oggi = [...(mm.oggi ?? []), ...ai0.filter((l) => !have.has(norm(l.t)))].slice(0, 20);
  for (const sx of arr<NonNullable<AiConti["s"]>[0]>(x.s)) {
    const o = mm.options.find((y) => norm(y.name) === norm(sx?.a ?? ""));
    if (!o) continue;
    if (o.conti?.length) {
      for (const l of arr<AiLine>(sx.l).map(toLine).filter((z): z is Line => !!z)) { const ex = o.conti.find((y) => norm(y.t) === norm(l.t)); if (ex) fill(ex, l); }
      continue;
    }
    const gone = new Set(arr<string>(sx.x).map(norm));
    const nl = arr<AiLine>(sx.l).map(toLine).filter((l): l is Line => !!l);
    const changed = new Set(nl.map((l) => norm(l.t)));
    const base = (mm.oggi ?? []).filter((l) => !gone.has(norm(l.t)) && !changed.has(norm(l.t))).map((l) => ({ ...l, id: uid(), from: l.id }));
    o.conti = [...base, ...nl].slice(0, 25);
  }
  // le voci copiate da oggi seguono gli importi di oggi finché restano vuote
  for (const o of mm.options) for (const l of o.conti ?? []) if (l.from && l.v == null) { const src = (mm.oggi ?? []).find((y) => y.id === l.from); if (src && src.v != null) { l.v = src.v; l.f = src.f; } }
  return { model: syncConti(mm), questions: arr<string>(x.q).filter((q) => typeof q === "string" && q.trim()).slice(0, 6) };
}

/** Dati per la richiesta «conti»: senza consenso alle cifre, solo nomi delle voci. */
export function contiPayload(d: Decision, eco: boolean, answers: string[] = []) {
  const tx = (t?: string) => (t == null ? undefined : eco ? t : redactMoney(t));
  const ln = (l: Line) => (eco && l.v != null ? `${l.t} ${l.k === "e" ? "+" : "-"}${l.v}${l.u ? " una tantum" : ""}` : `${l.t} (${l.k === "e" ? "entrata" : "spesa"})`);
  return {
    t: tx(d.descr), a: d.model.options.filter((o) => o.st !== "np" && o.st !== "abbandonata").map((o) => o.name),
    ...(d.model.assumptions?.length ? { i: d.model.assumptions.map((a) => tx(a.t)) } : {}),
    ...(d.model.oggi?.length ? { o: d.model.oggi.map(ln) } : {}),
    ...(answers.length ? { r: answers.map((a) => tx(a)) } : {}),
    ...(eco ? { eco: true } : { privacy: "importi oscurati: proponi solo le voci, v null" }),
  };
}

/* ---------- Premessa aggiornata con i dati emersi ---------- */
export type AiPremessa = { p?: string; f?: string[]; q?: string[] };
/** Tutto ciò che è emerso nella decisione, in forma compatta: racconto, strade (tipo, condizioni con stato, rischi, decisioni generate), conti, scartate, dubbi. */
export function premessaPayload(d: Decision, eco: boolean, answers: string[] = []) {
  const tx = (t?: string) => (t == null ? undefined : eco ? t : redactMoney(t));
  const ln = (l: Line) => `${l.t}${eco && l.v != null ? ` ${l.k === "e" ? "+" : "-"}${l.v}${l.u ? " una tantum" : "/mese"}` : ` (${l.k === "e" ? "entrata" : "spesa"})`}${l.f === "S" ? " [stima]" : l.f === "F" ? " [verificato]" : ""}`;
  const m = d.model;
  const ST: Record<string, string> = { "?": "da verificare", si: "vero", no: "falso" };
  return {
    t: tx(d.descr), ...(m.tipo ? { k: m.tipo } : {}),
    o: m.options.map((o) => ({
      n: tx(o.name), ...(o.kd && o.kd !== "base" ? { kd: o.kd } : {}),
      ...(o.cond?.length ? { cd: o.cond.map((c) => `${tx(c.t)} [${ST[c.st]}]`) } : {}),
      ...(o.risks?.length ? { rk: o.risks.map((r) => `${tx(r.t)} [${r.p}]`) } : {}),
      ...(o.next?.length ? { nx: o.next.map(tx) } : {}),
      ...(o.conti?.length ? { ct: o.conti.filter((l) => !l.from || m.oggi?.find((x) => x.id === l.from)?.v !== l.v).map(ln) } : {}),
      ...((o.pro?.length || o.con?.length) ? { pc: [(o.pro ?? []).map(tx), (o.con ?? []).map(tx)] } : {}),
    })),
    ...(m.oggi?.length ? { oggi: m.oggi.map(ln) } : {}),
    ...(m.scartate?.length ? { no: m.scartate.map((x) => `${tx(x.name)}${x.why ? ": " + tx(x.why) : ""}`) } : {}),
    ...(m.assumptions?.length ? { i: m.assumptions.map((a) => `${tx(a.t)} [${a.rel}]`) } : {}),
    ...(m.nota ? { x: tx(m.nota) } : {}),
    ...(answers.length ? { r: answers.map(tx) } : {}),
    ...(eco ? { eco: true } : { privacy: "importi oscurati: non citare cifre" }),
  };
}
