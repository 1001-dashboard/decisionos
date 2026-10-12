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
  ex.model.options = ex.model.options.filter((o) => o.id !== "E4");   // meccanica dello scambio sulle tre strade di base
  const r = E.analyzeDecision(ex);
  const tr = E.tradeoff(ex, r)!;
  assert.ok(tr && tr.a === "Ibiza con alloggio incluso" && tr.gains.length && tr.losses.length, JSON.stringify(tr));   // vero compromesso
  assert.ok(tr.losses.some((x) => x.startsWith("Stabilità del lavoro: scarso invece di medio")), JSON.stringify(tr.losses));
  // famiglia più importante dei soldi -> vince Resto a Roma
  const exF = clone(ex); exF.model.criteria[0].imp = 2;
  assert.equal(E.analyzeDecision(exF).rows[0].name, "Resto a Roma e cerco qui");
  assert.ok(!tr.risks.some((x) => x.includes("?.")));
  const exL = clone(ex); exL.model.options.find((o) => o.id === "E2")!.s.sta = 0;                     // resta prima, perde di più sulla stabilità
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

// 19. autonomia mai negativa, doppio conteggio dei soldi
{
  const E = await import("../lib/engine.ts");
  const st = E.applyCombo([], new Map(), [], { cash0: -5000, cash_m: -1500 }, [], 24, 1);
  assert.equal(st.res.autonomia_mesi, 0);
  const d: Decision = { id: "D", name: "D", status: "aperta", imp: 1, model: { constraints: [],
    criteria: [{ id: "a", name: "Impatto economico netto", w: 0, imp: 4, kind: "num", unit: "€/mese", worst: 0, best: 2000 },
               { id: "b", name: "Soldi che restano a fine mese", w: 0, imp: 4, kind: "num", unit: "€/mese", worst: 0, best: 1000 },
               { id: "c", name: "Famiglia", w: 0, imp: 4, kind: "g" }],
    options: [{ id: "x", name: "Vado", s: { c: 50 }, raw: { a: 2000, b: 500 } }, { id: "y", name: "Resto", s: { c: 100 }, raw: { a: 1200, b: 0 } }] } };
  assert.ok(E.biasChecks(d, E.analyzeDecision(d)).some((b) => b.k === "doppio"));
  // spesa iniziale + costo mensile: non è doppio conteggio
  const d2: Decision = JSON.parse(JSON.stringify(d)); d2.model.criteria[0].unit = "€"; d2.model.criteria[0].name = "Soldi da anticipare";
  assert.ok(!E.biasChecks(d2, E.analyzeDecision(d2)).some((b) => b.k === "doppio"));
  // giudizio "sicurezza economica" accanto a una cifra in €: doppio
  const d3: Decision = JSON.parse(JSON.stringify(d2)); d3.model.criteria[2] = { id: "c", name: "Sicurezza economica", w: 0, imp: 4, kind: "g" };
  assert.ok(E.biasChecks(d3, E.analyzeDecision(d3)).some((b) => b.k === "doppio"));
  console.log("engine: autonomia e doppio conteggio ok");
}

