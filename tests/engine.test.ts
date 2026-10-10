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
assert.deepEqual(res[0].rows.find((r) => r.id === "A1")!.excluded, ["Famiglia sostenibile: 30 < 40"]);
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
console.log("engine: 7/7 ok");
