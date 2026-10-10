import assert from "node:assert/strict";
import { analyzeDecision, combos, cashBreakpoint, type Decision } from "../lib/engine.ts";
import { demoDecisions, demoDeps, demoResources, demoRules } from "../lib/demo.ts";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const run = (decs: Decision[]) => {
  const res = decs.map(analyzeDecision);
  return { res, cmb: combos(decs, res, demoDeps, demoResources, demoRules, 24) };
};

// 1. punteggi = motore Python di riferimento
let { res, cmb } = run(demoDecisions);
assert.deepEqual(res[0].rows.map((r) => [r.id, r.score]), [["A2", 65.8], ["A1", 63.3], ["A3", 58]]);
assert.equal(res[0].margin, 2.5);
assert.ok(res[0].warn.some((w) => w.includes("doppio conteggio")));
assert.ok(res[0].fragile.length > 0);

// 2. vincolo obbligatorio esclude
let d = clone(demoDecisions); d[0].model.options[0].s.fam = 30;
({ res } = run(d));
assert.deepEqual(res[0].rows.find((r) => r.id === "A1")!.excluded, ["Famiglia sostenibile: 30 sotto il minimo 40"]);
assert.ok(!res[0].feasible.includes("A1"));

// 3. ricalcolo quando cambiano i pesi
d = clone(demoDecisions); d[0].model.criteria[2].w = 45; d[0].model.criteria[3].w = 10;
({ res } = run(d));
assert.equal(res[0].rows[0].id, "A1");

// 4. costo condiviso contato una volta
d = clone(demoDecisions);
d[1].model.options[0].impacts!.push({ r: "cash0", v: -6000, tag: "trasloco" });
({ cmb } = run(d));
assert.equal(cmb.find((c) => c.key === "A1+B1")!.scen.centrale.res.cash0, 9000);
assert.equal(cmb.find((c) => c.key === "A2+B1")!.scen.centrale.res.cash0, 9000);

// 5. dipendenze escludono, input originale non mutato (snapshot integre)
const before = JSON.stringify(demoDecisions);
({ cmb } = run(demoDecisions));
assert.ok(cmb.find((c) => c.key === "A1+B2")!.excluded.length > 0);
assert.equal(JSON.stringify(demoDecisions), before);

// 6. dati mancanti: range, non gonfia
d = clone(demoDecisions); delete d[0].model.options[1].s.car;
({ res } = run(d));
assert.deepEqual(res[0].rows.find((r) => r.id === "A2")!.range, [53.3, 78.3]);

// 7. punto di svolta flusso
assert.equal(cashBreakpoint({ cash0: 15000 }, demoRules, 24), -500);
// 8. dato mancante su un vincolo: da verificare, NON esclusione
d = clone(demoDecisions); delete d[0].model.options[0].s.fam;
({ res } = run(d));
let a1 = res[0].rows.find((r) => r.id === "A1")!;
assert.equal(a1.excluded.length, 0); assert.equal(a1.pending.length, 1);

// 9. valori reali: €/mese su scala pessimo→ottimo, anche "meno è meglio"
const nd: Decision = { id: "N", name: "Casa", status: "aperta", imp: 1, model: {
  criteria: [
    { id: "aff", name: "Affitto", w: 0, kind: "num", unit: "€/mese", worst: 2000, best: 800, imp: 4 },
    { id: "zona", name: "Zona", w: 0, kind: "g", imp: 2 },
  ],
  constraints: [{ id: "k", name: "Affitto massimo", crit: "aff", max: 1500 }],
  options: [
    { id: "X", name: "Centro", s: { zona: 100 }, raw: { aff: 1600 } },
    { id: "Y", name: "Periferia", s: { zona: 50 }, raw: { aff: 1100 } },
    { id: "Z", name: "Senza dato", s: { zona: 75 } },
  ] } };
