import { BP } from "./bp.ts";
import { uid, type Decision, type DecResult, type Model, type Rel, type Resources } from "./engine.ts";

export async function ai<T = unknown>(mode: string, payload: unknown): Promise<T> {
  const r = await fetch(`${BP}/api/ai`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, payload }) });
  const j = await r.json().catch(() => ({ e: "Risposta non valida" }));
  if (!r.ok || j.e) throw new Error(j.e || "Errore");
  return j.data as T;
}

/** Payload minimo per l'AI: chiavi brevi, solo ciò che serve. Cifre economiche solo se consentito. */
export function compact(d: Decision, r: DecResult | undefined, opts: { eco: boolean; ctx?: string; res?: Resources }) {
  const m = d.model;
  return {
    n: d.name, t: d.descr || undefined,
    c: m.criteria.map((c) => [c.name, c.w]),
    v: m.constraints.map((k) => `${m.criteria.find((c) => c.id === k.crit)?.name} ${k.min != null ? "≥" + k.min : ""}${k.max != null ? "≤" + k.max : ""}`),
    o: m.options.map((o) => ({
      id: o.id, n: o.name,
      s: Object.fromEntries(m.criteria.map((c) => [c.name, o.s[c.id] ?? null])),
      y: Object.fromEntries(Object.entries(o.m ?? {}).filter(([, x]) => x.why).map(([k, x]) => [m.criteria.find((c) => c.id === k)?.name ?? k, `${x.why} [${x.rel ?? "D"}]`])),
      ...(opts.eco ? { im: (o.impacts ?? []).map((i) => [i.r, i.v]) } : {}),
    })),
    i: (m.assumptions ?? []).map((a) => `${a.t} [${a.rel}${a.aff ? "," + a.aff : ""}]`),
    ...(r ? {
      r: r.rows.map((x) => [x.name, x.score, x.excluded.length ? "ESCLUSA:" + x.excluded.join(";") : x.range ? `range ${x.range.join("-")}` : ""]),
      sens: r.sens.filter((s) => s.delta != null).map((s) => `${s.name} ${s.delta}pt→${r.rows.find((x) => x.id === s.newTop)?.name}`),
    } : {}),
    ...(opts.eco && opts.res ? { base: opts.res } : {}),
    ...(opts.ctx ? { ctx: opts.ctx } : {}),
  };
}

export type AiStruct = {
  n?: string; a?: string[];
  c?: { n: string; w: number; g?: string; lo?: string; hi?: string }[];
  v?: { c: string; min?: number; max?: number; n?: string }[];
  s?: { a: string; c: string; v: number; y?: string }[];
  m?: { a: string; r: string; v: number | number[]; t?: string }[];
  i?: { t: string; k?: Rel; a?: "alta" | "media" | "bassa" }[];
  q?: string[];
};

const norm = (s: string) => s.trim().toLowerCase();

export function structToModel(x: AiStruct): { name: string; model: Model; questions: string[] } {
  const criteria = (x.c ?? []).slice(0, 8).map((c) => ({ id: uid(), name: c.n, w: Math.round(c.w || 0), group: c.g || undefined, lo: c.lo, hi: c.hi }));
  const cid = (n: string) => criteria.find((c) => norm(c.name) === norm(n))?.id;
  const options = (x.a ?? []).slice(0, 3).map((n) => ({ id: uid(), name: n, s: {} as Record<string, number>, m: {} as NonNullable<Model["options"][0]["m"]>, impacts: [] as NonNullable<Model["options"][0]["impacts"]> }));
  const oid = (n: string) => options.find((o) => norm(o.name) === norm(n));
  for (const s of x.s ?? []) {
    const o = oid(s.a), c = cid(s.c);
    if (!o || !c || typeof s.v !== "number") continue;
    o.s[c] = Math.max(0, Math.min(100, Math.round(s.v)));
    o.m[c] = { why: `Stima AI: ${s.y ?? "da verificare"}`, rel: "S" };
  }
  for (const i of x.m ?? []) {
    const o = oid(i.a);
    if (!o || !["cash0", "cash_m", "hours_w"].includes(i.r)) continue;
    const v = Array.isArray(i.v) && i.v.length === 3 ? (i.v.map(Number) as [number, number, number]) : Number(Array.isArray(i.v) ? i.v[0] : i.v);
    o.impacts.push({ r: i.r, v, ...(i.t ? { tag: i.t } : {}) });
  }
  const constraints = (x.v ?? []).flatMap((k) => {
    const c = cid(k.c);
    return c ? [{ id: uid(), name: k.n || k.c, crit: c, min: k.min ?? null, max: k.max ?? null }] : [];
  });
  const assumptions = (x.i ?? []).map((a) => ({ id: uid(), t: a.t, rel: (a.k ?? "S") as Rel, aff: a.a }));
  return { name: x.n || "Nuova decisione", model: { criteria, constraints, options, assumptions }, questions: (x.q ?? []).slice(0, 3) };
}
