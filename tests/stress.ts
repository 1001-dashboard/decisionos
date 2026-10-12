// Stress test indipendente: logica, parser AI, fuzz, prestazioni, rischio/tempo, privacy, generalizzazione, registro.
// Esegui: node --experimental-strip-types tests/stress.ts [out.json]
// Non modifica il motore: ogni controllo è un'asserzione su ciò che l'app mostrerebbe.
import * as E from "../lib/engine.ts";
import * as AI from "../lib/ai.ts";
import { cleanPayload } from "../lib/privacy.ts";
import { writeFileSync } from "node:fs";
import type { Decision, Opt, Crit } from "../lib/engine.ts";

type Res = { b: string; n: string; ok: boolean; got?: string };
const R: Res[] = [];
function T(b: string, n: string, f: () => true | string) {
  try { const x = f(); R.push({ b, n, ok: x === true, ...(x === true ? {} : { got: String(x).slice(0, 300) }) }); }
  catch (e) { R.push({ b, n, ok: false, got: "ECCEZIONE: " + (e as Error).message.slice(0, 260) }); }
}
const ck = (c: boolean, got: unknown) => (c ? true : typeof got === "string" ? got : JSON.stringify(got));

const g = (id: string, name: string, imp = 3): Crit => ({ id, name, w: 0, imp, kind: "g" });
const D = (opts: Partial<Opt>[], crit: Crit[] = [g("q", "Qualità"), g("c", "Costo")], extra: Partial<Decision> & { m?: Partial<Decision["model"]> } = {}): Decision => {
  const { m, ...rest } = extra;
  return { id: "d", name: "d", status: "aperta", imp: 1, ...rest,
    model: { criteria: crit, constraints: [], options: opts.map((o, i) => ({ id: o.id ?? `o${i}`, name: o.name ?? `Strada ${i}`, s: {}, ...o })) as Opt[], ...m } };
};
const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

