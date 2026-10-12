"use client";
import { monitorOf } from "@/lib/monitor";
import Link from "next/link";
import { useState } from "react";
import { Plus, ArrowRight } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { analyzeDecision, fmt } from "@/lib/engine";

const ST = { aperta: "Aperte", presa: "Prese", archiviata: "Archiviate" } as const;

export default function Decisioni() {
  const { decisions } = useWs();
  const [st, setSt] = useState<keyof typeof ST>("aperta");
  const list = decisions.filter((d) => d.status === st);
  return (
    <>
      <Top t="Decisioni" s="Confronta le opzioni">
        <Link href="/app/decisioni/nuova" className="btn pri"><Plus size={16} /> Nuova decisione</Link>
      </Top>
      <div className="seg" style={{ marginBottom: 16 }}>
        {(Object.keys(ST) as (keyof typeof ST)[]).map((k) => <button key={k} className={k === st ? "on" : ""} onClick={() => setSt(k)}>{ST[k]} ({decisions.filter((d) => d.status === k).length})</button>)}
      </div>
      {!list.length && <div className="card empty">Nessuna decisione in questo stato.</div>}
      <div className="grid g2">
        {list.map((d) => {
          const a = analyzeDecision(d);
          const t = a.rows.find((r) => !r.excluded.length);
          return (
            <Link key={d.id} href={`/app/decisioni/${d.id}`} className="card" style={{ textDecoration: "none", color: "inherit" }}>
              <div className="row between"><h3 style={{ margin: 0 }}>{d.name}</h3><ArrowRight size={16} className="muted" /></div>
              {d.descr ? <p className="muted" style={{ fontSize: 14, margin: "6px 0" }}>{d.descr.slice(0, 140)}{d.descr.length > 140 ? "…" : ""}</p> : null}
              <div className="row" style={{ gap: 6, marginTop: 8 }}>
                {d.model.options.map((o) => <span key={o.id} className={`pill ${o.id === t?.id ? "teal" : "info"}`}>{o.name} {fmt(a.rows.find((r) => r.id === o.id)?.score ?? 0)}</span>)}
                {a.tie ? <span className="pill bad">parità</span> : a.fragile.length ? <span className="pill warn">fragile</span> : null}
                <span className="pill info">importanza {"●".repeat(d.imp)}</span>
                {(() => { const mo = monitorOf(d); return mo ? <span className={`pill ${mo.state === "rivedere" ? "bad" : "info"}`}>{mo.state === "rivedere" ? "Da rivedere" : `In osservazione${mo.due.length ? ` · ${mo.due.length} da ricontrollare` : ""}`}</span> : null; })()}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