const nr = analyzeDecision(nd);
const det = (id: string) => nr.rows.find((r) => r.id === id)!;
assert.deepEqual(nr.rows[0].detail.map((x) => x.w), [67, 33]);              // importanza 4 vs 2
assert.equal(det("Y").detail[0].s, 75);                                    // (1100-2000)/(800-2000)=0.75
assert.ok(det("X").excluded[0].includes("1.600 €/mese sopra il massimo 1.500 €/mese"));
assert.equal(det("Z").excluded.length, 0); assert.equal(det("Z").pending.length, 1);
assert.deepEqual(det("Z").range, [24.8, 91.8]);                             // dato reale mancante -> intervallo
// scala non definita: avviso e criterio fuori calcolo
const nd2 = clone(nd); nd2.model.criteria[0].best = null;
assert.ok(analyzeDecision(nd2).warn.some((w) => w.includes("pessimo e ottimo")));
// input non mutato
assert.equal(nd.model.criteria[0].w, 0);
console.log("engine: 10/10 ok");

// 11. punto di svolta: per la prima, il valore che la porta alla pari con la seconda
{
  const { turningPoints } = await import("../lib/engine.ts");
  assert.equal(turningPoints(nd, analyzeDecision(nd)).length, 0);   // Z incompleta in testa: niente svolta
  const ndc = clone(nd); ndc.model.options.pop(); ndc.model.constraints = [];
  const r = analyzeDecision(ndc);
  const tp = turningPoints(ndc, r);
  // Y prima (Z seconda). Margine e soglie calcolati dal motore, verificati a mano
  const t = tp.find((x) => x.crit === "aff")!;
  assert.ok(t && t.text.includes("Periferia") && t.text.includes("salisse sopra"), JSON.stringify(tp));
  // verifica numerica: con l'affitto al valore di svolta, i punteggi si equivalgono (±0.2)
  const val = Number(t.text.match(/sopra ([\d.]+)/)![1].replace(/\./g, ""));
  const nd3 = clone(ndc); nd3.model.options[1].raw!.aff = val;
  const r3 = analyzeDecision(nd3);
  const sc = (id: string) => r3.rows.find((x) => x.id === id)!.score;
  const other = r.rows.find((x) => x.id !== "Y")!.id;
  assert.ok(Math.abs(sc("Y") - sc(other)) <= 0.3, `${sc("Y")} vs ${sc(other)}`);
  console.log("engine: punto di svolta ok");
}