/* ---------- A. Logica decisionale ---------- */
const A = "Logica decisionale";
T(A, "tutte le strade escluse dai vincoli → «nessuna»", () => {
  const d = D([{ name: "Uno", s: { q: 25, c: 50 } }, { name: "Due", s: { q: 0, c: 75 } }]);
  d.model.constraints = [{ id: "k", name: "Qualità minima", crit: "q", min: 50 }];
  const rd = E.readiness(d, E.analyzeDecision(d));
  return ck(rd.state === "nessuna", rd.state);
});
T(A, "una sola strada → «vuota», nessuna conclusione", () => {
  const d = D([{ name: "Unica", s: { q: 75, c: 75 } }]);
  return ck(E.readiness(d, E.analyzeDecision(d)).state === "vuota", "");
});
T(A, "nessun criterio → «vuota»", () => {
  const d = D([{ name: "A" }, { name: "B" }], []);
  return ck(E.readiness(d, E.analyzeDecision(d)).state === "vuota", "");
});
T(A, "un vincolo prevale sul punteggio", () => {
  const d = D([{ id: "a", name: "Migliore ma fuori budget", s: { q: 100, c: 0 } }, { id: "b", name: "Peggiore ma ammessa", s: { q: 50, c: 50 } }]);
  d.model.constraints = [{ id: "k", name: "Costo", crit: "c", min: 25 }];
  const r = E.analyzeDecision(d);
  return ck(r.rows[0].id === "b" && r.rows[1].excluded.length > 0, r.rows.map((x) => [x.id, x.score, x.excluded]));
});
T(A, "condizione vincolante falsa → la strada esce", () => {
  const d = D([{ id: "a", name: "Accetto", s: { q: 100, c: 100 }, cond: [{ id: "c1", t: "Alloggio incluso", gate: true, st: "no" }] }, { id: "b", name: "Resto", kd: "sq", s: { q: 25, c: 25 } }]);
  const r = E.analyzeDecision(d), rd = E.readiness(d, r);
  return ck(rd.lead?.id === "b" && rd.failed.some((x) => x.condId === "c1"), { lead: rd.lead, failed: rd.failed.length });
});
T(A, "condizione vincolante da verificare → non pronta, regola di stop", () => {
  const d = D([{ id: "a", name: "Accetto", s: { q: 100, c: 100 }, cond: [{ id: "c1", t: "Alloggio incluso", gate: true, st: "?" }] }, { id: "b", name: "Resto", kd: "sq", s: { q: 25, c: 25 } }]);
  d.model.closed = { at: iso(0), hash: E.closedHash(d) };
  const rd = E.readiness(d, E.analyzeDecision(d));
  return ck(rd.state === "non_pronta" && rd.open.some((x) => x.condId === "c1" && x.gate) && rd.fallback?.id === "b", rd.open.map((x) => x.key));
});
T(A, "strada «Da verificare» in testa → non pronta", () => {
  const d = D([{ id: "a", name: "Accetto", st: "verifica", s: { q: 100, c: 100 } }, { id: "b", name: "Resto", kd: "sq", s: { q: 25, c: 25 } }]);
  d.model.closed = { at: iso(0), hash: E.closedHash(d) };
  const rd = E.readiness(d, E.analyzeDecision(d));
  return ck(rd.state === "non_pronta" && rd.open.some((x) => x.key === "ver"), rd.open.map((x) => x.key));
});
T(A, "strada scaduta esce, strada in scadenza conta i giorni", () => {
  const d = D([{ id: "a", name: "Offerta A", exp: iso(-3), s: { q: 100, c: 100 } }, { id: "b", name: "Offerta B", exp: iso(5), s: { q: 50, c: 50 } }, { id: "c", name: "Nessuna", kd: "sq", s: { q: 25, c: 25 } }]);
  const r = E.analyzeDecision(d), w = E.waitView(d);
  return ck(r.rows.find((x) => x.id === "a")!.excluded.length > 0 && w.left === 5 && w.exp[0]?.id === "b", { ex: r.rows.map((x) => x.excluded), w });
});
T(A, "parità esatta riconosciuta (tie, nessun vincitore inventato)", () => {
  const d = D([{ name: "A", s: { q: 75, c: 25 } }, { name: "B", s: { q: 25, c: 75 } }]);
  const r = E.analyzeDecision(d);
  return ck(r.tie && r.margin === 0, { tie: r.tie, m: r.margin });
});
T(A, "scala numerica inversa (meno è meglio)", () => {
  const c: Crit = { id: "p", name: "Prezzo", w: 0, imp: 3, kind: "num", unit: "€", worst: 2000, best: 500 };
  const d = D([{ id: "a", name: "Cara", raw: { p: 1800 } }, { id: "b", name: "Economica", raw: { p: 600 } }], [c]);
  return ck(E.analyzeDecision(d).rows[0].id === "b", E.analyzeDecision(d).rows);
});
T(A, "scala degenere (pessimo = ottimo): nessun NaN, avviso", () => {
  const c: Crit = { id: "p", name: "Prezzo", w: 0, imp: 3, kind: "num", unit: "€", worst: 1000, best: 1000 };
  const d = D([{ name: "A", raw: { p: 1000 } }, { name: "B", raw: { p: 900 } }], [c, g("q", "Qualità")]);
  d.model.options[0].s = { q: 50 }; d.model.options[1].s = { q: 75 };
  const r = E.analyzeDecision(d);
  return ck(r.rows.every((x) => Number.isFinite(x.score)) && r.warn.some((w) => w.includes("pessimo e ottimo")), r);
});
T(A, "dati mancanti che possono ribaltare → non conclusiva", () => {
  const d = D([{ name: "A", s: { q: 75 } }, { name: "B", s: { q: 50, c: 100 } }]);
  const c = E.conclusive(d, E.analyzeDecision(d));
  return ck(!c.ok && c.missing > 0, c);
});
T(A, "chiusura dello spazio delle alternative decade se cambia il contesto", () => {
  const d = D([{ name: "Accetto", s: { q: 75 } }, { name: "Resto", kd: "sq", s: { q: 25 } }], [g("q", "Q")], { descr: "Offerta" });
  d.model.closed = { at: iso(0), hash: E.closedHash(d) };
  const before = E.falseDilemma(d);
  d.descr = "Offerta, e ora anche una seconda";
  const after = E.falseDilemma(d);
  return ck(before === null && !!after?.stale, { before, after });
});
T(A, "determinismo: stesso input, stesso risultato", () => {
  const d = D([{ name: "A", s: { q: 75, c: 25 } }, { name: "B", s: { q: 50, c: 75 } }, { name: "C", s: { q: 100, c: 0 } }]);
  return ck(JSON.stringify(E.analyzeDecision(d)) === JSON.stringify(E.analyzeDecision(structuredClone(d))), "");
});