// 20. privacy: nessun importo in € verso l'AI se non abilitato
{
  const E = await import("../lib/engine.ts");
  const { compact, structToModel } = await import("../lib/ai.ts");
  for (const [a, b] of [["stipendio 3.200 € al mese", "stipendio [cifra] al mese"], ["€ 1.450 di affitto", "[cifra] di affitto"], ["2k euro", "[cifra]"], ["1.500 euro", "[cifra]"], ["3 figli e 40 ore", "3 figli e 40 ore"]])
    assert.equal(E.redactMoney(a), b, a);
  const { exampleDecision } = await import("../lib/demo.ts");
  const ex: Decision = JSON.parse(JSON.stringify(exampleDecision));
  ex.descr = "Stipendio netto 3.200 € e affitto 1.450 euro";
  const off = JSON.stringify(compact(ex, E.analyzeDecision(ex), { eco: false, res: { cash0: 12000 } }));
  assert.ok(!/\d[\d.,]*\s*(€|euro)/i.test(off) && !off.includes("1500") && !off.includes("700 ") && !off.includes("12000"), off);
  assert.ok(off.includes("cifra oscurata") && !off.includes('"im"'));
  const on = JSON.stringify(compact(ex, E.analyzeDecision(ex), { eco: true, res: { cash0: 12000 } }));
  assert.ok(on.includes("3.200 €") && on.includes("700 €/mese") && on.includes('"eco":true'));
  // 21. provenienza: importi proposti dall'AI marcati, e segnalati nei rischi
  const sm = structToModel({ a: [{ n: "Vado" }, { n: "Resto" }], c: [{ n: "Famiglia", t: "g", i: 4 }], s: [{ a: "Vado", c: "Famiglia", v: 3 }, { a: "Resto", c: "Famiglia", v: 2 }],
    mi: [{ a: "Vado", r: "cash0", v: [-7000, -6000, -5000] }] });
  assert.equal(sm.model.options[0].impacts![0].src, "ai");
  assert.equal(sm.model.options[0].impacts![0].v, -6000);   // intervallo su spesa iniziale → valore centrale, mai NaN
  const d: Decision = { id: "x", name: "x", status: "aperta", imp: 1, model: sm.model };
  assert.ok(E.tradeoff(d, E.analyzeDecision(d))!.risks.some((r) => r.includes("stime dell'AI")));
  // 22. conclusività con dati mancanti
  const mk = (ra: Record<string, number>, rb: Record<string, number>): Decision => ({ id: "c", name: "c", status: "aperta", imp: 1, model: { constraints: [],
    criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }, { id: "q", name: "Q", w: 0, imp: 3, kind: "g" }],
    options: [{ id: "a", name: "A", s: ra }, { id: "b", name: "B", s: rb }] } });
  const c1 = mk({ p: 100 }, { p: 25, q: 50 });           // A: 50..100, B: 37,5 -> A vince comunque
  assert.ok(E.conclusive(c1, E.analyzeDecision(c1)).ok);
  const c2 = mk({ p: 75 }, { p: 50, q: 75 });            // A: 37,5..87,5, B: 62,5 -> non conclusivo
  const k2 = E.conclusive(c2, E.analyzeDecision(c2));
  assert.ok(!k2.ok && k2.contenders.includes("A") && k2.contenders.includes("B") && k2.missW === 50, JSON.stringify(k2));
  console.log("engine: privacy, provenienza AI, conclusività ok");
  // 23. solidità: un'unica alternativa valida con stime non deve dire «nessuna stima»
  const so: Decision = { id: "s", name: "s", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }],
    constraints: [{ id: "k", name: "k", crit: "p", min: 40 }],
    options: [{ id: "a", name: "A", s: { p: 75 }, m: { p: { rel: "S" } } }, { id: "b", name: "B", s: { p: 25 } }] } };
  const sl = E.solidity(so, E.analyzeDecision(so))!;
  assert.ok(!sl.tested && sl.alone && sl.estShare === 100);
  assert.ok(!E.untestedText(sl).includes("Nessuna stima") && E.untestedText(sl).includes("da verificare"));
  console.log("engine: solidità senza confronto ok");
  // 24. importi senza simbolo € e consenso
  for (const [a, b] of [["RAL 40k", "40"], ["stipendio 3200 al mese", "3200"], ["affitto 1450", "1450"], ["pago 900 di affitto", "900"], ["2.900 netti", "2.900"], ["costi 5000 e 300 al mese", "300"]] as const)
    assert.ok(!E.redactMoney(a).includes(b), a + " → " + E.redactMoney(a));
  assert.equal(E.redactMoney("figlio di 3 anni, 45 ore a settimana dal 2019"), "figlio di 3 anni, 45 ore a settimana dal 2019");
  // 25. vincolo obbligatorio pendente sulla prima: niente «prima robusta» (caso della revisione)
  const vp: Decision = { id: "v", name: "v", status: "aperta", imp: 1, model: {
    criteria: [{ id: "a", name: "A", w: 0, imp: 4, kind: "g" }, { id: "b", name: "B", w: 0, imp: 1, kind: "g" }],
    constraints: [{ id: "k", name: "B almeno 75", crit: "b", min: 75 }],
    options: [{ id: "x", name: "X", s: { a: 100 } }, { id: "y", name: "Y", s: { a: 50, b: 100 } }] } };
  const kv = E.conclusive(vp, E.analyzeDecision(vp));
  assert.ok(!kv.ok && kv.pend?.name === "X", JSON.stringify(kv));
  const solo: Decision = { ...vp, model: { ...vp.model, options: [vp.model.options[0]] } };
  assert.ok(!E.conclusive(solo, E.analyzeDecision(solo)).ok);
  console.log("engine: importi senza simbolo, vincoli pendenti ok");
  // 26. falso dilemma: sì contro restare fermo
  const fd: Decision = { id: "f", name: "f", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Accetto Ibiza", s: { p: 75 } }, { id: "b", name: "Rifiuto e resto fermo", s: { p: 50 } }] } };
  // senza tipo il motore non inventa strade: lo dice e blocca comunque «Pronta»
  const dl0 = E.falseDilemma(fd)!;
  assert.ok(dl0 && dl0.sugg.length === 0 && /che tipo di decisione/.test(dl0.msg), JSON.stringify(dl0));
  fd.model.tipo = "lavoro";
  const dl = E.falseDilemma(fd)!;
  assert.ok(dl && dl.sugg.some((x) => x.kd === "prova") && dl.sugg.some((x) => x.kd === "cerca") && dl.sugg.some((x) => x.kd === "cond"), JSON.stringify(dl));
  // 27. decisione condizionata sull'esempio: non pronta, con condizione vincolante e alternativa di riserva
  const exD = structuredClone((await import("../lib/demo.ts")).exampleDecision);
  const rxD = E.analyzeDecision(exD);
  const rdD = E.readiness(exD, rxD, { cash0: 12000, cash_m: -300, hours_w: 50 }, []);
  assert.equal(rdD.state, "non_pronta");
  assert.ok(rdD.lead && rdD.fallback && rdD.lead.id !== rdD.fallback.id);
  assert.ok(rdD.open.some((c) => c.gate && c.kind === "utente") && rdD.open.some((c) => c.kind === "dato"));
  assert.equal(E.falseDilemma(exD), null);   // l'esempio ha già piani condizionati, prova e ricerca
  // 28. condizione vincolante «no» → la strada esce e prevale la riserva
  const exD2 = structuredClone(exD);
  const leadD = exD2.model.options.find((o) => o.id === rdD.lead!.id)!;
  leadD.cond!.find((c) => c.gate)!.st = "no";
  const r2b = E.analyzeDecision(exD2);
  assert.ok(r2b.rows.find((x) => x.id === leadD.id)!.excluded.some((w) => w.startsWith("condizione non soddisfatta")));
  assert.equal(r2b.rows.find((x) => !x.excluded.length)!.id, rdD.fallback!.id);
  // 29. pronta: dati certi, nessuna condizione aperta
  const prD: Decision = { id: "r", name: "r", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "A", s: { p: 100 }, m: { p: { rel: "F" } }, cond: [{ id: "c", t: "ok", st: "si" }] }, { id: "b", name: "B", s: { p: 25 }, m: { p: { rel: "F" } } }, { id: "c", name: "A solo a condizioni", kd: "cond", s: { p: 50 }, m: { p: { rel: "F" } } }, { id: "d", name: "A in prova", kd: "prova", s: { p: 50 }, m: { p: { rel: "F" } } }] } };
  const rpD = E.readiness(prD, E.analyzeDecision(prD));
  assert.equal(rpD.state, "pronta", JSON.stringify(rpD.open));
  assert.equal(rpD.done.length, 1);
  // 30. strade dall'AI: piani, conseguenze e condizioni, difensivo
  const { mergeStrade, planFromAi } = await import("../lib/ai.ts").then((x) => ({ mergeStrade: x.mergeStrade, planFromAi: x.planFromAi }));
  const plD = planFromAi({ n: "x", kd: "prova", tl: [{ h: 4, a: "casa", t: "stanza" }, { t: "" }, null as never], cd: [{ t: "netto", h: "chiedi", g: true }], nx: ["dopo", 3 as never] });
  assert.ok(plD.kd === "prova" && plD.tl!.length === 1 && plD.tl![0].h === 3 && plD.cond![0].gate && plD.cond![0].st === "?" && plD.next!.length === 1);
  const mgD = mergeStrade(exD.model, { a: [{ n: "Accetto Ibiza", tl: [{ h: 1, t: "nuovo" }] }, { n: "Spagna continentale", kd: "cerca", cd: [{ t: "offerta" }] }, "bad" as never] });
  assert.deepEqual(mgD.added, ["Spagna continentale"]);
  assert.equal(mgD.model.options.find((o) => o.name === "Accetto Ibiza")!.tl!.length, exD.model.options[0].tl!.length);   // non sovrascrive
  console.log("engine: strade, conseguenze, decisione condizionata ok");
  // 31. «se va male» che è un altro evento (stipendio perso) segnalato; variazione realistica no
  assert.ok(E.oddScenario({ id: "z", name: "Ibiza", s: {}, impacts: [{ r: "cash_m", v: [-1500, 2000, 2500] }] }));
  assert.equal(E.oddScenario({ id: "z", name: "Ibiza", s: {}, impacts: [{ r: "cash_m", v: [1500, 2000, 2500] }] }), null);
  assert.equal(E.oddScenario({ id: "z", name: "Roma", s: {}, impacts: [{ r: "cash_m", v: [-600, 0, 500] }] }), null);
  // 32. riserva con verifiche vincolanti aperte: niente «passa a» secco
  const fbD = structuredClone((await import("../lib/demo.ts")).exampleDecision);
  const fbR = E.readiness(fbD, E.analyzeDecision(fbD), {}, []);
  const fbO = fbD.model.options.find((o) => o.id === fbR.fallback!.id)!;
  fbO.cond = [...(fbO.cond ?? []), { id: "g9", t: "Contratto di 12 mesi", gate: true, st: "?" }];
  const fbR2 = E.readiness(fbD, E.analyzeDecision(fbD), {}, []);
  assert.ok(fbR2.fallback!.open.includes("Contratto di 12 mesi"));
  assert.ok(E.stopText(fbR2).includes("prossima strada da valutare") && !E.stopText(fbR2).includes("passa a"), E.stopText(fbR2));
  assert.ok(!E.stopText(fbR).includes("prossima strada da valutare"));
  // 33. condizioni separate da cose da chiarire
  assert.ok(fbR.open.some((c) => c.grp === "cond") && fbR.open.some((c) => c.grp === "chiarire"));
  assert.ok(fbR.open.filter((c) => c.kind === "basi" || c.kind === "doppio").every((c) => c.grp === "chiarire"));
  assert.ok(fbR.open.filter((c) => c.kind === "dato" && c.t.startsWith("La tua valutazione")).every((c) => c.grp === "chiarire"));
  console.log("engine: riserva prudente, condizioni vs cose da chiarire, scenari incoerenti ok");
  // 34. registro dei rischi: impatto, limiti, confronto, condizioni
  assert.equal(E.riskTotal({ id: "a", t: "x", p: "media", c: -2500, m: -700, d: 3 }), -4600);
  assert.equal(E.riskTotal({ id: "a", t: "x", p: "media", c: null, m: null }), 0);
  const rkD = structuredClone((await import("../lib/demo.ts")).exampleDecision);
  const rbase = { cash0: 3000, cash_m: -300, hours_w: 50 }, rrules = [{ id: "l", name: "Liquidità mai negativa", r: "cash_end", min: 0 }];
  const e1 = rkD.model.options.find((o) => o.id === "E1")!;
  const v1 = E.riskViews(e1, rbase, rrules);
  assert.ok(v1.length === 3 && v1[0].tot === -4600 && v1[0].endAfter != null);
  const rsm = E.riskSummary(rkD, rbase, rrules);
  assert.ok(rsm.every((x) => x.n > 0) && rsm.find((x) => x.id === "E1")!.alte === 1 && rsm.every((x) => x.pesato <= 0));
  // con risparmi bassi un rischio rompe i limiti → diventa condizione della strada in testa
  const rdR = E.readiness(rkD, E.analyzeDecision(rkD), { cash0: 0, cash_m: -300 }, rrules);
  const leadR = rdR.lead!.id;
  const leadV = E.riskViews(rkD.model.options.find((o) => o.id === leadR)!, { cash0: 0, cash_m: -300 }, rrules);
  if (leadV.some((r) => r.breaks.length && r.p !== "bassa")) assert.ok(rdR.open.some((c) => c.kind === "rischio" && c.grp === "cond"));
  // rischi dall'AI: importi sempre negativi, probabilità valida
  const pr2 = (await import("../lib/ai.ts")).planFromAi({ n: "x", rk: [{ t: "perdo il lavoro", p: "boh", c: 3000, m: 500, d: 3, x: "contratto 12 mesi" }, { t: "" }] });
  assert.ok(pr2.risks!.length === 1 && pr2.risks![0].p === "media" && pr2.risks![0].c === -3000 && pr2.risks![0].m === -500 && pr2.risks![0].src === "ai");
  console.log("engine: registro dei rischi ok");
  // 35. «se scegli questa strada»: tieni conto di / però hai anche
  const { briefing } = await import("../lib/narrative.ts");
  const bD = structuredClone((await import("../lib/demo.ts")).exampleDecision);
  const bR = E.analyzeDecision(bD);
  const b1 = briefing(bD, bR, bD.model.options.find((o) => o.id === "E1")!, { cash0: 12000, cash_m: -300 }, []);
  assert.ok(b1.watch.some((x) => x.startsWith("Deve essere vero") && x.includes("la strada cade")), JSON.stringify(b1.watch));
  assert.ok(b1.watch.some((x) => x.startsWith("Rischio alto")) && b1.plus.some((x) => x.startsWith("È la migliore")));
  assert.ok(b1.seq[0].startsWith("Entro 30 giorni") && b1.next.length > 0);
  const b4 = briefing(bD, bR, bD.model.options.find((o) => o.id === "E4")!, {}, []);
  assert.equal(b4.plus.filter((x) => /tornare indietro/i.test(x)).length, 1);
  console.log("narrative: se scegli questa strada ok");
  // 36. il falso dilemma blocca «Pronta» (anche con dati certi e nessun'altra condizione)
  const dlD: Decision = { id: "fd", name: "fd", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Accetto Ibiza", s: { p: 100 }, m: { p: { rel: "F" } } }, { id: "b", name: "Rifiuto e resto fermo", s: { p: 25 }, m: { p: { rel: "F" } } }] } };
  const dlR = E.readiness(dlD, E.analyzeDecision(dlD));
  assert.ok(dlR.dilemma && dlR.state === "non_pronta" && dlR.open.some((c) => c.kind === "dilemma" && c.grp === "chiarire"), JSON.stringify(dlR.state));
  // 37. liquidità: se lo scenario sfavorevole sfora i limiti, la frase lo dice (non il contrario)
  const lqD: Decision = { ...dlD, model: { ...dlD.model, options: [
    { ...dlD.model.options[0], impacts: [{ r: "cash0", v: -6000 }, { r: "cash_m", v: [-1000, 200, 400] }] }, dlD.model.options[1],
    { id: "c", name: "Accetto Ibiza, solo a condizioni", kd: "cond", s: { p: 50 }, m: { p: { rel: "F" } } }, { id: "d", name: "Accetto Ibiza in prova", kd: "prova", s: { p: 50 }, m: { p: { rel: "F" } } }] } };
  const lqR = E.readiness(lqD, E.analyzeDecision(lqD), { cash0: 6000, cash_m: 0 }, [{ id: "l", name: "Liquidità mai negativa", r: "cash_end", min: 0 }]);
  const liq = lqR.open.find((c) => c.kind === "liquidita")!;
  assert.ok(liq && liq.t.startsWith("Se va male, entro 12 mesi superi i tuoi limiti") && !liq.t.includes("non superi") && liq.t.includes("sotto il minimo"), liq?.t);
  console.log("engine: falso dilemma blocca Pronta, frase liquidità corretta ok");
  // 38. dominio come input: orizzonti e aree per tipo, niente casa/famiglia dove non c'entrano
  const { TEMPLATES, fromTemplate } = await import("../lib/templates.ts");
  const want: Record<string, { ph: string; no: string[] }> = {
    fornitore: { ph: "Prima della firma", no: ["casa", "famiglia"] }, persona: { ph: "Prima della firma", no: ["casa", "famiglia"] },
    auto: { ph: "Dopo 5 anni", no: ["famiglia", "casa"] }, soldi: { ph: "Dopo 3 anni", no: ["casa", "famiglia"] }, progetto: { ph: "Entro 30 giorni", no: ["casa", "famiglia"] },
    studio: { ph: "Entro 12 mesi", no: ["casa"] }, lavoro: { ph: "Entro 30 giorni", no: [] }, casa: { ph: "Dopo 1 anno", no: [] },
  };
  for (const t of TEMPLATES) {
    const x = fromTemplate(t);
    assert.equal(x.model.tipo, t.k);
    const phl = E.phasesOf(x.model).map((p) => p.l), ar = E.areasOf(x.model);
    assert.ok(phl.includes(want[t.k].ph), `${t.k}: ${phl}`);
    for (const n of want[t.k].no) assert.ok(!ar.includes(n), `${t.k} non deve avere l'area ${n}: ${ar}`);
    assert.ok(x.model.options.every((o) => o.kd), `${t.k}: strategie delle strade`);
  }
  assert.ok(E.areasOf({ tipo: "fornitore" }).includes("clienti") && E.areasOf({ tipo: "morale" }).includes("relazioni"));
  assert.ok(!E.areasOf({}).includes("casa") && !E.areasOf({}).includes("famiglia"));   // decisione senza tipo: aree neutre
  // 39. cinque decisioni diverse dall'Analista (risposte simulate): orizzonti e aree dalla decisione, strategie pertinenti
  const { structToModel: sTM } = await import("../lib/ai.ts");
  const cases: [string, Record<string, unknown>, string, string][] = [
    ["risparmi", { n: "15.000 €: anticipo auto, liquidità o investo", k: "soldi", a: [{ n: "Anticipo auto", kd: "base" }, { n: "Tengo liquidità", kd: "sq" }, { n: "Investo metà, metà liquida", kd: "prova" }] }, "Dopo 5 anni", "sicurezza"],
    ["fornitori", { n: "Fornitore servizio", k: "fornitore", ph: [{ h: 0, l: "Prima della firma" }, { h: 0.5, l: "Prime 2 settimane" }, { h: 3, l: "90 giorni" }, { h: 12, l: "12 mesi" }], ar: ["costi", "qualità", "sla", "operatività"],
      a: [{ n: "Fornitore A", kd: "base", tl: [{ h: 2, a: "sla", t: "SLA in collaudo" }] }, { n: "Pilota con B su una sede", kd: "prova" }, { n: "Tengo l'attuale", kd: "sq" }] }, "Prima della firma", "sla"],
    ["assunzione", { n: "Senior o due junior", k: "persona", a: [{ n: "Assumo il senior", kd: "base" }, { n: "Due junior", kd: "base" }, { n: "Senior a tempo determinato", kd: "temp" }] }, "Entro 90 giorni", "team"],
    ["magistrale", { n: "Magistrale mentre lavoro", k: "studio", a: [{ n: "Mi iscrivo ora", kd: "base" }, { n: "Rimando di un anno", kd: "rinvio" }, { n: "Corso breve prima", kd: "prova" }] }, "Entro 6 mesi", "carriera"],
    ["progetto", { n: "Chiudo o altri 6 mesi", k: "progetto", a: [{ n: "Chiudo ora", kd: "base" }, { n: "Altri 6 mesi con obiettivi", kd: "temp" }, { n: "Riduco e testo un pivot", kd: "prova" }] }, "Entro 30 giorni", "clienti"],
  ];
  for (const [nm, raw, ph, ar] of cases) {
    const st = sTM(raw as never);
    const phl = E.phasesOf(st.model).map((p) => p.l), ars = E.areasOf(st.model);
    assert.ok(phl.includes(ph), `${nm}: orizzonti ${phl}`);
    assert.ok(ars.includes(ar) && !ars.includes("casa") && !ars.includes("famiglia"), `${nm}: aree ${ars}`);
    assert.ok(new Set(st.model.options.map((o) => o.kd)).size >= 2, `${nm}: strategie diverse`);
  }
  const fz = sTM(cases[1][1] as never).model.options[0].tl![0];
  assert.ok(fz.h === 3 && fz.a === "sla", JSON.stringify(fz));   // tappa agganciata all'orizzonte più vicino della decisione
  // 40. risorse definite dall'utente: personale disponibile ≥ 4, una strada ne consuma 2
  const hr: Decision = { id: "h", name: "Assunzioni", status: "aperta", imp: 1, model: { tipo: "persona", criteria: [{ id: "p", name: "Competenze", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Sposto 2 persone sul progetto", kd: "base", s: { p: 100 }, m: { p: { rel: "F" } }, impacts: [{ r: "x_pers", v: -2 }] },
      { id: "b", name: "Assumo un esterno", kd: "base", s: { p: 50 }, m: { p: { rel: "F" } } }, { id: "c", name: "Pilota con 1 persona", kd: "prova", s: { p: 75 }, m: { p: { rel: "F" } }, impacts: [{ r: "x_pers", v: -1 }] }, { id: "d", name: "Rimando", kd: "rinvio", s: { p: 25 }, m: { p: { rel: "F" } } }] } };
  const hrR = E.readiness(hr, E.analyzeDecision(hr), { x_pers: 5 }, [{ id: "q", name: "Personale operativo minimo", r: "x_pers", min: 4 }]);
  const hq = hrR.open.find((c) => c.kind === "liquidita");
  assert.ok(hq && hq.t.includes("Personale operativo minimo") && hq.t.includes("sotto il minimo di 4"), hq?.t);
  assert.deepEqual(E.customRes({ x_pers: 5, cash0: 1 }, { x_pers: { l: "Personale", u: "persone" } }), ["x_pers"]);
  assert.equal(E.resLabel("x_pers", { x_pers: { l: "Personale", u: "persone" } }), "Personale (persone)");
  // 41. falso dilemma generalizzato: «temporanea» vale come strada intermedia, «status quo» come restare fermi
  const g2: Decision = { id: "g", name: "g", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Senior", kd: "base", s: {} }, { id: "b", name: "Nessuno", kd: "sq", s: {} }] } };
  assert.ok(E.falseDilemma(g2));
  g2.model.options.push({ id: "c", name: "Senior a tempo", kd: "temp", s: {} }, { id: "d", name: "Senior solo se budget", kd: "cond", s: {} }, { id: "e", name: "Cerco altro profilo", kd: "cerca", s: {} });
  assert.equal(E.falseDilemma(g2), null);
  console.log("engine: dominio come input (5 decisioni diverse, risorse tue, strategie) ok");
  // 42. strada proposta scartata come non perseguibile: conta come considerata
  const sc: Decision = { id: "s", name: "s", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Accettare proposta Ibiza", s: { p: 75 }, m: { p: { rel: "F" } } }, { id: "b", name: "Resto dove sono", s: { p: 25 }, m: { p: { rel: "F" } } }], tipo: "lavoro" } };
  assert.equal(E.falseDilemma(sc)!.sugg.length, 3);
  sc.model.scartate = [{ kd: "cond", name: "Accettare proposta Ibiza, solo a condizioni", why: "già so che l'azienda non offre alloggio", at: "2026-10-11" }];
  assert.ok(E.falseDilemma(sc)!.sugg.every((x) => x.kd !== "cond"));
  sc.model.scartate.push({ kd: "prova", name: "Accettare proposta Ibiza in prova o in piccolo, con verifica e uscita", at: "2026-10-11" });
  // resta una proposta non considerata: l'avviso resta (finché c'è anche una sola strada plausibile non valutata)
  assert.equal(E.falseDilemma(sc)!.sugg.length, 1);
  sc.model.closed = { at: "2026-10-11", hash: E.closedHash(sc) };   // dichiarazione esplicita: non esistono altre strade perseguibili
  assert.equal(E.falseDilemma(sc), null);
  assert.ok(!E.readiness(sc, E.analyzeDecision(sc)).open.some((c) => c.kind === "dilemma"));
  console.log("engine: strade scartate come non perseguibili ok");
  // 43. spese scritte come positive (4.000 / 3.000 / 2.500): segnalate, anche nella decisione
  const sp = { id: "z", name: "Accettare proposta Ibiza", s: { p: 75 }, m: { p: { rel: "F" as const } }, impacts: [{ r: "cash0", v: -3000 }, { r: "cash_m", v: [4000, 3000, 2500] as [number, number, number] }] };
  assert.ok(E.invertedScenario(sp) && !E.invertedScenario({ ...sp, impacts: [{ r: "cash_m", v: [-4000, -3000, -2500] }] }) && !E.invertedScenario({ ...sp, impacts: [{ r: "cash_m", v: [-600, 0, 500] }] }));
  const spD: Decision = { id: "sp", name: "sp", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [], options: [sp, { id: "b", name: "Status quo", kd: "sq", s: { p: 25 }, m: { p: { rel: "F" } } }] } };
  assert.ok(E.readiness(spD, E.analyzeDecision(spD)).open.some((c) => c.key === "ivz" && c.t.includes("segno")));
  console.log("engine: spese senza segno segnalate ok");
  // 44. conti: oggi NASpI +1.100, spesa famiglia −1.200, casa di proprietà 0; con Ibiza NASpI sparisce, stipendio +2.400, affitto −1.450 (1.300–1.700)
  const oggi: import("../lib/engine.ts").Line[] = [{ id: "n", t: "NASpI", k: "e", v: 1100, f: "D" }, { id: "f", t: "Spesa famiglia", k: "s", v: 1200, f: "D" }, { id: "c", t: "Casa a Roma (di proprietà)", k: "s", v: 0, f: "D" }];
  const ib: import("../lib/engine.ts").Opt = { id: "i", name: "Accetto Ibiza", s: {}, conti: [
    { id: "f2", t: "Spesa famiglia", k: "s", v: 1200, from: "f" }, { id: "c2", t: "Casa a Roma (di proprietà)", k: "s", v: 0, from: "c" },
    { id: "st", t: "Stipendio netto Ibiza", k: "e", v: 2400, f: "S" }, { id: "af", t: "Affitto Ibiza", k: "s", v: 1450, lo: 1300, hi: 1700, f: "S" }, { id: "tr", t: "Trasloco", k: "s", v: 3000, u: true }] };
  const cdx = E.contiDelta(ib, oggi)!;
  assert.deepEqual([cdx.oggi, cdx.strada[1], cdx.delta[1]], [-100, -250, -150]);
  assert.deepEqual(cdx.delta, [-400, -150, 0]);   // affitto 1.700 se va male, 1.300 se va bene
  assert.equal(cdx.once, -3000);
  const mx = E.syncConti({ criteria: [], constraints: [], options: [ib], oggi });
  assert.deepEqual(mx.options[0].impacts!.find((x) => x.r === "cash_m")!.v, [-400, -150, 0]);
  assert.equal(mx.options[0].impacts!.find((x) => x.r === "cash0")!.v, -3000);
  // 45. conti dall'Analista: non sovrascrive, copia oggi, toglie ciò che sparisce; senza consenso niente cifre
  const AI = await import("../lib/ai.ts");
  const dC: Decision = { id: "c", name: "c", status: "aperta", imp: 1, descr: "Offerta a Ibiza, netto 2.400 €, a Roma casa di proprietà", model: { criteria: [], constraints: [], options: [{ id: "i", name: "Accetto Ibiza", s: {} }, { id: "r", name: "Resto", s: {}, conti: [{ id: "u", t: "mia voce", k: "s", v: 5 }] }],
    oggi: [{ id: "f", t: "Spesa famiglia", k: "s", v: 1200, f: "D" }] } };
  const cr = AI.contiFromAi(dC.model, { q: ["Quanto entra oggi?"], o: [{ t: "NASpI", k: "e", v: 1100, f: "D" }, { t: "spesa famiglia", k: "s", v: 9999 }],
    s: [{ a: "Accetto Ibiza", x: ["NASpI"], l: [{ t: "Stipendio netto Ibiza", k: "e", v: 2400, f: "S" }] }, { a: "Resto", l: [{ t: "x", k: "s", v: 1 }] }] });
  assert.equal(cr.model.oggi!.find((l) => /famiglia/i.test(l.t))!.v, 1200);   // la tua voce resta
  assert.ok(cr.model.oggi!.some((l) => l.t === "NASpI" && l.src === "ai"));
  const ibc = cr.model.options[0].conti!;
  assert.ok(!ibc.some((l) => l.t === "NASpI") && ibc.some((l) => l.t === "Stipendio netto Ibiza" && l.f === "S") && ibc.some((l) => l.from));
  assert.equal(cr.model.options[1].conti!.length, 1);   // conti già scritti: non toccati
  // seconda richiesta con le risposte: riempie solo gli importi vuoti (anche nelle copie da oggi)
  const empty = AI.contiFromAi(dC.model, { o: [{ t: "NASpI", k: "e", v: null }], s: [{ a: "Accetto Ibiza", x: ["NASpI"], l: [{ t: "Affitto Ibiza", k: "s", v: null }] }] }).model;
  const filled = AI.contiFromAi(empty, { o: [{ t: "NASpI", k: "e", v: 1100, f: "D" }, { t: "Spesa famiglia", k: "s", v: 1 }], s: [{ a: "Accetto Ibiza", l: [{ t: "Affitto Ibiza", k: "s", v: 1450, f: "S" }] }] }).model;
  assert.equal(filled.oggi!.find((l) => l.t === "NASpI")!.v, 1100);
  assert.equal(filled.oggi!.find((l) => l.t === "Spesa famiglia")!.v, 1200);
  assert.equal(filled.options[0].conti!.find((l) => l.t === "Affitto Ibiza")!.v, 1450);
  assert.deepEqual(cr.questions, ["Quanto entra oggi?"]);
  const pl0 = JSON.stringify(AI.contiPayload(dC, false));
  assert.ok(!/\d{3}/.test(pl0) && pl0.includes("privacy"), pl0);
  assert.ok(JSON.stringify(AI.contiPayload(dC, true)).includes("1200"));
  // 46. conti incompleti o stimati → cose da chiarire
  const dR: Decision = { id: "z", name: "z", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [], oggi,
    options: [{ ...ib, s: { p: 100 }, m: { p: { rel: "F" } }, kd: "cond" }, { id: "b", name: "B", s: { p: 25 }, m: { p: { rel: "F" } }, kd: "prova" }, { id: "c", name: "C", s: { p: 25 }, m: { p: { rel: "F" } }, kd: "cerca" }] } };
  assert.ok(E.readiness(dR, E.analyzeDecision(dR)).open.some((c) => c.key === "conti" && c.t.includes("stime")));
  console.log("engine: conti di oggi e per strada ok");
  // 47. premessa: legge tutto ciò che è emerso; senza consenso niente cifre
  const pd: Decision = { ...dC, model: { ...cr.model, scartate: [{ kd: "cond", name: "Ibiza a condizioni", why: "niente alloggio", at: "x" }],
    options: cr.model.options.map((o, i) => (i === 0 ? { ...o, cond: [{ id: "c", t: "Netto confermato", st: "si" as const }], risks: [{ id: "r", t: "Contratto stagionale", p: "alta" as const }] } : o)) } };
  const pp = JSON.stringify(AI.premessaPayload(pd, false, ["Quanto netto? 2.400 €"]));
  assert.ok(pp.includes("Netto confermato [vero]") && pp.includes("Contratto stagionale [alta]") && pp.includes("niente alloggio") && pp.includes("Stipendio netto Ibiza") && pp.includes("NASpI"), pp);
  assert.ok(!/\d{3}/.test(pp.replace(/"k":"[a-z]+"/g, "")), pp);
  assert.ok(JSON.stringify(AI.premessaPayload(pd, true)).includes("2400"));
  console.log("ai: premessa dai dati emersi ok");
  // 48. frase sulle basi: non più rovesciata
  const bz = E.readiness(structuredClone((await import("../lib/demo.ts")).exampleDecision), E.analyzeDecision(structuredClone((await import("../lib/demo.ts")).exampleDecision)), {}, []).open.find((c) => c.kind === "basi")!;
  assert.ok(/^Solo il \d+% del punteggio di .+ poggia su dati certi o dichiarati; il \d+% deriva da stime o valori senza fonte$/.test(bz.t), bz.t);
  // 49. stato delle strade: «non perseguibile» resta visibile, esce dai calcoli; lo scarto vale per la strada concreta, non per il tipo
  const st: Decision = { id: "st", name: "st", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Accetto", s: { p: 100 }, m: { p: { rel: "F" } } }, { id: "b", name: "Resto fermo", kd: "sq", s: { p: 25 }, m: { p: { rel: "F" } } },
      { id: "c", name: "Accetto, solo a condizioni", kd: "cond", s: { p: 90 }, m: { p: { rel: "F" } }, st: "np", stWhy: "nessun alloggio" }], tipo: "lavoro" } };
  const sr = E.analyzeDecision(st);
  assert.ok(sr.rows.find((x) => x.id === "c")!.excluded[0] === "non perseguibile: nessun alloggio" && sr.rows[0].id === "a");
  const sd = E.falseDilemma(st)!;
  assert.ok(sd && !sd.sugg.some((x) => x.kd === "cond") && sd.sugg.some((x) => x.kd === "prova"), JSON.stringify(sd));   // quella strada concreta è stata considerata
  st.model.options[0].name = "Accetto l'offerta di Milano";   // strada principale diversa: la sua versione condizionata non è mai stata valutata
  assert.ok(E.falseDilemma(st)!.sugg.some((x) => x.kd === "cond"));
  // 50. reversibilità: prima di poco ma irreversibile, alternativa reversibile vicina → da chiarire
  const rvD: Decision = { id: "rv", name: "rv", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Compro casa", s: { p: 100 }, m: { p: { rel: "F" } }, rev: { out: 15000, back: 24, lock: "alto" } },
      { id: "b", name: "Affitto 2 anni", kd: "temp", s: { p: 100 }, m: { p: { rel: "F" } }, rev: { out: 500, back: 2, lock: "basso" } },
      { id: "c", name: "Compro solo se mutuo sotto il 3%", kd: "cond", s: { p: 25 }, m: { p: { rel: "F" } } }, { id: "d", name: "Cerco altre zone", kd: "cerca", s: { p: 25 }, m: { p: { rel: "F" } } }] } };
  rvD.model.options[1].s.p = 96;
  rvD.model.criteria.push({ id: "q", name: "Q", w: 0, imp: 1, kind: "g" }); rvD.model.options.forEach((o) => { o.s.q = 50; (o.m ??= {}).q = { rel: "F" }; });
  const rvR = E.readiness(rvD, E.analyzeDecision(rvD));
  const rvc = rvR.open.find((c) => c.kind === "rev");
  assert.ok(rvc && rvc.t.includes("Compro casa") && rvc.t.includes("Affitto 2 anni") && rvc.grp === "chiarire", JSON.stringify(rvR.open.map((c) => c.t)));
  assert.ok(E.revOf(rvD.model.options[0])!.irr && E.revOf(rvD.model.options[1])!.rev);
  // 51. costo del non decidere e scadenze
  const in5 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const wD: Decision = { ...rvD, due: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10), model: { ...rvD.model, wait: { m: 1100, t: "la NASpI si consuma" }, options: rvD.model.options.map((o, i) => (i === 0 ? { ...o, exp: in5 } : o)) } };
  const wv = E.waitView(wD);
  assert.deepEqual([wv.left, wv.c7, wv.c30, wv.c90, wv.exp[0].name], [5, 257, 1100, 3300, "Compro casa"]);
  const exD2w: Decision = { ...wD, model: { ...wD.model, options: wD.model.options.map((o, i) => (i === 0 ? { ...o, exp: "2020-01-01" } : o)) } };
  assert.ok(E.analyzeDecision(exD2w).rows.find((x) => x.id === "a")!.excluded.some((w) => w.startsWith("scaduta")));
  // 52. valore dell'informazione: forza × costo; troppo lento rispetto alla scadenza = decidi senza
  assert.equal(E.voiOf(wD, "k", 0.3, wv).worth, "?");
  wD.model.voi = { k: { c: "facile", days: 2 }, j: { c: "difficile", days: 1 }, z: { c: "medio", days: 14 } };
  assert.equal(E.voiOf(wD, "k", 0.3, wv).worth, "si");
  assert.equal(E.voiOf(wD, "j", 0.05, wv).worth, "no");
  const late = E.voiOf(wD, "z", 0.4, wv);
  assert.ok(late.late && late.worth === "no");
  console.log("engine: stato strade, reversibilità, costo dell'attesa, valore dell'informazione ok");
  // 53. adatta: le stime AI non toccate si aggiornano, i tuoi numeri no
  const ad = AI.contiFromAi({ criteria: [], constraints: [], options: [{ id: "i", name: "Ibiza", s: {}, conti: [{ id: "s1", t: "Stipendio netto", k: "e", v: 2400, src: "ai", f: "S" }, { id: "s2", t: "Affitto", k: "s", v: 1300 }] }] },
    { s: [{ a: "Ibiza", l: [{ t: "Stipendio netto", k: "e", v: 2050, lo: 2000, hi: 2100, f: "D" }, { t: "Affitto", k: "s", v: 1500 }] }] }).model.options[0].conti!;
  assert.deepEqual([ad[0].v, ad[0].lo, ad[0].hi, ad[0].f, ad[1].v], [2050, 2000, 2100, "D", 1300]);
  console.log("ai: adatta la decisione senza toccare i tuoi numeri ok");
  // 54. capitale a rischio: operativamente reversibile ma 40.000 € per provarla → va detto
  const cp = E.revOf({ id: "x", name: "Compro attrezzatura", s: {}, rev: { in: 40000, out: 500, back: 1, lock: "basso" } }, { cash0: 60000 })!;
  assert.ok(cp.rev && !cp.irr && cp.cap === 40500 && cp.capHigh && cp.label.startsWith("Operativamente reversibile, ma provarla espone"), cp.label);
  assert.ok(!E.revOf({ id: "y", name: "y", s: {}, rev: { in: 300, back: 1, lock: "basso" } }, { cash0: 60000 })!.capHigh);
  const cpD: Decision = { id: "cp", name: "cp", status: "aperta", imp: 1, model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Compro attrezzatura", s: { p: 100 }, m: { p: { rel: "F" } }, rev: { in: 40000, out: 500, back: 1, lock: "basso" } },
      { id: "b", name: "Noleggio", kd: "prova", s: { p: 50 }, m: { p: { rel: "F" } } }, { id: "c", name: "Compro solo se finanziato", kd: "cond", s: { p: 25 }, m: { p: { rel: "F" } } }, { id: "d", name: "Cerco usato", kd: "cerca", s: { p: 25 }, m: { p: { rel: "F" } } }] } };
  assert.ok(E.readiness(cpD, E.analyzeDecision(cpD), { cash0: 60000 }).open.some((c) => c.key === "cap" && c.t.includes("40.500")));
  // 55. «Da verificare» blocca «Pronta»; «Scelta» è riportata
  const vD = structuredClone(cpD); delete vD.model.options[0].rev;
  assert.equal(E.readiness(vD, E.analyzeDecision(vD)).state, "pronta");
  vD.model.options[0].st = "verifica";
  const vR = E.readiness(vD, E.analyzeDecision(vD));
  assert.ok(vR.state === "non_pronta" && vR.open.some((c) => c.key === "ver"));
  vD.model.options[0].st = "scelta";
  const sR = E.readiness(vD, E.analyzeDecision(vD));
  assert.ok(sR.chosen && sR.chosen.name === "Compro attrezzatura" && sR.chosen.wasLead && sR.state === "pronta");
  // 56. la chiusura dello spazio delle alternative vale solo per il contesto in cui è stata fatta
  const cl: Decision = { id: "cl", name: "cl", status: "aperta", imp: 1, descr: "Offerta di lavoro", model: { criteria: [{ id: "p", name: "P", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Accetto", s: { p: 75 } }, { id: "b", name: "Resto fermo", kd: "sq", s: { p: 25 } }] } };
  cl.model.closed = { at: "2026-10-11", hash: E.closedHash(cl) };
  assert.equal(E.falseDilemma(cl), null);
  cl.model.options[0].name = "Accetto l'offerta di Milano";   // la strada principale cambia
  const stl = E.falseDilemma(cl)!;
  assert.ok(stl && stl.stale && stl.msg.startsWith("Hai modificato la decisione"), JSON.stringify(stl));
  cl.model.options[0].name = "Accetto";
  assert.equal(E.falseDilemma(cl), null);   // tornato al contesto di allora: la dichiarazione vale di nuovo
  cl.descr = "Offerta di lavoro, e ora c'è anche un'offerta a Milano";
  assert.ok(E.falseDilemma(cl)?.stale);
  // vecchie dichiarazioni senza impronta: non verificabili, vanno riconfermate
  delete cl.model.closed.hash; assert.ok(E.falseDilemma(cl)?.stale);
  // 57. l'AI si aggancia alle strade per codice (A, B…), non per nome; nomi doppi distinti
  const ff = [{ id: "1", name: "Offerta" }, { id: "2", name: "Offerta" }, { id: "3", name: "Resto" }];
  assert.equal(AI.findOpt(ff, "B")!.id, "2"); assert.equal(AI.findOpt(ff, "B) Offerta")!.id, "2"); assert.equal(AI.findOpt(ff, "resto")!.id, "3");
  const dn = AI.structToModel({ a: [{ n: "Offerta" }, { n: "offerta" }] } as never).model.options.map((o) => o.name);
  assert.deepEqual(dn, ["Offerta", "offerta (2)"]);
  console.log("engine: capitale a rischio, stati verifica/scelta, chiusura delle strade ok");
  // 58. correzioni dal test sui 10 casi
  assert.equal(E.isStatusQuo({ id: "t", name: "Resto in affitto 2 anni", kd: "temp", s: {} } as never), false);
  assert.equal(E.isStatusQuo({ id: "t", name: "Resto in affitto", s: {} } as never), true);
  const odd = { id: "x", name: "Apro", s: {}, impacts: [{ r: "cash_m", v: [-1500, 2000, 2500] }] } as never as import("../lib/engine.ts").Opt;
  assert.ok(E.oddScenario(odd));
  (odd.impacts![0] as { okSf?: boolean }).okSf = true;
  assert.equal(E.oddScenario(odd), null);   // confermato: è la stessa strada andata peggio
  console.log("engine: correzioni dal test sui 10 casi ok");
}
{
  // 59. previsione salvata alla scelta e lezioni dai consuntivi (solo sopra la soglia, sempre con il numero di casi)
  const E = await import("../lib/engine.ts");
  const d: Decision = { id: "p", name: "p", status: "aperta", imp: 1, model: { criteria: [{ id: "q", name: "Q", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Apro", s: { q: 75 }, m: { q: { rel: "S" } }, impacts: [{ r: "cash0", v: -10000 }, { r: "cash_m", v: [-200, 300, 600] }], risks: [{ id: "r1", t: "Ritardo", p: "media", c: -2000 }], rev: { in: 10000, lock: "alto" } },
      { id: "b", name: "Resto", kd: "sq", s: { q: 50 }, m: { q: { rel: "F" } } }] } };
  const r = E.analyzeDecision(d);
  const pa = E.predOf(d, r, "a")!, pb = E.predOf(d, r, "b")!;
  assert.ok(pa.top && pa.pos === 1 && pa.c0 === -10000 && pa.m![1] === 300 && pa.cert === 0 && pa.irr === true && pa.cap === 10000 && pa.rs[0].tot === -2000, JSON.stringify(pa));
  assert.ok(!pb.top && pb.pos === 2 && pb.gap > 0 && pb.cert === 100);
  const mk = (c0: number, m: number, hit: boolean, ok: number, top = true) => ({ pred: { ...pa, top }, act: { c0, m, ok, hit: (hit ? { r1: -3000 } : {}) as Record<string, number> } });
  assert.deepEqual(E.lessons([mk(-12000, 100, true, 2), mk(-11000, 0, true, 2)]), []);   // 2 casi: nessuna lezione
  const six = [mk(-12000, -300, true, 2), mk(-11800, 0, true, 3), mk(-12500, 200, true, 2, false), mk(-11500, 300, false, 4, false), mk(-12200, -400, true, 3, false), mk(-10000, 300, false, 4)];
  const ls = E.lessons(six);
  const by = (k: string) => ls.find((l) => l.k === k)!;
  assert.ok(by("c0").t.startsWith("Sottostimi le spese iniziali: in genere costano il 19%") && by("c0").n === 6, by("c0").t);
  assert.ok(/ti restano 200.€ al mese in meno.*Nel 33% dei casi è andata peggio anche del tuo «se va male»/.test(by("m").t), by("m").t);
  assert.ok(/probabilità media si sono verificati nel 67%.*Li sottovaluti.*costano più/.test(by("r_media").t), by("r_media").t);
  assert.ok(by("top").n === 6 && !ls.some((l) => l.k === "cert"));   // tutte con dati poco verificati: nessun confronto
  console.log("engine: previsione e lezioni dai consuntivi ok");
}
{
  // 60. piano operativo: le verifiche diventano passi con chi/entro/dopo; chiuderli cambia il modello
  const E = await import("../lib/engine.ts");
  const X = await import("../lib/execution.ts");
  const d: Decision = { id: "x", name: "Ibiza", status: "aperta", imp: 1, model: { tipo: "lavoro", criteria: [{ id: "q", name: "Qualità", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Accetto", s: { q: 100 }, m: { q: { rel: "F" } }, cond: [{ id: "h", t: "Alloggio confermato per iscritto", gate: true, st: "?" }] },
      { id: "b", name: "Resto", kd: "sq", s: { q: 25 }, m: { q: { rel: "F" } } }] } };
  d.model.closed = { at: "2026-10-12", hash: E.closedHash(d) };
  const rd = () => E.readiness(d, E.analyzeDecision(d));
  let p = X.execPlan(d, rd(), "2026-10-12");
  const h = p.prima.find((x) => x.key === "uh")!;
  assert.ok(h && h.act.k === "cond" && h.gate && /esce|Resto/.test(h.stop ?? ""), JSON.stringify(p.prima));
  // chi, entro, dopo: un mio passo che deve venire prima dell'alloggio
  d.model.act = X.setStep(d.model.act, "t_1", { t: "Chiedi la RAL definitiva", ph: "prima", who: "Danilo", due: "2026-10-10" });
  d.model.act = X.setStep(d.model.act, "uh", { who: "Danilo", due: "2026-10-14", dep: "t_1" });
  p = X.execPlan(d, rd(), "2026-10-12");
  assert.deepEqual(p.prima.map((x) => x.key), ["t_1", "uh"]);   // chi aspetta viene dopo
  assert.ok(p.prima[0].late && p.late === 1 && p.prima[1].blocked === "Chiedi la RAL definitiva" && !p.prima[1].late);
  // la checklist cambia la decisione: alloggio «no» → la strada esce, il passo finisce tra i fatti
  d.model.options[0].cond![0].st = "no"; d.model.act = X.setStep(d.model.act, "uh", { done: "2026-10-12" });
  const r2 = rd();
  assert.equal(r2.lead?.id, "b");
  p = X.execPlan(d, r2, "2026-10-12");
  assert.ok(p.fatti.some((x) => x.key === "uh" && /non soddisfatta/.test(x.t)) && !p.prima.some((x) => x.key === "uh"), JSON.stringify(p.fatti));
  // dopo la scelta: passi di attuazione separati
  d.model.act = X.setStep(d.model.act, "t_2", { t: "Comunica il rifiuto", ph: "dopo" });
  assert.deepEqual(X.execPlan(d, r2).dopo.map((x) => x.t), ["Comunica il rifiuto"]);
  // valori vuoti tolti, nessun ciclo infinito su dipendenze reciproche
  d.model.act = X.setStep(d.model.act, "t_2", { who: "" });
  assert.ok(!("who" in d.model.act.t_2));
  d.model.act = X.setStep(X.setStep(d.model.act, "t_1", { dep: "t_3" }), "t_3", { t: "Altro", ph: "prima", dep: "t_1" });
  assert.equal(X.execPlan(d, r2).prima.length, 2);
  console.log("execution: piano operativo che cambia la decisione ok");
}
{
  // 61. monitoraggio: «questa scelta regge finché…», soglie dal motore, osservazioni, debito decisionale
  const M = await import("../lib/monitor.ts");
  const d: Decision = { id: "s", name: "Nuova sede", status: "presa", imp: 1, model: { tipo: "progetto",
    criteria: [{ id: "mg", name: "Margine mensile", w: 0, imp: 4, kind: "num", unit: "€/mese", worst: 2000, best: 6000 }, { id: "q", name: "Qualità della vita", w: 0, imp: 3, kind: "g" }], constraints: [],
    options: [{ id: "a", name: "Apro in centro", st: "scelta", raw: { mg: 5200 }, s: { q: 50 }, cond: [{ id: "k", t: "Personale disponibile almeno 4", st: "si", gate: true }],
      risks: [{ id: "r", t: "Clientela più lenta", p: "media", c: -12000 }, { id: "r2", t: "Muffa", p: "bassa" }], impacts: [{ r: "cash_m", v: [-500, 900, 1500] }, { r: "cash0", v: -40000 }] },
      { id: "b", name: "Resto", kd: "sq", raw: { mg: 3500 }, s: { q: 75 } }] } };
  const th = M.thresholdOf(d, "a", "mg")!;
  assert.ok(th && th.op === "<" && th.v > 3500 && th.v < 5200, JSON.stringify(th));
  const ws = M.watchProposals(d, "a", { cash0: 60000 }, [{ id: "x", name: "Riserva", r: "cash_end", min: 30000 }], "2026-10-01");
  assert.ok(ws.some((w) => w.k === "num" && w.crit === "mg") && ws.some((w) => w.k === "cond") && ws.some((w) => w.k === "rischio" && w.risk === "r") && !ws.some((w) => w.risk === "r2"), JSON.stringify(ws.map((w) => w.t)));
  const liq = ws.find((w) => w.metric === "cash_m");
  assert.ok(liq && liq.op === "<", JSON.stringify(ws.map((w) => w.t)));   // 60.000 − 40.000 = 20.000: per restare sopra 30.000 a 24 mesi servono ≥ +420/mese
  d.model.watch = ws;
  let mo = M.monitorOf(d, "2026-10-12")!;
  assert.ok(mo.state === "osservazione" && mo.due.length === 0);
  mo = M.monitorOf(d, "2026-11-05")!;   // passati 30 giorni: tutti da ricontrollare
  assert.equal(mo.due.length, ws.length);
  const wm = ws.find((w) => w.crit === "mg")!;
  M.observe(d.model, wm.id, { v: th.v + 300 }, "2026-11-05");
  assert.equal(M.monitorOf(d, "2026-11-05")!.state, "osservazione");
  M.observe(d.model, wm.id, { v: th.v - 300 }, "2026-12-05");
  mo = M.monitorOf(d, "2026-12-05")!;
  assert.ok(mo.state === "rivedere" && mo.hits[0].id === wm.id);
  const wr = ws.find((w) => w.risk === "r")!;
  assert.ok(!M.watchState(wr, "2026-10-02").hit);
  M.observe(d.model, wr.id, { ok: true }, "2026-10-02");
  assert.ok(M.watchState(wr, "2026-10-02").hit);   // il rischio è successo
  // debito decisionale
  const open: Decision & { updated_at?: string } = { id: "o", name: "Cambio auto", status: "aperta", imp: 1, due: "2026-09-01", updated_at: "2026-08-01T10:00:00Z",
    model: { tipo: "auto", rinvii: 3, criteria: [{ id: "q", name: "Q", w: 0, imp: 3, kind: "g" }], constraints: [],
      options: [{ id: "x", name: "Usato", s: { q: 50 }, m: { q: { rel: "S" } } }, { id: "y", name: "Nuova", s: { q: 75 }, m: { q: { rel: "S" } } }],
      act: { t_1: { t: "Preventivo", ph: "prima", due: "2026-09-10" } } } };
  const nomon: Decision = { ...d, id: "n", name: "Senza revisione", model: { ...d.model, watch: [] } };
  const db = M.decisionDebt([d, open, nomon], [{ id: "oc", decision_id: "s", decision_name: "Nuova sede", review_at: "2026-10-01", observed: null, act: null }], {}, [], "2026-12-05");
  const ks = db.groups.map((x) => x.k);
  for (const k of ["rivedere", "scadute", "ritardo", "ferme", "rinviate", "esiti", "senza"]) assert.ok(ks.includes(k), k + " " + JSON.stringify(ks));
  assert.equal(db.n, db.groups.reduce((a, x) => a + x.items.length, 0));
  console.log("monitor: regge finché, osservazioni, debito decisionale ok");
}
{
  // 62. evidenze: su quali dati poggia la decisione, freschezza, scadenza; entrano in readiness, piano e debito
  const E = await import("../lib/engine.ts");
  const M = await import("../lib/monitor.ts");
  const d: Decision = { id: "e", name: "Affitto", status: "aperta", imp: 1, model: { tipo: "casa",
    criteria: [{ id: "c", name: "Canone", w: 0, imp: 5, kind: "num", unit: "€/mese", worst: 2000, best: 800 }, { id: "z", name: "Zona", w: 0, imp: 3, kind: "g" }, { id: "l", name: "Luce", w: 0, imp: 1, kind: "g" }],
    constraints: [], closed: undefined,
    options: [{ id: "a", name: "Via Roma", raw: { c: 1000 }, s: { z: 75, l: 50 }, m: { c: { rel: "D", src: "proprietario", dt: "2026-05-01", doc: "annuncio.pdf" }, z: { rel: "F" }, l: { rel: "S" } } },
      { id: "b", name: "Via Po", raw: { c: 1400 }, s: { z: 50, l: 75 }, m: { c: { rel: "F" }, z: { rel: "F" }, l: { rel: "F" } } }] } };
  const r = E.analyzeDecision(d);
  const ev = E.evidenceOf(d, r, "2026-10-12")!;
  assert.ok(ev.opt === "a" && ev.items[0].crit === "c" && ev.items[0].old && ev.items[0].age === 164 && ev.items[0].src === "proprietario", JSON.stringify(ev));
  assert.ok(/più di 90 giorni/.test(ev.text) && ev.items.length >= 2, ev.text);
  d.model.closed = { at: "2026-10-12", hash: E.closedHash(d) };
  const rd = E.readiness(d, r);
  assert.ok(rd.open.some((c) => c.key === "prove" && /rilevato/.test(c.t)), JSON.stringify(rd.open.map((c) => c.key)));
  // aggiornato e con validità futura: niente avviso; validità passata: scaduto
  d.model.options[0].m!.c = { rel: "F", src: "contratto", dt: "2026-10-10", until: "2026-12-31" };
  assert.ok(!E.readiness(d, E.analyzeDecision(d)).open.some((c) => c.key === "prove"));
  d.model.options[0].m!.c.until = "2026-10-01";
  const e2 = E.evidenceOf(d, E.analyzeDecision(d), "2026-10-12")!;
  assert.ok(e2.expired === 1 && /scaduto/.test(e2.text), e2.text);
  assert.ok(M.decisionDebt([d], [], {}, [], "2026-10-12").groups.some((g) => g.k === "dati"));
  console.log("evidenze: dati che decidono, freschezza e scadenza ok");
}
{
  // 63. contesto personale: lettura senza AI, revisione, pertinenza, privacy verso l'AI, suggerimenti sui pesi, quadro
  const C = await import("../lib/context.ts");
  const doc = `DECISION OS — CONTESTO PERSONALE
## FATTI
- [stabile] Vivo a Roma in una casa di proprietà
## RISORSE
- [fase] Liquidità disponibile | n=23.000 € | risorsa=liquidita
## VINCOLI
- [fase] Non posso restare senza reddito oltre 6 mesi | n=6 mesi
## VALORI E PRIORITÀ
- [stabile] La famiglia unita viene prima del lavoro | imp=5
## REGOLE PERSONALI
- Non uso più del 30% dei risparmi per un progetto | globale
## DA VERIFICARE
- [fase] Possibile trasferimento a Ibiza | sensibile
- [fase] …`;
  const it = C.parseContext(doc, "test", "2026-10-12");
  assert.deepEqual(it.map((x) => x.k), ["fatto", "risorsa", "vincolo", "valore", "regola", "incertezza"]);
  assert.ok(it[1].n === 23000 && it[1].res === "cash0" && it[3].imp === 5 && it[5].priv && it.every((x) => x.st === "proposto"));
  assert.equal(C.relevantCtx(it, { name: "Lavoro a Ibiza", descr: "famiglia" }).length, 0);   // non confermati: non si usano
  const ok = it.map((x) => ({ ...x, st: "confermato" as const }));
  const m = C.mergeCtx(ok, C.parseContext(doc));
  assert.equal(m.dup, 6);   // lo stesso testo non entra due volte
  const rel = C.relevantCtx(ok, { name: "Lavoro a Ibiza", descr: "Mi offrono un lavoro: la famiglia resterebbe a Roma" });
  assert.ok(rel.some((x) => x.k === "valore") && rel.some((x) => x.k === "vincolo") && rel.some((x) => x.k === "regola"), JSON.stringify(rel.map((x) => x.t)));
  const ai = C.ctxForAi(ok, false);
  assert.ok(!ai.some((l) => /Ibiza/.test(l)) && !ai.some((l) => /23000|23\.000/.test(l)) && ai.some((l) => /6 mesi/.test(l)), JSON.stringify(ai));   // privato fuori, € fuori, mesi dentro
  assert.ok(C.ctxForAi(ok, true).some((l) => /23000/.test(l)));
  const hs = C.critHints(ok, [{ id: "f", name: "Famiglia unita", w: 0, imp: 3, kind: "g" }, { id: "r", name: "Reddito garantito", w: 0, imp: 4, kind: "g" }]);
  assert.ok(hs.some((h) => h.crit === "f" && h.imp === 5) && hs.some((h) => h.crit === "r" && h.asConstraint), JSON.stringify(hs.map((h) => h.text)));
  const ex = C.ctxFromAi({ e: [{ k: "fatto", t: "Ho un figlio" }, { k: "boh", t: "inventato" }, { k: "valore", t: "Salute prima", s: true, imp: 9 }] });
  assert.ok(ex.length === 2 && ex[1].priv && ex[1].imp === undefined);
  const decs = ["A", "B"].map((n) => ({ id: n, name: `Progetto ${n}`, status: "aperta" as const, imp: 1, model: { criteria: [], constraints: [], options: [{ id: "o", name: "Sì", s: {}, impacts: [{ r: "hours_w", v: -10 }] }] } }));
  const pic = C.contextPicture([...ok, { id: "z", k: "progetto", t: "FleetUnit in sviluppo", layer: "fase", st: "proposto" }], decs, "2026-10-12");
  assert.ok(pic.some((p) => /2 decisioni aperte consumano la stessa risorsa, tempo/.test(p)) && pic.some((p) => /aspetta la tua conferma/.test(p)), JSON.stringify(pic));
  console.log("contesto: import, revisione, pertinenza, privacy, pesi, quadro ok");
}
{
  // 64. pertinenza per ambiti e relazioni, non solo parole: i casi del test di Danilo
  const C = await import("../lib/context.ts");
  const mk = (k: string, t: string, extra = {}) => ({ id: t.slice(0, 8), k, t, layer: "fase", st: "confermato", ...extra }) as import("../lib/context.ts").CtxItem;
  const items = [
    mk("vincolo", "Lo studio di mia moglie deve restare vicino a casa e all'asilo di nostro figlio"),
    mk("fatto", "A Roma non pago affitto"),
    mk("progetto", "Decision OS: piattaforma personale per decidere"),
    mk("progetto", "FleetUnit, piattaforma per flotte in sviluppo"),
    mk("risorsa", "Liquidità disponibile", { res: "cash0", n: 23000 }),
    mk("regola", "Non scendo mai sotto 10.000 € di risparmi", { global: true }),
  ];
  const q = (name: string, descr: string, tipo?: string) => C.rankCtx(items, { name, descr, model: { tipo, criteria: [], constraints: [], options: [] } as never });
  const fu = q("Quanto investire in FleetUnit?", "Quanto capitale mettere nello sviluppo di FleetUnit", "progetto").map((h) => h.x.t);
  assert.ok(fu.some((t) => /FleetUnit/.test(t)) && fu.some((t) => /Liquidit/.test(t)) && !fu.some((t) => /asilo|Decision OS|non pago affitto/.test(t)), JSON.stringify(fu));
  const mi = q("Accetto un lavoro a Milano?", "Mi offrono un posto da operations manager a Milano", "lavoro");
  assert.ok(mi.some((h) => /non pago affitto/.test(h.x.t)) && mi.some((h) => /asilo/.test(h.x.t)), JSON.stringify(mi.map((h) => [h.via, h.x.t])));
  const sw = q("Quale app per le note", "Scelgo un'app per prendere appunti");
  assert.ok(sw.length === 1 && sw[0].via === "globale", JSON.stringify(sw.map((h) => h.x.t)));   // solo la regola globale
  // ambiti scelti da te prevalgono su quelli riconosciuti dal testo
  const it2 = [mk("vincolo", "Lo studio di mia moglie deve restare vicino a casa", { scope: ["progetti"] })];
  assert.equal(C.rankCtx(it2, { name: "Quanto investire in FleetUnit?", descr: "capitale", model: { tipo: "progetto", criteria: [], constraints: [], options: [] } as never }).length, 1);
  console.log("contesto: pertinenza per ambiti, relazioni e regole globali ok");
}
{
  // 65. fotografia del contesto alla scelta e aggiornamenti proposti dalla decisione presa (mai automatici)
  const C = await import("../lib/context.ts");
  const items: import("../lib/context.ts").CtxItem[] = [
    { id: "d1", k: "decisione", t: "Offerta di lavoro a Ibiza", layer: "fase", st: "confermato" },
    { id: "v1", k: "vincolo", t: "Non posso restare senza reddito oltre 6 mesi", layer: "fase", st: "confermato" },
  ];
  const dec: Decision = { id: "x", name: "Lavoro a Ibiza", status: "aperta", imp: 1, model: { tipo: "lavoro", criteria: [], constraints: [], options: [{ id: "a", name: "Accetto Ibiza", s: {}, impacts: [{ r: "hours_w", v: -30 }, { r: "cash_m", v: [500, 900, 1200] }] }] } };
  const sn = C.ctxSnapshot(items, dec);
  assert.ok(sn.n === 2 && sn.t.some((t) => /Ibiza/.test(t)) && sn.h.length >= 5);
  assert.notEqual(C.ctxSnapshot([...items, { id: "n", k: "fatto", t: "Nuovo", layer: "fase", st: "confermato" }], dec).h, sn.h);   // il contesto è cambiato: versione diversa
  const ups = C.contextUpdates(items, dec, dec.model.options[0], { hours_w: 40, cash_m: 200 }, "2026-10-12");
  assert.ok(ups.some((u) => u.kind === "supera" && u.item === "d1") && ups.some((u) => u.kind === "nuovo" && u.item.res === "hours_w" && u.item.n === 10) && ups.some((u) => u.kind === "nuovo" && u.item.n === 1100), JSON.stringify(ups.map((u) => u.t)));
  ups.find((u) => u.id === "m")!.on = false;
  const after = C.applyUpdates(items, ups);
  assert.ok(after.find((x) => x.id === "d1")!.st === "superato" && after.some((x) => x.res === "hours_w") && !after.some((x) => x.res === "cash_m") && after.length === 4);
  console.log("contesto: fotografia alla scelta e aggiornamenti proposti ok");
}
{
  // 66. consenso in un punto solo, scadenze, grafo (influenza e collegamenti), contesto congelato
  const C = await import("../lib/context.ts");
  const AI = await import("../lib/ai.ts");
  const mk = (id: string, k: string, t: string, extra = {}) => ({ id, k, t, layer: "fase", st: "confermato", ...extra }) as import("../lib/context.ts").CtxItem;
  const dec: Decision = { id: "x", name: "Accetto un lavoro a Milano?", descr: "Offerta da operations manager a Milano", status: "aperta", imp: 1, model: { tipo: "lavoro", criteria: [{ id: "f", name: "Famiglia unita", w: 0, imp: 3, kind: "g" }], constraints: [], options: [] } };
  const items = [
    mk("v", "valore", "Famiglia unita prima di tutto", { layer: "stabile", imp: 5 }),
    mk("o", "vincolo", "Offerta di Ibiza valida", { until: "2026-09-01" }),   // scaduto
    mk("s", "progetto", "Studio di onicotecnica da zero clienti", { links: [{ to: "v", rel: "riguarda" }] }),
    mk("p", "progetto", "SigmaOS", { affects: ["luogo", "lavoro"] as never }),
  ];
  // consenso: senza, nulla; con, contesto e cxok; il payload di compact segue
  assert.deepEqual(C.aiContext(items, dec, { consent: false, eco: false, profile: { lavoro: "x" } }), {});
  const on = C.aiContext(items, dec, { consent: true, eco: false, profile: { lavoro: "area manager" } });
  assert.ok(on.cxok && on.ctx === "lavoro: area manager" && on.cx!.some((l) => /Famiglia/.test(l)));
  const off = JSON.stringify(AI.compact(dec, undefined, { eco: false, ...C.aiContext(items, dec, { consent: false, eco: false }) }));
  assert.ok(!/Famiglia unita prima|cxok/.test(off));
  // scaduto: fuori da pertinenza, AI e pesi, ma segnalato nel quadro
  const h = C.rankCtx(items, dec, [], "2026-10-12");
  assert.ok(!h.some((y) => y.x.id === "o"), JSON.stringify(h.map((y) => y.x.t)));
  assert.ok(!C.critHints([mk("e", "valore", "Famiglia unita", { imp: 5, until: "2026-01-01" })], dec.model.criteria).length);
  assert.ok(C.contextPicture(items, [], "2026-10-12").some((p) => /scadut.*non .*più usat/.test(p)));
  // grafo: lo studio è collegato al valore pertinente; SigmaOS influenza dove vivi e il lavoro
  const st = h.find((y) => y.x.id === "s"), sg = h.find((y) => y.x.id === "p");
  assert.ok(st && st.via === "collegato" && /Famiglia/.test(st.from!) && sg, JSON.stringify(h.map((y) => [y.via, y.x.t])));
  // contesto congelato: versione e solo gli elementi usati, con il motivo
  const fz = C.ctxFreeze(items, dec);
  assert.ok(fz.version === C.ctxVersion(items) && fz.items.length === h.length && fz.items.every((i) => i.via) && !fz.items.some((i) => /Ibiza/.test(i.t)));
  assert.notEqual(C.ctxVersion(items), C.ctxVersion(items.map((x) => (x.id === "v" ? { ...x, t: "Famiglia" } : x))));
  console.log("contesto: consenso unico, scadenze, grafo, contesto congelato ok");
}