// 12-14. scambio, solidità, effetti incrociati
{
  const E = await import("../lib/engine.ts");
  const { exampleDecision } = await import("../lib/demo.ts");
  const ex = clone(exampleDecision);
  const r = E.analyzeDecision(ex);
  const tr = E.tradeoff(ex, r)!;
  assert.ok(tr && tr.a === "Ibiza con alloggio incluso" && tr.gains.length && tr.losses.length, JSON.stringify(tr));   // vero compromesso
  assert.ok(tr.losses.some((x) => x.startsWith("Stabilità del lavoro: scarso invece di medio")), JSON.stringify(tr.losses));
  // famiglia più importante dei soldi -> vince Resto a Roma
  const exF = clone(ex); exF.model.criteria[0].imp = 2;
  assert.equal(E.analyzeDecision(exF).rows[0].name, "Resto a Roma e cerco qui");
  assert.ok(!tr.risks.some((x) => x.includes("?.")));
  const exL = clone(ex); exL.model.options[1].s.sta = 0;                     // resta prima, perde di più sulla stabilità
  const trL = E.tradeoff(exL, E.analyzeDecision(exL))!;
  assert.ok(trL.a === "Ibiza con alloggio incluso" && trL.losses.some((x) => x.startsWith("Stabilità del lavoro: pessimo invece di medio")), JSON.stringify(trL));
  assert.ok(tr.gains.some((g) => g.includes("€/mese invece di")), JSON.stringify(tr.gains));
  assert.ok(tr.risks.some((x) => /stim[ae]/.test(x)));
  // solidità: quote e prova ±20%
  const so = E.solidity(ex, r)!;
  assert.ok(so.tested && so.estShare > 0 && so.estShare <= 100, JSON.stringify(so));
  // se le stime sono tutte certe, nessuna prova
  const ex2 = clone(ex); ex2.model.options.forEach((o) => Object.values(o.m ?? {}).forEach((m) => { m.rel = "F"; }));
  assert.equal(E.solidity(ex2, E.analyzeDecision(ex2))!.tested, false);
  // caso costruito: vantaggio piccolo su una stima -> la prova ribalta
  const tight: Decision = { id: "T", name: "T", status: "aperta", imp: 1, model: { criteria: [{ id: "c", name: "Costo", w: 0, imp: 3, kind: "num", unit: "€", worst: 1000, best: 0 }], constraints: [],
    options: [{ id: "a", name: "A", s: {}, raw: { c: 400 }, m: { c: { rel: "S" } } }, { id: "b", name: "B", s: {}, raw: { c: 450 }, m: { c: { rel: "F" } } }] } };
  const st = E.solidity(tight, E.analyzeDecision(tight))!;
  assert.ok(st.tested && !st.holds && st.newTop === "B", JSON.stringify(st));
  // effetti incrociati: conflitto di ore rilevato senza collegamenti espliciti
  const proj: Decision = { id: "P", name: "Progetto", status: "aperta", imp: 1, model: { criteria: [{ id: "x", name: "Pot", w: 100 }], constraints: [],
    options: [{ id: "p1", name: "Full-time", s: { x: 90 }, impacts: [{ r: "hours_w", v: -30 }] }, { id: "p2", name: "Pausa", s: { x: 10 } }] } };
  const rules = [{ id: "h", name: "Ore libere", r: "hours_w", min: 0 }];
  const cx = E.crossEffects("E1", ex, [ex, proj], [], { cash0: 10000, cash_m: 0, hours_w: 60 }, rules, 12);
  assert.equal(cx.length, 1);
  const ft = cx[0].rows.find((x) => x.id === "p1")!, pa = cx[0].rows.find((x) => x.id === "p2")!;
  assert.ok(!ft.ok && ft.auto && ft.why[0].includes("Ore libere"), JSON.stringify(ft));
  assert.ok(pa.ok && pa.hours === 15);
  // collegamento esplicito confermato
  const cx2 = E.crossEffects("E3", ex, [proj], [{ id: "d", if: "E3", excl: "p2", why: "test", confirmed: true }], { hours_w: 60 }, rules, 12);
  assert.deepEqual(cx2[0].rows.find((x) => x.id === "p2")!.why, ["test"]);
  // collegamento non confermato: ignorato
  const cx3 = E.crossEffects("E3", ex, [proj], [{ id: "d", if: "E3", excl: "p2", why: "test", confirmed: false }], { hours_w: 60 }, rules, 12);
  assert.ok(cx3[0].rows.find((x) => x.id === "p2")!.ok);
  console.log("engine: scambio, solidità, effetti incrociati ok");
}

// 15. priorità generali -> importanza iniziale e avvisi
{
  const P = await import("../lib/priorities.ts");
  const pr = { soldi: 2, stabilita: 3, crescita: 4, indipendenza: 3, benessere: 5 };
  assert.equal(P.priOf("Stipendio netto"), "soldi");
  assert.equal(P.priOf("Equilibrio vita-lavoro"), "benessere");
  assert.equal(P.priOf("Rischio contenuto"), "stabilita");
  assert.equal(P.priOf("Crescita professionale"), "crescita");
  assert.equal(P.priOf("Qualità"), null);
  assert.equal(P.impFor("Famiglia", pr), 5);
  assert.equal(P.impFor("Qualità", pr, 4), 4);
  assert.equal(P.priGap("Stipendio", 5, pr)!.g, 3);
  assert.equal(P.priGap("Stipendio", 3, pr), null);           // scarto di 1: tollerato
  assert.equal(P.priGap("Qualità", 1, pr), null);             // nessuna categoria
  const { hashOf } = await import("../lib/engine.ts");
  assert.equal(hashOf({ a: 1 }), hashOf({ a: 1 })); assert.notEqual(hashOf({ a: 1 }), hashOf({ a: 2 }));
  console.log("engine: priorità ok");
}