/* ---------- B. Parser AI difensivo ---------- */
const P = "Parser AI difensivo";
T(P, "risposta malformata: nessun crash, limiti su strade e criteri", () => {
  const x = AI.structToModel({ n: 42 as never, a: [null, 7, "A", "B", "C", "D", "E", "F", { n: "G" }] as never, c: "x" as never, s: [{ a: "A", c: "zzz", v: "x" }] as never, q: [1, "ok"] as never });
  const y = AI.structToModel({ a: "non una lista" as never, c: Array.from({ length: 12 }, (_, i) => ({ n: `C${i}` })) });
  return ck(x.name === "Nuova decisione" && x.model.options.length === 5 && x.model.criteria.length === 0 && x.questions.length === 1 && y.model.criteria.length === 8 && y.model.options.length === 0, { x: x.model.options.length, y: y.model.criteria.length });
});
T(P, "liste dell'AI troncate (tappe, condizioni, rischi), probabilità invalida → media", () => {
  const many = (n: number, f: (i: number) => object) => Array.from({ length: n }, (_, i) => f(i));
  const p = AI.planFromAi({ n: "X", tl: many(20, (i) => ({ h: i, t: `t${i}` })), cd: many(9, (i) => ({ t: `c${i}` })), rk: many(9, (i) => ({ t: `r${i}`, p: "altissima" })), kd: "boh" });
  return ck(p.tl!.length === 8 && p.cond!.length === 5 && p.risks!.length === 5 && p.risks!.every((r) => r.p === "media") && p.kd === "base", p);
});
T(P, "rischio con importo positivo → perdita negativa", () => {
  const p = AI.planFromAi({ n: "X", rk: [{ t: "Ritardo", p: "alta", c: 5000, m: 300, d: -4 }] });
  const r = p.risks![0];
  return ck(r.c === -5000 && r.m === -300 && r.d === 4, r);
});
T(P, "orizzonti ordinati e senza doppioni, aree ripulite", () => {
  const h = AI.hzFromAi([{ h: 12, l: "Un anno" }, { h: 0, l: "Subito" }, { h: 12, l: "Doppione" }, { h: 3, l: "3 mesi" }, { h: "x", l: "no" }], ["Soldi", "soldi", "Tempo", "", 5, "Famiglia"]);
  return ck(JSON.stringify(h.phases!.map((x) => x.h)) === "[0,3,12]" && h.areas!.join() === "soldi,tempo,famiglia", h);
});
T(P, "l'AI si aggancia per codice, non sovrascrive il lavoro dell'utente", () => {
  const m = D([{ id: "a", name: "Offerta" }, { id: "b", name: "Offerta", tl: [{ h: 1, t: "mia tappa", src: "user" }] }]).model;
  const x = AI.mergeStrade(m, { a: [{ n: "B", tl: [{ h: 3, t: "tappa AI" }], cd: [{ t: "Contratto firmato", g: true }] }] });
  const b = x.model.options[1];
  return ck(b.tl!.length === 1 && b.tl![0].t === "mia tappa" && b.cond!.length === 1 && !x.model.options[0].cond?.length && x.added.length === 0, x.model.options);
});

