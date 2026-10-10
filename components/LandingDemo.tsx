"use client";
import { useMemo, useState } from "react";
import { SlidersHorizontal, Scale, TrendingUp, FileText, RotateCcw, Link2 } from "lucide-react";
import { analyzeDecision, combos, fmt, eur, type Decision } from "@/lib/engine";
import { demoDecisions, demoDeps, demoResources, demoRules } from "@/lib/demo";
import { buildReport } from "@/lib/report";
import { ScoreBars } from "./charts";
import ScenarioPanel from "./ScenarioPanel";
import ReportView from "./ReportView";

const TABS = [
  { k: "cmp", l: "Comparatore", i: <Scale size={16} /> },
  { k: "con", l: "Connessioni", i: <Link2 size={16} /> },
  { k: "sce", l: "Scenari", i: <TrendingUp size={16} /> },
  { k: "rep", l: "Report", i: <FileText size={16} /> },
];
const REL = { F: ["ok", "verificato"], D: ["info", "dichiarato"], S: ["warn", "stima"], "?": ["bad", "mancante"] } as const;

export default function LandingDemo() {
  const base = demoDecisions[0].model.criteria;
  const [w, setW] = useState<Record<string, number>>(Object.fromEntries(base.map((c) => [c.id, c.w])));
  const [tab, setTab] = useState("cmp");
  const decs: Decision[] = useMemo(
    () => demoDecisions.map((d, i) => (i ? d : { ...d, model: { ...d.model, criteria: d.model.criteria.map((c) => ({ ...c, w: w[c.id] })) } })),
    [w],
  );
  const res = useMemo(() => decs.map(analyzeDecision), [decs]);
  const cmb = useMemo(() => combos(decs, res, demoDeps, demoResources, demoRules, 24), [decs, res]);
  const rep = useMemo(() => buildReport(decs, res, cmb, demoRules, 24), [decs, res, cmb]);
  const A = res[0];
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  const nm = (id: string | null) => A.rows.find((r) => r.id === id)?.name;

  return (
    <div className="grid" style={{ gridTemplateColumns: "minmax(260px, 340px) 1fr", alignItems: "start" }} id="demo-grid">
      <style>{`@media (max-width: 900px){#demo-grid{grid-template-columns:1fr!important}}`}</style>
      <div className="card stack">
        <div className="row between">
          <h3 style={{ margin: 0 }}><SlidersHorizontal size={18} /> I tuoi pesi</h3>
          <button className="iconbtn" title="Ripristina" onClick={() => setW(Object.fromEntries(base.map((c) => [c.id, c.w])))}><RotateCcw size={16} /></button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>Decisione «Lavoro». Muovi un peso: tutto si ricalcola, anche i piani combinati.</p>
        {base.map((c) => (
          <div key={c.id}>
            <div className="row between" style={{ fontSize: 14 }}><span>{c.name}</span><strong className="num">{w[c.id]}%</strong></div>
            <input type="range" min={0} max={60} value={w[c.id]} onChange={(e) => setW({ ...w, [c.id]: +e.target.value })} aria-label={c.name} />
          </div>
        ))}
        <div className={`note ${sum === 100 ? "" : "warn"}`} style={{ fontSize: 13 }}>
          Somma pesi: <strong>{sum}</strong>{sum === 100 ? "" : " (normalizzata sul totale)"}
        </div>
        <hr style={{ margin: 0 }} />
        <h3 style={{ margin: 0 }}>Su cosa stai ragionando</h3>
        {demoDecisions[0].model.assumptions!.map((a) => (
          <div key={a.id} className="row between" style={{ fontSize: 13, flexWrap: "nowrap" }}>
            <span>{a.t}</span><span className={`pill ${REL[a.rel][0]}`}>{REL[a.rel][1]}</span>
          </div>
        ))}
      </div>

      <div className="card stack" style={{ minWidth: 0 }}>
        <div className="row between">
          <div className="seg">{TABS.map((t) => <button key={t.k} className={tab === t.k ? "on" : ""} onClick={() => setTab(t.k)}><span className="row" style={{ gap: 6 }}>{t.i}{t.l}</span></button>)}</div>
          <span className="demo-tag">dati dimostrativi</span>
        </div>

        {tab === "cmp" && (
          <>
            <ScoreBars rows={A.rows} />
            <div className="grid g3">
              <div className="kpi"><div className="l">Margine 1ª – 2ª</div><div className="v num">{fmt(A.margin ?? 0)} pt</div></div>
              <div className="kpi"><div className="l">Robustezza</div><div className="v" style={{ color: A.tie ? "var(--red)" : A.fragile.length ? "#b8741a" : "var(--green)" }}>{A.tie ? "Parità" : A.fragile.length ? "Fragile" : "Robusta"}</div></div>
              <div className="kpi"><div className="l">Vincolo «Famiglia ≥ 40»</div><div className="v">{A.rows.filter((r) => r.excluded.length).length ? "Esclude" : "Rispettato"}</div></div>
            </div>
            {A.fragile.length ? (
              <div className="note warn">Basta poco per ribaltare: {A.fragile.map((s) => `${s.name} ${s.delta! > 0 ? "+" : ""}${s.delta} pt → ${nm(s.newTop)}`).join(" · ")}</div>
            ) : <div className="note">Nessun singolo peso cambia la prima scelta entro ±10 punti.</div>}
            {A.warn.map((x) => <div key={x} className="note warn">{x}</div>)}
            <details>
              <summary>Ricostruisci ogni punteggio</summary>
              <div className="tablewrap" style={{ marginTop: 10 }}>
                <table className="t num">
                  <thead><tr><th>Alternativa</th><th>Criterio</th><th>Valore</th><th>Peso</th><th>Contributo</th><th>Motivazione</th></tr></thead>
                  <tbody>
                    {A.rows.flatMap((r) => r.detail.map((d, i) => (
                      <tr key={r.id + d.crit}>
                        <td>{i ? "" : <strong>{r.name}</strong>}</td><td>{d.name}</td><td>{d.s ?? "—"}</td><td>{d.w}%</td><td>{d.contrib ?? "—"}</td>
                        <td>{d.meta?.why ?? ""} {d.meta?.rel ? <span className={`pill ${REL[d.meta.rel][0]}`}>{REL[d.meta.rel][1]}</span> : null}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}

        {tab === "con" && (
          <>
            <p className="muted" style={{ margin: 0 }}>Tre alternative di lavoro × tre di FleetUnit = 9 piani. Collegamenti confermati, risorse condivise, costi contati una sola volta.</p>
            <div className="tablewrap">
              <table className="t num">
                <thead><tr><th>Piano</th><th>Punteggio</th><th>Liquidità 24m (sfav / centr / fav)</th><th>Ore libere</th><th>Stato</th></tr></thead>
                <tbody>
                  {cmb.map((c) => (
                    <tr key={c.key} style={{ opacity: c.excluded.length ? 0.55 : 1 }}>
                      <td><strong>{c.names.join(" + ")}</strong></td>
                      <td>{fmt(c.score)}</td>
                      <td>{(["sfavorevole", "centrale", "favorevole"] as const).map((s) => eur(c.scen[s].res.cash_end ?? 0)).join(" / ")}</td>
                      <td>{fmt(c.scen.centrale.res.hours_w ?? 0)} h</td>
                      <td>{c.excluded.length ? <span className="pill bad">{c.excluded[0].replace("[centrale] ", "")}</span> : c.fragileSfav ? <span className="pill warn">a rischio se sfavorevole</span> : <span className="pill ok">ammissibile</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "sce" && <ScenarioPanel decs={decs} deps={demoDeps} resources={demoResources} rules={demoRules} />}
        {tab === "rep" && <ReportView sections={rep} />}
      </div>
    </div>
  );
}
