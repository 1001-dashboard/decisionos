"use client";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { useAnalysis } from "@/components/useAnalysis";
import { Top } from "@/components/Shell";
import ScenarioPanel from "@/components/ScenarioPanel";
import { cashBreakpoint, eur } from "@/lib/engine";

export default function Scenari() {
  const { decisions, deps, profile } = useWs();
  const open = decisions.filter((d) => d.status === "aperta");
  const [sel, setSel] = useState<string[]>(() => [...open].sort((a, b) => b.imp - a.imp).slice(0, 3).map((d) => d.id));
  const { pool, cmb } = useAnalysis(sel);
  const ok = useMemo(() => cmb.filter((c) => !c.excluded.length).slice(0, 4), [cmb]);

  return (
    <>
      <Top t="Scenari" s="Proiezioni economiche e di tempo nel tempo" />
      <div className="card row" style={{ marginBottom: 16 }}>
        {open.map((d) => (
          <label key={d.id} className={`pill ${sel.includes(d.id) ? "teal" : "info"}`} style={{ cursor: "pointer", padding: ".4em .8em" }}>
            <input type="checkbox" checked={sel.includes(d.id)} disabled={!sel.includes(d.id) && sel.length >= 3}
              onChange={(x) => setSel(x.target.checked ? [...sel, d.id] : sel.filter((s) => s !== d.id))} /> {d.name}
          </label>
        ))}
        {!open.length && <small>Nessuna decisione aperta.</small>}
      </div>
      <div className="card"><ScenarioPanel key={sel.join()} decs={pool} deps={deps} resources={profile.resources} rules={profile.rules} h0={profile.horizon} /></div>

      {ok.length ? (
        <div className="card stack" style={{ marginTop: 16 }}>
          <h3><AlertTriangle size={18} /> Quando cambiare piano</h3>
          {ok.map((c) => {
            const bp = cashBreakpoint({ cash0: c.scen.centrale.res.cash0 }, profile.rules, profile.horizon);
            const f = c.scen.sfavorevole.viol;
            return (
              <div key={c.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <strong>{c.names.join(" + ")}</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, fontSize: 14 }}>
                  {bp != null && <li>Rivedi se il flusso netto scende sotto <strong>{eur(bp)}/mese</strong> (oggi, scenario centrale: {eur(c.scen.centrale.res.cash_m ?? 0)}).</li>}
                  {f.length ? <li>In scenario sfavorevole: {f.join("; ")}.</li> : <li>Regge anche in scenario sfavorevole.</li>}
                  {(c.scen.centrale.res.hours_w ?? 0) < 5 && <li>Margine di tempo quasi nullo: {c.scen.centrale.res.hours_w} h/settimana.</li>}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Nessuna probabilità attribuita agli scenari: intervalli e ipotesi esplicite. Simulazioni Monte Carlo solo quando ci saranno dati affidabili.</p>
    </>
  );
}
