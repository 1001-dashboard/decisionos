"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, FilePlus, Wand2, HelpCircle } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { ai, structToModel, type AiStruct } from "@/lib/ai";
import { demoDecisions } from "@/lib/demo";
import { uid, type Model } from "@/lib/engine";

const REL = { F: ["ok", "verificato"], D: ["info", "dichiarato"], S: ["warn", "stima"], "?": ["bad", "mancante"] } as const;

export default function Nuova() {
  const r = useRouter();
  const { createDecision, profile } = useWs();
  const [t, setT] = useState("");
  const [ans, setAns] = useState("");
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState("");
  const [draft, setDraft] = useState<{ name: string; model: Model; questions: string[] } | null>(null);

  async function struttura() {
    setBusy(true); setE("");
    try {
      const ctx = profile.ai_share.contesto ? Object.entries(profile.context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ") : undefined;
      const x = await ai<AiStruct>("struttura", { t: t + (ans ? `\nRisposte: ${ans}` : ""), ...(ctx ? { ctx } : {}), ...(profile.ai_share.contesto ? { pr: profile.priorities } : {}) });
      setDraft(structToModel(x));
    } catch (err) { setE((err as Error).message); } finally { setBusy(false); }
  }
  async function crea(model?: Model, name?: string) {
    setBusy(true);
    const id = await createDecision({ name: name ?? "Nuova decisione", descr: t + (ans ? `\n\n${ans}` : ""), model });
    setBusy(false);
    if (id) r.push(`/app/decisioni/${id}`);
  }
  function demo() {
    const d = structuredClone(demoDecisions[0]);
    const map: Record<string, string> = {};
    d.model.options.forEach((o) => { map[o.id] = uid(); o.id = map[o.id]; });
    setT(d.descr ?? "");
    crea(d.model, d.name + " (esempio)");
  }

  return (
    <>
      <Top t="Nuova decisione" s="Racconta la situazione con parole tue" />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card stack">
          <label className="f" htmlFor="tx">Descrizione libera</label>
          <textarea id="tx" style={{ minHeight: 170 }} value={t} onChange={(x) => setT(x.target.value)}
            placeholder="Es. Mi hanno proposto un lavoro all'estero. Potrebbe essere un'opportunità, ma dovrei affrontare un trasferimento costoso e cambiare molte cose…" />
          {draft?.questions.length ? (
            <div className="stack">
              <div className="note"><strong className="row" style={{ gap: 6 }}><HelpCircle size={16} /> Dati indispensabili</strong>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{draft.questions.map((q) => <li key={q}>{q}</li>)}</ul></div>
              <textarea placeholder="Le tue risposte (facoltative)" value={ans} onChange={(x) => setAns(x.target.value)} />
            </div>
          ) : null}
          <div className="row">
            <button className="btn pri" disabled={busy || t.trim().length < 20} onClick={struttura}><Sparkles size={16} /> {draft ? "Rigenera scheda" : "Struttura con l'Analista"}</button>
            <button className="btn" disabled={busy} onClick={() => crea()}><FilePlus size={16} /> Crea vuota</button>
            <button className="btn ghost" disabled={busy} onClick={demo}><Wand2 size={16} /> Esempio Ibiza</button>
          </div>
          {busy && <small>Elaborazione…</small>}
          {e && <div className="err">{e}</div>}
          <small>All&apos;AI viene inviato solo il testo{profile.ai_share.contesto ? " e il tuo contesto/priorità" : ""}. Cambia in Impostazioni.</small>
        </div>

        <div className="card stack">
          <h3>Scheda strutturata</h3>
          {!draft ? <div className="empty">L&apos;Analista proporrà alternative, criteri, vincoli e dati. Prima di calcolare, controlli tu.</div> : (
            <>
              <div><label className="f">Titolo</label><input value={draft.name} onChange={(x) => setDraft({ ...draft, name: x.target.value })} /></div>
              <div><label className="f">Alternative</label><div className="row" style={{ gap: 6 }}>{draft.model.options.map((o) => <span key={o.id} className="pill teal">{o.name}</span>)}</div></div>
              <div><label className="f">Criteri e pesi</label>
                {draft.model.criteria.map((c) => <div key={c.id} className="row between" style={{ fontSize: 14 }}><span>{c.name}{c.group ? <small> · gruppo {c.group}</small> : null}</span><strong>{c.w}%</strong></div>)}</div>
              {draft.model.constraints.length ? <div><label className="f">Vincoli non negoziabili</label>{draft.model.constraints.map((k) => <div key={k.id} style={{ fontSize: 14 }}>• {k.name}</div>)}</div> : null}
              <div><label className="f">Su cosa si basa</label>
                {draft.model.assumptions!.map((a) => <div key={a.id} className="row between" style={{ fontSize: 14, flexWrap: "nowrap" }}><span>{a.t}</span><span className={`pill ${REL[a.rel][0]}`}>{REL[a.rel][1]}</span></div>)}</div>
              <div className="note warn" style={{ fontSize: 13 }}>I valori stimati dall&apos;AI sono marcati come «stima»: rivedili nel modello prima di fidarti del confronto.</div>
              <button className="btn pri" disabled={busy} onClick={() => crea(draft.model, draft.name)}>Conferma e apri il modello</button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