/* ---------- C. Fuzz ---------- */
const F = "Fuzz e invarianti";
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = <X,>(a: X[]) => a[Math.floor(rnd() * a.length)];
T(F, "50 decisioni casuali: nessun crash, NaN o stato impossibile", () => {
  const bad: string[] = [];
  for (let k = 0; k < 50; k++) {
    const nc = 1 + Math.floor(rnd() * 6), no = 1 + Math.floor(rnd() * 6);
    const crit: Crit[] = Array.from({ length: nc }, (_, i) => rnd() < 0.3
      ? { id: `c${i}`, name: `Num ${i}`, w: 0, imp: 1 + Math.floor(rnd() * 5), kind: "num", unit: pick(["€", "€/mese", "km", "ore"]), worst: pick([0, 1000, 500, null]) as number, best: pick([0, 2000, 100, 500]) }
      : { id: `c${i}`, name: `G ${i}`, w: 0, imp: 1 + Math.floor(rnd() * 5), kind: "g" });
    const opts: Partial<Opt>[] = Array.from({ length: no }, (_, i) => ({
      id: `o${i}`, name: pick(["Resto", "Accetto", "Non segnalo", "Provo", `Strada ${i}`]), kd: pick([undefined, "sq", "prova", "cond", "cerca"]) as Opt["kd"],
      st: pick([undefined, undefined, "verifica", "np", "scelta"]) as Opt["st"], exp: rnd() < 0.15 ? iso(Math.floor(rnd() * 40) - 20) : undefined,
      s: Object.fromEntries(crit.filter(() => rnd() < 0.8).map((c) => [c.id, pick([0, 25, 50, 75, 100])])),
      raw: Object.fromEntries(crit.filter((c) => c.kind === "num" && rnd() < 0.7).map((c) => [c.id, Math.round(rnd() * 2500)])),
      m: Object.fromEntries(crit.map((c) => [c.id, { rel: pick(["F", "D", "S", undefined]) as E.Rel }])),
      cond: rnd() < 0.3 ? [{ id: `k${i}`, t: "Condizione", gate: rnd() < 0.5, st: pick(["?", "si", "no"]) as "?" }] : undefined,
      risks: rnd() < 0.4 ? [{ id: `r${i}`, t: "Rischio", p: pick(["bassa", "media", "alta"]) as E.RiskP, c: -Math.round(rnd() * 9000), m: rnd() < 0.5 ? -200 : null, d: 3 }] : undefined,
      rev: rnd() < 0.3 ? { in: Math.round(rnd() * 20000), out: 1000, back: pick([1, 6, 24]), lock: pick(["basso", "medio", "alto"]) as "basso" } : undefined,
      impacts: rnd() < 0.4 ? [{ r: "cash_m", v: [-500, 200, 600] }] : undefined,
    }));
    const d = D(opts, crit, { due: rnd() < 0.2 ? iso(Math.floor(rnd() * 60) - 30) : undefined, m: { tipo: pick([undefined, "morale", "fornitore", "salute", "casa"]) } });
    if (rnd() < 0.2) d.model.constraints = [{ id: "k", name: "min", crit: "c0", min: 50 }];
    const r = E.analyzeDecision(d);
    const rd = E.readiness(d, r, { cash0: 10000, cash_m: 500 }, [{ id: "x", name: "Riserva", res: "cash0", op: ">=", v: 0 } as never]);
    E.infoValue(d); E.biasChecks(d, r); E.riskSummary(d); E.falseDilemma(d);
    if (r.rows.some((x) => !Number.isFinite(x.score) || x.score < 0 || x.score > 100)) bad.push(`#${k} punteggio fuori scala`);
    if (!["vuota", "nessuna", "non_pronta", "pronta"].includes(rd.state)) bad.push(`#${k} stato ${rd.state}`);
    if (rd.lead) { const lo = d.model.options.find((o) => o.id === rd.lead!.id)!; if (E.isOut(lo) || r.rows.find((x) => x.id === lo.id)!.excluded.length) bad.push(`#${k} in testa una strada esclusa`); }
    if (rd.state === "pronta" && rd.dilemma) bad.push(`#${k} pronta con un falso dilemma aperto`);
    if (JSON.stringify(rd).includes("NaN")) bad.push(`#${k} NaN nei testi`);
    if (rd.wait?.left != null && rd.wait.left < 0) bad.push(`#${k} giorni negativi (${rd.wait.left})`);
  }
  return ck(!bad.length, bad.join("; "));
});

/* ---------- D. Prestazioni ---------- */
T("Prestazioni", "6 strade × 8 criteri: 200 analisi complete sotto 3 s", () => {
  const crit = Array.from({ length: 8 }, (_, i) => g(`c${i}`, `Crit ${i}`, 1 + (i % 5)));
  const d = D(Array.from({ length: 6 }, (_, i) => ({ name: `S${i}`, s: Object.fromEntries(crit.map((c, j) => [c.id, ((i * 3 + j * 7) % 5) * 25])), m: Object.fromEntries(crit.map((c) => [c.id, { rel: "S" as const }])) })), crit);
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) { const r = E.analyzeDecision(d); E.readiness(d, r); }
  const ms = performance.now() - t0;
  return ck(ms < 3000, `${Math.round(ms)} ms`) === true ? true : `${Math.round(ms)} ms`;
});

