import { Award, ShieldCheck, Activity, FileSearch, Link2, ArrowRightCircle } from "lucide-react";
import { bold, type Section } from "@/lib/report";

const IC: Record<string, React.ReactNode> = {
  pref: <Award size={20} />, sost: <ShieldCheck size={20} />, rob: <Activity size={20} />,
  aff: <FileSearch size={20} />, eff: <Link2 size={20} />, next: <ArrowRightCircle size={20} />,
};
const TONE: Record<string, string> = { ok: "t", warn: "o", bad: "o" };

export function Rich({ s }: { s: string }) {
  return <>{bold(s).map((p, i) => ("b" in p ? <strong key={i}>{p.b}</strong> : <span key={i}>{p.t}</span>))}</>;
}

export default function ReportView({ sections }: { sections: Section[] }) {
  return (
    <div className="stack">
      {sections.map((s) => (
        <div key={s.k} className="row" style={{ alignItems: "flex-start", gap: 14, flexWrap: "nowrap" }}>
          <span className={`iconwrap ${s.k === "next" ? "n" : s.tone ? TONE[s.tone] : ""}`}>{IC[s.k]}</span>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 8 }}>
              <h3 style={{ margin: 0 }}>{s.title}</h3>
              {s.tone === "warn" ? <span className="pill warn">attenzione</span> : s.tone === "bad" ? <span className="pill bad">critico</span> : null}
            </div>
            {s.lines.map((l, i) => <p key={i} style={{ margin: "4px 0 0" }}><Rich s={l} /></p>)}
          </div>
        </div>
      ))}
      <p className="muted" style={{ fontSize: 13 }}>Il punteggio misura l&apos;aderenza alle preferenze inserite, non la probabilità che la scelta sia giusta.</p>
    </div>
  );
}