// 16. controllo onestà
{
  const E = await import("../lib/engine.ts");
  const { exampleDecision } = await import("../lib/demo.ts");
  const mk = (over: Partial<Decision["model"]>): Decision => ({ id: "B", name: "B", status: "aperta", imp: 1, model: { criteria: [], constraints: [], options: [], ...over } });
  // a) un solo criterio pesante fa tutto il vantaggio
  const d1 = mk({ criteria: [{ id: "x", name: "Stipendio", w: 0, imp: 5, kind: "g" }, { id: "y", name: "Famiglia", w: 0, imp: 2, kind: "g" }],
    options: [{ id: "a", name: "Nuovo lavoro", s: { x: 100, y: 50 } }, { id: "b", name: "Resto", s: { x: 25, y: 50 } }] });
  const b1 = E.biasChecks(d1, E.analyzeDecision(d1));
  assert.ok(b1.some((x) => x.k === "uno" && x.t.includes("Stipendio")), JSON.stringify(b1));
  assert.ok(!b1.some((x) => x.k === "statusquo"));              // «Resto» c'è
  // b) stime ottimistiche proprio sulla prima + più contro che pro + status quo assente
  const d2 = mk({ criteria: [{ id: "x", name: "Guadagno", w: 0, imp: 3, kind: "g" }, { id: "y", name: "Crescita", w: 0, imp: 3, kind: "g" }],
    options: [{ id: "a", name: "Offerta A", s: { x: 100, y: 100 }, m: { x: { rel: "S" }, y: { rel: "S" } }, pro: ["ruolo"], con: ["lontano", "precario", "turni"] },
              { id: "b", name: "Offerta B", s: { x: 50, y: 50 } }] });
  const k2 = E.biasChecks(d2, E.analyzeDecision(d2)).map((x) => x.k);
  assert.ok(k2.includes("stime") && k2.includes("contro") && k2.includes("statusquo"), JSON.stringify(k2));
  // c) quasi pari
  const d3 = mk({ criteria: [{ id: "x", name: "Q", w: 0, imp: 3, kind: "g" }, { id: "y", name: "Z", w: 0, imp: 3, kind: "g" }],
    options: [{ id: "a", name: "Resto", s: { x: 75, y: 50 } }, { id: "b", name: "Vado", s: { x: 50, y: 72 } }] });
  assert.ok(E.biasChecks(d3, E.analyzeDecision(d3)).some((x) => x.k === "pari"));
  // d) esempio realistico: nessun crash, avvisi sensati
  const be = E.biasChecks(exampleDecision, E.analyzeDecision(exampleDecision));
  assert.ok(Array.isArray(be) && !be.some((x) => x.k === "statusquo"));
  console.log("engine: controllo onestà ok");
}

// 17. scheda dell'Analista -> modello (nuovo formato e retrocompatibile)
{
  const { structToModel } = await import("../lib/ai.ts");
  const r = structToModel({ n: "Verità all'amico", k: "morale", x: "I soldi qui non contano.", serve: true, q: ["Da quanto vi conoscete?"],
    a: [{ n: "Glielo dico", p: ["coerenza"], m: ["rischio litigio", "momento delicato"] }, { n: "Taccio", p: ["pace"], m: [] }],
    c: [{ n: "Coerenza con me stesso", y: "conta per non avere rimorsi", t: "g", i: 5 }, { n: "Effetto sul rapporto", t: "g", i: 4 }],
    s: [{ a: "Glielo dico", c: "Coerenza con me stesso", v: 4 }] });
  assert.equal(r.model.tipo, "morale"); assert.equal(r.model.nota, "I soldi qui non contano."); assert.ok(r.serve);
  assert.deepEqual(r.model.options[0].con, ["rischio litigio", "momento delicato"]);
  assert.equal(r.model.criteria[0].why, "conta per non avere rimorsi");
  assert.equal(r.model.options[0].s[r.model.criteria[0].id], 100);
  const old = structToModel({ a: ["A", "B"], c: [{ n: "X", w: 50 }] });                 // vecchio formato
  assert.equal(old.model.options[1].name, "B"); assert.deepEqual(old.model.options[1].pro, []);
  console.log("engine: scheda Analista ok");
}

// 18. risposte AI malformate non rompono nulla
{
  const { structToModel } = await import("../lib/ai.ts");
  const bad = structToModel({ p: ["x"], c: "nope", a: [null, 3, { n: "Ok", p: "non lista" }], q: "una", i: [{}], s: {}, k: 5 } as never);
  assert.equal(bad.model.options.length, 1); assert.deepEqual(bad.model.options[0].pro, []);
  assert.deepEqual(bad.questions, []); assert.equal(bad.model.criteria.length, 0); assert.equal(bad.model.tipo, undefined);
  console.log("engine: risposte AI malformate ok");
}