/* ---------- E. Rischio, reversibilità, tempo, risorse ---------- */
const K = "Rischio, reversibilità, tempo, risorse";
T(K, "impatto del rischio: una tantum + mensile × durata", () => ck(E.riskTotal({ id: "r", t: "x", p: "media", c: -2000, m: -300, d: 4 }) === -3200, ""));
T(K, "capitale a rischio = entrare + uscire, «alto» rispetto ai risparmi", () => {
  const o = { id: "a", name: "A", s: {}, rev: { in: 4000, out: 1000, back: 2, lock: "basso" as const } };
  const a = E.revOf(o, { cash0: 15000 })!, b = E.revOf(o, { cash0: 100000 })!;
  return ck(a.cap === 5000 && a.capHigh && !b.capHigh && a.rev && !a.irr, { a, b });
});
T(K, "lock-in alto o 12+ mesi per tornare → difficile da invertire", () => ck(E.revOf({ id: "a", name: "A", s: {}, rev: { back: 12 } })!.irr && E.revOf({ id: "a", name: "A", s: {}, rev: { lock: "alto" } })!.irr, ""));
T(K, "risorse personalizzate: etichetta e unità", () => ck(E.resLabel("x_ore", { x_ore: { l: "Ore libere", u: "h/sett" } } as never) === "Ore libere (h/sett)" && E.customRes({ x_ore: 10 }, { x_ore: { l: "Ore libere" } } as never).join() === "x_ore", ""));
T(K, "data che ti eri dato già passata: niente giorni negativi", () => {
  const d = D([{ name: "A", s: { q: 50 } }, { name: "B", s: { q: 25 } }], [g("q", "Q")], { due: iso(-20) });
  const w = E.waitView(d);
  return ck(w.left == null || w.left >= 0, `left = ${w.left}`);
});
T(K, "data oggi: zero giorni, non negativi", () => {
  const d = D([{ name: "A", s: { q: 50 } }, { name: "B", s: { q: 25 } }], [g("q", "Q")], { due: iso(0) });
  return ck(E.waitView(d).left === 0, E.waitView(d));
});

