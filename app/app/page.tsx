"use client";
import Link from "next/link";
import { Plus, Wallet, Clock, AlertTriangle, CalendarClock, GitFork, ArrowRight, ShieldCheck } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { useAnalysis } from "@/components/useAnalysis";
import { Top } from "@/components/Shell";
import { eur, fmt, readiness, RES_LABEL } from "@/lib/engine";
import ReportView from "@/components/ReportView";

export default function Dashboard() {
  const { profile, outcomes, decisions } = useWs();
  const { open, all, cmb, rep } = useAnalysis();
  const R = profile.resources;
  const verify = open.reduce((a, d) => a + (d.model.assumptions ?? []).filter((x) => x.rel === "?" || x.aff === "bassa").length
    + (all.get(d.id)?.rows.filter((r) => r.missing.length).length ?? 0), 0);
  const today = new Date().toISOString().slice(0, 10);
  const due = [
    ...open.filter((d) => d.due).map((d) => ({ t: d.name, d: d.due!, k: "Scadenza decisione", h: `/app/decisioni/${d.id}` })),
    ...outcomes.filter((o) => o.review_at && !o.observed).map((o) => ({ t: o.decision_name, d: o.review_at!, k: "Revisione esito", h: "/app/registro" })),
  ].sort((a, b) => a.d.localeCompare(b.d)).slice(0, 5);
  const auton = (R.cash_m ?? 0) >= 0 ? "∞" : fmt((R.cash0 ?? 0) / -(R.cash_m ?? 1));
  const best = cmb.find((c) => !c.excluded.length);
  const noBase = !(R.cash0 || R.cash_m || R.hours_w);

  return (
    <>
      <Top t="Panoramica" s="La tua situazione e le decisioni aperte">
        <Link href="/app/decisioni/nuova" className="btn pri"><Plus size={16} /> Nuova decisione</Link>
      </Top>

      {(noBase || !decisions.length) && (
        <div className="card stack" style={{ marginBottom: 16, background: "var(--navy)", color: "#d5e4f0", border: 0 }}>
          <h3 style={{ color: "#fff", margin: 0 }}>Come iniziare</h3>
          <div className="guide">
            <Link href="/app/impostazioni" className="g" style={{ color: "inherit", textDecoration: "none" }}><span className="n" style={{ background: noBase ? "var(--orange)" : "var(--green)" }}>{noBase ? 1 : "✓"}</span><span><b style={{ color: "#fff" }}>La tua situazione</b><br /><small style={{ color: "#a9c3d8" }}>Risparmi, quanto ti resta al mese, ore libere. Due minuti.</small></span></Link>
            <Link href="/app/decisioni/nuova" className="g" style={{ color: "inherit", textDecoration: "none" }}><span className="n" style={{ background: decisions.length ? "var(--green)" : "var(--orange)" }}>{decisions.length ? "✓" : 2}</span><span><b style={{ color: "#fff" }}>Racconta una decisione</b><br /><small style={{ color: "#a9c3d8" }}>Con parole tue: l&apos;Analista prepara la scheda.</small></span></Link>
            <div className="g"><span className="n">3</span><span><b style={{ color: "#fff" }}>Segui i 5 passi</b><br /><small style={{ color: "#a9c3d8" }}>Alternative, cosa conta, valutazione, soldi, risultato.</small></span></div>
          </div>
        </div>
      )}

      <div className="grid g4">
        <div className="card kpi"><div className="row between"><span className="l">Decisioni aperte</span><span className="iconwrap n" style={{ width: 32, height: 32 }}><GitFork size={16} /></span></div><div className="v">{open.length}</div><small>{decisions.length - open.length} chiuse o archiviate</small></div>
        <div className="card kpi"><div className="row between"><span className="l">Liquidità</span><span className="iconwrap t" style={{ width: 32, height: 32 }}><Wallet size={16} /></span></div><div className="v num">{eur(R.cash0 ?? 0)}</div><small>flusso {eur(R.cash_m ?? 0)}/mese · autonomia {auton === "∞" ? "illimitata" : `${auton} mesi`}</small></div>
        <div className="card kpi"><div className="row between"><span className="l">Tempo libero</span><span className="iconwrap" style={{ width: 32, height: 32 }}><Clock size={16} /></span></div><div className="v num">{fmt(R.hours_w ?? 0)} h</div><small>a settimana, prima delle scelte</small></div>
        <div className="card kpi"><div className="row between"><span className="l">Dati da verificare</span><span className="iconwrap o" style={{ width: 32, height: 32 }}><AlertTriangle size={16} /></span></div><div className="v">{verify}</div><small>ipotesi deboli o valori mancanti</small></div>
      </div>

      <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
        <div className="card stack">
          <h3><GitFork size={18} /> Decisioni aperte</h3>
          {!open.length && <div className="empty">Nessuna decisione aperta.<br /><Link href="/app/decisioni/nuova" className="btn teal" style={{ marginTop: 12 }}><Plus size={16} /> Descrivi la prima</Link></div>}
          {open.map((d) => {
            const a = all.get(d.id)!;
            const t = a.rows.find((r) => !r.excluded.length);
            return (
              <Link key={d.id} href={`/app/decisioni/${d.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                  <div><strong>{d.name}</strong><div className="muted" style={{ fontSize: 13 }}>{d.model.options.length} alternative · {d.model.criteria.length} criteri{d.due ? ` · entro ${new Date(d.due).toLocaleDateString("it-IT")}` : ""}</div></div>
                  <div className="row" style={{ gap: 6 }}>
                    {(() => {
                      const rd = readiness(d, a, profile.resources, profile.rules);
                      if (!t || rd.state === "nessuna") return <span className="pill bad">nessuna strada regge</span>;
                      if (rd.state === "vuota") return <span className="pill info">da impostare</span>;
                      return rd.state === "pronta" ? <span className="pill ok">pronta: {t.name}</span> : <span className="pill warn">non pronta: {rd.open.length} da verificare</span>;
                    })()}
                    <ArrowRight size={16} className="muted" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="stack">
          <div className="card stack">
            <h3><CalendarClock size={18} /> Scadenze e revisioni</h3>
            {due.length ? due.map((x, i) => (
              <Link key={i} href={x.h} className="row between" style={{ textDecoration: "none", color: "inherit" }}>
                <span><strong>{x.t}</strong> <small>· {x.k}</small></span>
                <span className={`pill ${x.d < today ? "bad" : "info"}`}>{new Date(x.d).toLocaleDateString("it-IT")}</span>
              </Link>
            )) : <small>Nessuna scadenza impostata.</small>}
          </div>
          <div className="card stack">
            <h3><ShieldCheck size={18} /> Vincoli sulle risorse</h3>
            {profile.rules.map((r) => <div key={r.id} className="row between" style={{ fontSize: 14 }}><span>{r.name}</span><span className="muted">{RES_LABEL[r.r] ?? r.r} {r.min != null ? `≥ ${fmt(r.min)}` : ""}{r.max != null ? ` ≤ ${fmt(r.max)}` : ""}</span></div>)}
            <Link href="/app/impostazioni" className="btn sm" style={{ alignSelf: "flex-start" }}>Modifica</Link>
          </div>
          {best && open.length > 1 && (
            <div className="card"><small>Piano combinato in testa</small><h3 style={{ margin: "4px 0" }}>{best.names.join(" + ")}</h3><small>{eur(best.scen.centrale.res.cash_end ?? 0)} a {profile.horizon} mesi · {fmt(best.scen.centrale.res.hours_w ?? 0)} h libere</small><br /><Link href="/app/connessioni" className="btn sm" style={{ marginTop: 10 }}>Vedi tutti i piani</Link></div>
          )}
        </div>
      </div>

      {rep.length ? <div className="card" style={{ marginTop: 16 }}><h3 style={{ marginBottom: 14 }}>Report sintetico</h3><ReportView sections={rep} /></div> : null}
    </>
  );
}
