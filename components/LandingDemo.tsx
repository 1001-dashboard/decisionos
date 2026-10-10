"use client";
import { useMemo, useState } from "react";
import { Award, Scale, Link2, TrendingUp, RotateCcw, CheckCircle2, AlertCircle, TrendingDown, ShieldAlert, Lightbulb, Brain } from "lucide-react";
import {
  analyzeDecision, crossEffects, normalize, solidity, tradeoff, turningPoints, biasChecks, fmt, eur, LEVELS, levelOf, type Decision,
} from "@/lib/engine";
import { exampleDecision, demoProject, landingResources, landingRules } from "@/lib/demo";
import { ScoreBars } from "./charts";
import ScenarioPanel from "./ScenarioPanel";

const TABS = [
  { k: "res", l: "Risultato", i: <Award size={16} /> },
  { k: "bas", l: "Basi", i: <Scale size={16} /> },
  { k: "eff", l: "Effetti", i: <Link2 size={16} /> },
  { k: "sce", l: "Scenari", i: <TrendingUp size={16} /> },
];
const SRC: Record<string, [string, string]> = { F: ["ok", "certo"], D: ["info", "detto"], S: ["warn", "stima"] };

export default function LandingDemo() {
  const base = exampleDecision.model.criteria;
  const init = Object.fromEntries(base.map((c) => [c.id, c.imp ?? 3]));
  const [imp, setImp] = useState<Record<string, number>>(init);
  const [tab, setTab] = useState("res");
  const [sel, setSel] = useState("");
  const ex: Decision = useMemo(() => ({ ...exampleDecision, model: { ...exampleDecision.model, criteria: base.map((c) => ({ ...c, imp: imp[c.id] })) } }), [imp, base]);
  const nm = useMemo(() => normalize(ex.model), [ex]);
  const res = useMemo(() => analyzeDecision(ex), [ex]);
  const tr = useMemo(() => tradeoff(ex, res), [ex, res]);
  const so = useMemo(() => solidity(ex, res), [ex, res]);
  const turns = useMemo(() => turningPoints(ex, res), [ex, res]);
  const bias = useMemo(() => biasChecks(ex, res), [ex, res]);
  const ok = res.rows.filter((r) => !r.excluded.length);
  const top = ok[0];
  const opt = sel || top?.id || ex.model.options[0].id;
  const cross = crossEffects(opt, ex, [demoProject], [], landingResources, landingRules, 12);
  const mg = res.margin ?? 0;
  const tone = mg < 3 || res.fragile.length ? "warn" : "ok";

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(260px, 330px) 1fr", alignItems: "start" }} id="demo-grid">
      <style>{`@media (max-width: 900px){#demo-grid{grid-template-columns:1fr!important}}`}</style>
      <div className="card stack">
        <div className="row between">
          <h3 style={{ margin: 0 }}>Quanto conta per te?</h3>
          <button className="iconbtn" title="Ripristina" onClick={() => setImp(init)}><RotateCcw size={16} /></button>
        </div>
        <small>Cambia l&apos;importanza da 1 a 5: verdetto, soglie ed effetti si ricalcolano.</small>
        {nm.criteria.map((c) => (
          <div key={c.id}>
            <div className="row between" style={{ fontSize: 14 }}><span>{c.name}</span><small>pesa il <b>{c.w}%</b></small></div>
            <div className="dots">{[1, 2, 3, 4, 5].map((i) => <button key={i} className={imp[c.id] >= i ? "on" : ""} onClick={() => setImp({ ...imp, [c.id]: i })} aria-label={`${c.name} importanza ${i}`}>{i}</button>)}</div>
          </div>
        ))}
        <hr style={{ margin: 0 }} />
        <h3 style={{ margin: 0 }}>Le alternative</h3>
        {ex.model.options.map((o) => (
          <div key={o.id} style={{ fontSize: 13 }}>
            <b>{o.name}</b>
            {(o.pro?.length || o.con?.length) ? <div><span style={{ color: "var(--green)" }}>+ {(o.pro ?? []).join(", ")}</span>{o.con?.length ? <span style={{ color: "#b8741a" }}> · − {o.con.join(", ")}</span> : null}</div> : null}
            <div className="muted">
              {nm.criteria.map((c) => c.kind === "num" ? `${fmt(o.raw?.[c.id] ?? 0)} ${c.unit}` : `${c.name.split(" ")[0]} ${LEVELS[levelOf(o.s[c.id] ?? 0)].toLowerCase()}`).join(" · ")}
            </div>
          </div>
        ))}
        <small>Requisito: almeno 300 €/mese. Situazione di partenza: {eur(landingResources.cash0)} di risparmi, {landingResources.hours_w} ore libere a settimana.</small>
      </div>

      <div className="card stack" style={{ minWidth: 0 }}>
        <div className="row between">
          <div className="seg">{TABS.map((t) => <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}><span className="row" style={{ gap: 6 }}>{t.i}{t.l}</span></button>)}</div>
          <span className="demo-tag">dati dimostrativi</span>
        </div>

        {tab === "res" && top && (
          <>
            <div className={`verdict ${tone}`} style={{ padding: 16 }}>
              <div className="vi">{tone === "ok" ? <CheckCircle2 size={24} /> : <AlertCircle size={24} />}</div>
              <div><h3 style={{ margin: 0 }}>Con queste priorità prevale {top.name}.</h3>
                <p style={{ margin: "4px 0 0", fontSize: 14 }}>{ok[1] ? (mg < 3 ? `Quasi alla pari con ${ok[1].name}.` : mg < 10 ? `Vantaggio contenuto su ${ok[1].name}.` : `Vantaggio netto su ${ok[1].name}.`) : "È l'unica che rispetta i requisiti."}</p></div>
            </div>
            <ScoreBars rows={res.rows} reasons={false} />
            {tr && (
              <div className="grid g3" style={{ gap: 10 }}>
                <div className="trade g card" style={{ padding: 12 }}><b className="row" style={{ gap: 6 }}><TrendingUp size={16} /> Guadagni</b>{tr.gains.length ? <ul className="clean" style={{ fontSize: 13 }}>{tr.gains.map((x) => <li key={x}>{x}</li>)}</ul> : <small>Nessun vantaggio netto.</small>}</div>
                <div className="trade l card" style={{ padding: 12 }}><b className="row" style={{ gap: 6 }}><TrendingDown size={16} /> Rinunci a</b>{tr.losses.length ? <ul className="clean" style={{ fontSize: 13 }}>{tr.losses.map((x) => <li key={x}>{x}</li>)}</ul> : <small>Nulla rispetto a {tr.b}.</small>}</div>
                <div className="trade r card" style={{ padding: 12 }}><b className="row" style={{ gap: 6 }}><ShieldAlert size={16} /> Rischi</b><ul className="clean" style={{ fontSize: 13 }}>{tr.risks.slice(0, 3).map((x) => <li key={x}>{x}</li>)}</ul></div>
              </div>
            )}
            {bias.length > 0 && <div className="note warn"><b className="row" style={{ gap: 6 }}><Brain size={15} /> Testa o pancia?</b>{bias.map((b) => <div key={b.k} style={{ marginTop: 4 }}>{b.t}</div>)}</div>}
            {turns.length > 0 && <div className="note"><b className="row" style={{ gap: 6 }}><Lightbulb size={15} /> Cosa ti farebbe cambiare idea</b>{turns.map((t) => <div key={t.crit} style={{ marginTop: 4 }}>{t.text}</div>)}</div>}
          </>
        )}

        {tab === "bas" && so && (
          <>
            <h3 style={{ margin: 0 }}>Su cosa poggia il risultato</h3>
            <div className="solbar"><span className="f" style={{ width: `${100 - so.estShare - so.unkShare}%` }} /><span className="s" style={{ width: `${so.estShare}%` }} /><span className="u" style={{ width: `${so.unkShare}%` }} /></div>
            <small>Punteggio di {top?.name}: {100 - so.estShare - so.unkShare}% dati certi o dichiarati · {so.estShare}% stime · {so.unkShare}% senza fonte</small>
            <div className={`note ${so.tested && !so.holds ? "bad" : ""}`}>
              {!so.tested ? "Nessuna stima da mettere alla prova." : so.holds ? `Prova superata: con le stime sbagliate del 20% a sfavore di ${top?.name}, resta prima.` : `Con le stime sbagliate del 20% passerebbe in testa ${so.newTop}: verifica prima di decidere.`}
            </div>
            <div className="tablewrap"><table className="t"><thead><tr><th>Alternativa</th><th>Dato</th><th>Valore</th><th>Fonte</th></tr></thead>
              <tbody>{ex.model.options.flatMap((o) => nm.criteria.map((c, i) => {
                const rel = o.m?.[c.id]?.rel;
                return (
                  <tr key={o.id + c.id}><td>{i ? "" : <b>{o.name}</b>}</td><td>{c.name}</td>
                    <td>{c.kind === "num" ? `${fmt(o.raw?.[c.id] ?? 0)} ${c.unit}` : LEVELS[levelOf(o.s[c.id] ?? 0)]}</td>
                    <td>{rel && SRC[rel] ? <span className={`pill ${SRC[rel][0]}`}>{SRC[rel][1]}</span> : <span className="muted">—</span>}</td></tr>
                );
              }))}</tbody></table></div>
            <small>Da chiarire: {ex.model.assumptions!.map((a) => a.t).join(" · ")}</small>
          </>
        )}

        {tab === "eff" && (
          <>
            <div className="row between">
              <small>Un&apos;altra decisione aperta: un progetto personale. Conflitti di ore e soldi rilevati in automatico.</small>
              <select style={{ width: "auto" }} value={opt} onChange={(e) => setSel(e.target.value)} aria-label="Se scelgo">
                {ex.model.options.map((o) => <option key={o.id} value={o.id}>Se scelgo: {o.name}</option>)}
              </select>
            </div>
            {cross.map((cx) => (
              <div key={cx.dec} className="xdec">
                <b>{cx.name}</b>
                {cx.rows.map((r) => (
                  <div key={r.id} className={`xrow ${r.ok ? "ok" : "no"}`}>
                    <span className={`pill ${r.ok ? "ok" : "bad"}`}>{r.ok ? "resta possibile" : "diventa impossibile"}</span>
                    <span className="xn">{r.name}</span>
                    <small className="xw">{r.ok ? `ti restano ${fmt(r.hours ?? 0)} h/settimana` : r.why.join("; ")}</small>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {tab === "sce" && <ScenarioPanel decs={[ex, demoProject]} deps={[]} resources={landingResources} rules={landingRules} h0={12} />}
      </div>
    </div>
  );
}