/* ---------- F. Privacy ---------- */
const V = "Privacy";
const RED: [string, string][] = [
  ["simbolo dopo", "Guadagno 3.200 € netti"], ["simbolo prima", "Affitto € 1.450"], ["k euro", "Bonus di 2k euro"], ["al mese", "Prendo 1.500 euro al mese"],
  ["RAL 40k", "RAL 40k"], ["stipendio senza simbolo", "stipendio 3200 al mese"], ["affitto senza simbolo", "affitto 1450"], ["importo prima della parola", "pago 900 di affitto"],
  ["in lettere attaccato", "quarantamila euro lordi"], ["in lettere staccato", "circa quaranta mila euro"], ["in lettere con parola chiave", "la RAL è di trentacinquemila"],
];
for (const [n, t] of RED) T(V, `oscura: ${n} («${t}»)`, () => { const x = E.redactMoney(t); return ck(x.includes("[cifra]") && !/\d{3,}|mila|cento/i.test(x.replace("[cifra]", "")), x); });
T(V, "non tocca numeri che non sono soldi", () => {
  const t = "Ho 3 figli, 2 anni di contratto, 40 ore a settimana, 120 km, ci sono tre strade e sei mesi di prova";
  return ck(E.redactMoney(t) === t, E.redactMoney(t));
});
T(V, "server: toglie impatti, conti e risorse senza consenso", () => {
  const c = JSON.stringify(cleanPayload("contro", { n: "x", o: [{ n: "A", im: [["cash_m", 900]] }], base: { cash0: 30000 }, mi: [1] }));
  return ck(!/900|30000|"im"|"base"|"mi"/.test(c), c);
});
T(V, "server: oscura i testi annidati", () => {
  const c = JSON.stringify(cleanPayload("contro", { o: [{ cd: ["Stipendio 3.200 € garantito"] }], ctx: "RAL 40k" }));
  return ck(!/3\.200|40k/.test(c), c);
});
T(V, "server: un client manipolato non fa uscire numeri economici con chiavi arbitrarie", () => {
  const c = JSON.stringify(cleanPayload("contro", { eco: false, salary: 3200, affitto: 1450, o: [{ n: "A", s: { Stipendio: 3200 }, x: { y: 1450 } }], note: "RAL [cifra]" }));
  return ck(!/3200|1450/.test(c), c);
});
T(V, "server: un client manipolato non nasconde numeri dentro le liste", () => {
  const c = JSON.stringify(cleanPayload("struttura", { t: "x", r: [[2500, "stipendio"]], pr: { soldi: 4 } }));
  return ck(!/2500/.test(c) && /"soldi":4/.test(c), c);
});
T(V, "contesto: al server passa solo il testo, ripulito; il contesto nelle decisioni è testo ripulito", () => {
  const a = JSON.stringify(cleanPayload("contesto", { t: "La mia RAL è 40k e ho 23.000 € di risparmi", vault: [{ n: 23000 }] }));
  const b = JSON.stringify(cleanPayload("struttura", { t: "x", cx: ["[risorsa] Risparmi 23.000 €"], extra: 5000 }));
  return ck(!/40k|23\.000|23000|vault|extra/.test(a + b) && /cx/.test(b), a + b);
});
T(V, "con consenso esplicito i numeri passano", () => {
  const c = JSON.stringify(cleanPayload("contro", { eco: true, o: [{ n: "A", im: [["cash_m", 900]] }], base: { cash0: 30000 } }));
  return ck(/900/.test(c) && /30000/.test(c) && !/"eco"/.test(c), c);
});
T(V, "payload dell'app senza consenso: nessun importo dei criteri economici", () => {
  const c: Crit = { id: "p", name: "Stipendio", w: 0, imp: 3, kind: "num", unit: "€/mese", worst: 1000, best: 4000 };
  const d = D([{ name: "A", raw: { p: 3200 }, impacts: [{ r: "cash_m", v: 900 }] }, { name: "B", raw: { p: 2100 } }], [c], { descr: "Mi offrono 3.200 € al mese" });
  const s = JSON.stringify(cleanPayload("contro", AI.compact(d, E.analyzeDecision(d), { eco: false, res: { cash0: 30000 } })));
  return ck(!/3200|3\.200|2100|900|30000|1000|4000/.test(s), s);
});
T(V, "conti senza consenso: solo nomi delle voci", () => {
  const d = D([{ name: "A" }, { name: "B" }], [], { m: { oggi: [{ id: "l", t: "Affitto", k: "s", v: 1450 }] } });
  const s = JSON.stringify(cleanPayload("conti", AI.contiPayload(d, false)));
  return ck(!/1450/.test(s) && /Affitto/.test(s), s);
});

/* ---------- G. Generalizzazione avversariale ---------- */
const G = "Generalizzazione";
const ECON = /soldi|casa|prezz|contratt|pilota|in piccolo/i;
T(G, "scelta morale: nessuna proposta economica o «in prova»", () => {
  const d = D([{ name: "Segnalo un comportamento scorretto", s: { q: 75 } }, { name: "Non segnalo", s: { q: 25 } }], [g("q", "Coerenza")], { m: { tipo: "morale" } });
  const x = E.falseDilemma(d);
  const txt = JSON.stringify(x?.sugg ?? []);
  return ck(!ECON.test(txt) && !(x?.sugg ?? []).some((s) => s.kd === "prova"), txt);
});
T(G, "«Non segnalo» riconosciuto come lasciare le cose come stanno", () => {
  const d = D([{ name: "Segnalo un comportamento scorretto", s: { q: 75 } }, { name: "Non segnalo", s: { q: 25 } }], [g("q", "Coerenza")], { m: { tipo: "morale" } });
  const b = E.biasChecks(d, E.analyzeDecision(d));
  return ck(!b.some((x) => x.k === "statusquo"), b.map((x) => x.k));
});
T(G, "relazione: nessuna proposta economica o «in prova»", () => {
  const d = D([{ name: "Gli parlo apertamente", s: { q: 75 } }, { name: "Lascio stare", s: { q: 25 } }], [g("q", "Rapporto")], { m: { tipo: "relazioni" } });
  const txt = JSON.stringify(E.falseDilemma(d)?.sugg ?? []);
  return ck(!ECON.test(txt) && !/prova/i.test(txt), txt);
});
T(G, "salute: nessun esperimento proposto in automatico", () => {
  const d = D([{ name: "Mi opero", s: { q: 75 } }, { name: "Non mi opero", s: { q: 25 } }], [g("q", "Qualità della vita")], { m: { tipo: "salute" } });
  const s = E.falseDilemma(d)?.sugg ?? [];
  return ck(!s.some((x) => x.kd === "prova" || /in prova|in piccolo/i.test(x.name)), s);
});
T(G, "impresa: le strade intermedie restano proposte", () => {
  const d = D([{ name: "Cambio fornitore", s: { q: 75 } }, { name: "Tengo l'attuale", s: { q: 25 } }], [g("q", "Servizio")], { m: { tipo: "fornitore" } });
  const s = E.falseDilemma(d)?.sugg ?? [];
  return ck(s.some((x) => x.kd === "prova") && s.some((x) => x.kd === "cond"), s);
});

