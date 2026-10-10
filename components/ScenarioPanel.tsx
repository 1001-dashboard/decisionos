"use client";
import { useMemo, useState } from "react";
import { analyzeDecision, cashSeries, combos, eur, fmt, SCEN, type Decision, type Dep, type Resources, type Rule, type Scen } from "@/lib/engine";
import { LineChart, Legend, PAL } from "./charts";

const H = [3, 12, 24, 60];
const HL: Record<number, string> = { 3: "3 mesi", 12: "12 mesi", 24: "24 mesi", 60: "5 anni" };
const SL: Record<Scen, string> = { sfavorevole: "Sfavorevole", centrale: "Centrale", favorevole: "Favorevole" };

export default function ScenarioPanel({ decs, deps, resources, rules, h0 = 24, max = 4 }: {
  decs: Decision[]; deps: Dep[]; resources: Resources; rules: Rule[]; h0?: number; max?: number;
}) {
  const [h, setH] = useState(H.includes(h0) ? h0 : 24);
  const [sc, setSc] = useState<Scen>("centrale");
  const plans = useMemo(() => {
    const res = decs.map(analyzeDecision);
    return combos(decs, res, deps, resources, rules, h);
  }, [decs, deps, resources, rules, h]);
  const ok = plans.filter((p) => !p.excluded.length).slice(0, max);
  const cashRule = rules.find((r) => r.r === "cash_end" && r.min != null);
  if (!plans.length) return <div className="empty">Servono decisioni con alternative ammissibili e impatti sulle risorse.</div>;
  return (
    <div className="stack">
      <div className="row between">
        <div className="seg">{H.map((x) => <button key={x} className={x === h ? "on" : ""} onClick={() => setH(x)}>{HL[x]}</button>)}</div>
        <div className="seg">{SCEN.map((x) => <button key={x} className={x === sc ? "on" : ""} onClick={() => setSc(x)}>{SL[x]}</button>)}</div>
      </div>
      {ok.length ? (
        <>
          <Legend items={ok.map((p, i) => ({ name: p.names.join(" + "), color: PAL[i % PAL.length] }))} />
          <LineChart
            series={ok.map((p, i) => ({ name: p.key, color: PAL[i % PAL.length], data: cashSeries(p.scen[sc].res, h) }))}
            threshold={cashRule ? { v: cashRule.min!, label: `${cashRule.name} ${eur(cashRule.min!)}` } : undefined}
            xLabel={(i) => (i === 0 ? "oggi" : `${i}m`)} yFmt={(n) => fmt(n / 1000) + "k"}
          />
        </>
      ) : <div className="note bad">Nessun piano rispetta vincoli e collegamenti in scenario centrale.</div>}
      <div className="tablewrap">
        <table className="t num">
          <thead><tr><th>Piano</th><th>Fabbisogno iniziale</th><th>Flusso/mese</th><th>Liquidità a {HL[h]}</th><th>Autonomia</th><th>Ore libere</th><th>Stato</th></tr></thead>
          <tbody>
            {plans.slice(0, 12).map((p) => {
              const r = p.scen[sc].res, viol = p.scen[sc].viol;
              const need = (resources.cash0 ?? 0) - (r.cash0 ?? 0);
              return (
                <tr key={p.key} style={{ opacity: p.excluded.length ? 0.55 : 1 }}>
                  <td><strong>{p.names.join(" + ")}</strong></td>
                  <td>{need > 0 ? eur(need) : "—"}</td>
                  <td>{eur(r.cash_m ?? 0)}</td>
                  <td>{eur(r.cash_end ?? 0)}</td>
                  <td>{r.autonomia_mesi === Infinity ? "∞" : `${fmt(r.autonomia_mesi)} mesi`}</td>
                  <td>{fmt(r.hours_w ?? 0)} h</td>
                  <td>{p.excluded.length ? <span className="pill bad" title={p.excluded.join("; ")}>escluso</span>
                    : viol.length ? <span className="pill warn" title={viol.join("; ")}>viola: {viol[0].split(":")[0]}</span>
                    : <span className="pill ok">regge</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>Proiezione lineare a flusso costante. Gli scenari sono ipotesi esplicite, non probabilità.</p>
    </div>
  );
}
