"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ListChecks, ShieldAlert, Calculator, Plus } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { ai, compact } from "@/lib/ai";
import { analyzeDecision, uid } from "@/lib/engine";
import { relevantCtx, ctxForAi } from "@/lib/context";

const MODES = [
  { k: "dati", l: "Analisi dei dati", d: "Fatti, stime, mancanze, contraddizioni", i: ListChecks },
  { k: "contro", l: "Contraddittorio", d: "Il miglior argomento contro la prima scelta", i: ShieldAlert },
  { k: "svolta", l: "Punto di svolta", d: "Le soglie che ribaltano la scelta", i: Calculator },
];
type Out = { p?: string[]; c?: string };

function Inner() {
  const q = useSearchParams();
  const { decisions, profile, saveDecision, vault } = useWs();
  const open = decisions.filter((d) => d.status !== "archiviata");
  const [id, setId] = useState(q.get("d") ?? open[0]?.id ?? "");
  const [eco, setEco] = useState(profile.ai_share.economia);
  const [ctx, setCtx] = useState(profile.ai_share.contesto);
  const [busy, setBusy] = useState("");
  const [out, setOut] = useState<Record<string, Out>>({});
  const [e, setE] = useState("");
  const d = decisions.find((x) => x.id === id);
  const payload = useMemo(() => {
    if (!d) return null;
    const c = ctx ? Object.entries(profile.context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ") : undefined;
    return compact(d, analyzeDecision(d), { eco, ctx: c, res: profile.resources, cx: ctxForAi(relevantCtx(vault, d, 15, d.model.cxOff ?? []), eco) });
  }, [d, eco, ctx, profile, vault]);

  async function run(mode: string) {
    if (!payload) return;
    setBusy(mode); setE("");
    try { const r = await ai<Out>(mode, payload); setOut((o) => ({ ...o, [mode]: r })); }
    catch (err) { setE((err as Error).message); } finally { setBusy(""); }
  }
  async function addAssumption(t: string) {
    if (!d) return;
    const n = structuredClone(d);
    (n.model.assumptions ??= []).push({ id: uid(), t, rel: "?", aff: "bassa", src: "Analista AI", dt: new Date().toISOString().slice(0, 10) });
    await saveDecision(n);
  }

  return (
    <>
      <Top t="Analista AI" s="Non conferma le tue convinzioni: le mette alla prova" />
      <div className="card grid g3" style={{ marginBottom: 16, alignItems: "end" }}>
        <div><label className="f">Decisione</label><select value={id} onChange={(x) => { setId(x.target.value); setOut({}); }}>{open.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={eco} onChange={(x) => setEco(x.target.checked)} /> Invia cifre economiche (impatti, risorse)</label>
        <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={ctx} onChange={(x) => setCtx(x.target.checked)} /> Invia il mio contesto personale</label>
      </div>
      {payload && <details style={{ marginBottom: 16 }}><summary>Cosa viene inviato all&apos;AI ({JSON.stringify(payload).length} caratteri)</summary><pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#fff", padding: 12, borderRadius: 10, border: "1px solid var(--line)" }}>{JSON.stringify(payload, null, 1)}</pre></details>}
      {e && <div className="note bad" style={{ marginBottom: 16 }}>{e}</div>}
      {!d ? <div className="card empty">Crea prima una decisione.</div> : (
        <div className="grid g3" style={{ alignItems: "start" }}>
          {MODES.map(({ k, l, d: ds, i: I }) => (
            <div key={k} className="card stack">
              <div className="row" style={{ flexWrap: "nowrap" }}><span className="iconwrap o"><I size={20} /></span><div><h3 style={{ margin: 0 }}>{l}</h3><small>{ds}</small></div></div>
              <button className="btn pri" disabled={!!busy} onClick={() => run(k)}>{busy === k ? "Analisi…" : out[k] ? "Ripeti" : "Avvia"}</button>
              {out[k] && (
                <>
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {(out[k].p ?? []).map((p, i) => (
                      <li key={i} style={{ marginBottom: 6 }}>{p}{k !== "contro" && <button className="iconbtn" title="Aggiungi ai dati da verificare" onClick={() => addAssumption(p)}><Plus size={13} /></button>}</li>
                    ))}
                  </ul>
                  {out[k].c && <div className="note">{out[k].c}</div>}
                  <small className="aisrc"><span className="aitag">AI</span> Testo dell&apos;Analista: non è una fonte verificata. Cifre e fatti valgono solo se compaiono nei tuoi dati o nelle fonti che hai indicato.</small>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 13, marginTop: 14 }}>L&apos;AI non calcola punteggi: legge quelli del motore. La conformità al formato non garantisce che il contenuto sia vero: verifica sempre.</p>
    </>
  );
}

export default function Analista() {
  return <Suspense><Inner /></Suspense>;
}