T(G, "tipo assente: nessuna strada inventata, ma «Pronta» resta bloccata", () => {
  const d = D([{ name: "Faccio X", s: { q: 75 }, m: { q: { rel: "F" } } }, { name: "Non faccio X", s: { q: 25 }, m: { q: { rel: "F" } } }], [g("q", "Q")]);
  const x = E.falseDilemma(d), rd = E.readiness(d, E.analyzeDecision(d));
  return ck(!!x && x.sugg.length === 0 && /che tipo di decisione/.test(x.msg) && rd.state === "non_pronta" && rd.open.some((c) => c.kind === "dilemma" && /tipo di decisione/.test(c.how)), { x, st: rd.state });
});
T(G, "l'Analista classifica il tipo solo se manca", () => {
  const m0 = D([{ name: "A" }, { name: "B" }]).model;
  const a = AI.mergeStrade(m0, { k: "morale", a: [] }).model.tipo;
  const b = AI.mergeStrade({ ...m0, tipo: "lavoro" }, { k: "morale", a: [] }).model.tipo;
  const c = AI.mergeStrade(m0, { k: "inventato", a: [] }).model.tipo;
  return ck(a === "morale" && b === "lavoro" && c === undefined, { a, b, c });
});

/* ---------- H. Registro e apprendimento ---------- */
const H = "Registro e apprendimento";
T(H, "previsione di una strada esclusa: nessun NaN", () => {
  const d = D([{ id: "a", name: "A", s: { q: 75 }, st: "np" }, { id: "b", name: "B", s: { q: 50 } }], [g("q", "Q")]);
  const p = E.predOf(d, E.analyzeDecision(d), "a");
  return ck(!!p && !JSON.stringify(p).includes("NaN") && !JSON.stringify(p).includes("null,null"), p);
});
T(H, "consuntivi incompleti non producono percentuali", () => {
  const p = E.predOf(D([{ id: "a", name: "A", s: { q: 75 } }, { id: "b", name: "B", s: { q: 50 } }], [g("q", "Q")]), E.analyzeDecision(D([{ id: "a", name: "A", s: { q: 75 } }, { id: "b", name: "B", s: { q: 50 } }], [g("q", "Q")])), "a")!;
  const ls = E.lessons(Array.from({ length: 9 }, () => ({ pred: p, act: { ok: null } })));
  return ck(ls.length === 0, ls);
});
T(H, "spesa iniziale prevista zero: nessuna divisione per zero", () => {
  const p = { v: 1, sc: 50, pos: 1, top: true, gap: 0, n: 2, cert: 50, c0: 0, m: null, cap: null, irr: null, rs: [] } as E.Pred;
  const ls = E.lessons(Array.from({ length: 6 }, () => ({ pred: p, act: { c0: -500, ok: 3 } })));
  return ck(!JSON.stringify(ls).match(/NaN|Infinity/), ls);
});

/* ---------- risultato ---------- */
const blocks = [...new Set(R.map((r) => r.b))].map((b) => ({ b, ok: R.filter((r) => r.b === b && r.ok).length, n: R.filter((r) => r.b === b).length }));
const tot = { ok: R.filter((r) => r.ok).length, n: R.length };
for (const b of blocks) console.log(`${b.ok === b.n ? "OK  " : "FAIL"} ${b.b}: ${b.ok}/${b.n}`);
for (const r of R.filter((x) => !x.ok)) console.log(`  ✗ [${r.b}] ${r.n}\n      → ${r.got}`);
console.log(`TOTALE ${tot.ok}/${tot.n}`);
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ tot, blocks, R }, null, 1));
