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
}
