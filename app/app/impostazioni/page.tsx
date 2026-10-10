"use client";
import { useEffect, useState } from "react";
import { Plus, Trash2, Download, AlertOctagon, Wallet, Target, User, ShieldCheck } from "lucide-react";
import { useWs, type Profile } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { RES_LABEL, uid, type Rule } from "@/lib/engine";

const PRI: Record<string, string> = { stabilita: "Stabilità", crescita: "Crescita", indipendenza: "Indipendenza", benessere: "Benessere" };
const CTX: Record<string, string> = { economia: "Economia", lavoro: "Lavoro", famiglia: "Famiglia", tempo: "Tempo", residenza: "Residenza", progetti: "Progetti" };
const RES = ["cash0", "cash_m", "hours_w"];
const RULE_R = ["cash_end", "autonomia_mesi", "hours_w", "cash_m", "cash0"];

export default function Impostazioni() {
  const ws = useWs();
  const [p, setP] = useState<Profile>(ws.profile);
  const [dirty, setDirty] = useState(false);
  const [ok, setOk] = useState(false);
  useEffect(() => { if (!dirty) setP(ws.profile); }, [ws.profile, dirty]);
  const set = (n: Partial<Profile>) => { setP({ ...p, ...n }); setDirty(true); setOk(false); };
  const setRule = (i: number, n: Partial<Rule>) => set({ rules: p.rules.map((r, j) => (j === i ? { ...r, ...n } : r)) });
  const today = new Date().toISOString().slice(0, 10);

  async function save() { await ws.saveProfile(p); setDirty(false); setOk(true); }
  function exportAll() {
    const blob = new Blob([JSON.stringify({ esportato: new Date().toISOString(), profilo: ws.profile, decisioni: ws.decisions, collegamenti: ws.deps, analisi_congelate: ws.snapshots, registro: ws.outcomes }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `decision-os-${today}.json`; a.click();
  }
  async function wipe() {
    if (prompt("Cancella TUTTI i dati: decisioni, collegamenti, registro, profilo. Irreversibile. Scrivi CANCELLA per confermare.") !== "CANCELLA") return;
    await ws.wipe(); alert("Dati cancellati. L'account di accesso resta: per eliminarlo scrivi all'amministratore del progetto Supabase.");
  }

  return (
    <>
      <Top t="Impostazioni" s="Il tuo quadro personale: aggiornabile, con data e fonte">
        {ok && <span className="pill ok">Salvato</span>}
        <button className="btn pri" disabled={!dirty} onClick={save}>Salva modifiche</button>
      </Top>
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card stack">
          <h3><Wallet size={18} /> Risorse condivise</h3>
          <small>Punto di partenza di ogni simulazione. Le alternative le modificano tramite i loro impatti.</small>
          {RES.map((k) => (
            <div key={k} className="grid" style={{ gridTemplateColumns: "1.3fr 1fr 1fr", gap: 8, alignItems: "end" }}>
              <div><label className="f">{RES_LABEL[k]}</label><input type="number" value={p.resources[k] ?? 0} onChange={(e) => set({ resources: { ...p.resources, [k]: +e.target.value }, resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], dt: today } } })} /></div>
              <div><label className="f">Fonte</label><input value={p.resources_meta[k]?.src ?? ""} onChange={(e) => set({ resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], src: e.target.value } } })} /></div>
              <div><label className="f">Aggiornato</label><input type="date" value={p.resources_meta[k]?.dt ?? ""} onChange={(e) => set({ resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], dt: e.target.value } } })} /></div>
            </div>
          ))}
          <div><label className="f">Orizzonte predefinito</label>
            <select value={p.horizon} onChange={(e) => set({ horizon: +e.target.value })}><option value={3}>3 mesi</option><option value={12}>12 mesi</option><option value={24}>24 mesi</option><option value={60}>5 anni</option></select></div>
          <hr style={{ margin: "4px 0" }} />
          <h3><ShieldCheck size={18} /> Vincoli sui piani</h3>
          {p.rules.map((r, i) => (
            <div key={r.id} className="row" style={{ flexWrap: "wrap" }}>
              <input style={{ flex: "1 1 160px" }} value={r.name} onChange={(e) => setRule(i, { name: e.target.value })} />
              <select style={{ flex: "1 1 170px", width: "auto" }} value={r.r} onChange={(e) => setRule(i, { r: e.target.value })}>{RULE_R.map((x) => <option key={x} value={x}>{RES_LABEL[x]}</option>)}</select>
              <span className="muted">≥</span><input className="n" style={{ width: 90 }} type="number" value={r.min ?? ""} onChange={(e) => setRule(i, { min: e.target.value === "" ? null : +e.target.value })} />
              <span className="muted">≤</span><input className="n" style={{ width: 90 }} type="number" value={r.max ?? ""} onChange={(e) => setRule(i, { max: e.target.value === "" ? null : +e.target.value })} />
              <button className="iconbtn" onClick={() => set({ rules: p.rules.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => set({ rules: [...p.rules, { id: uid(), name: "Nuovo vincolo", r: "cash_end", min: 0 }] })}><Plus size={14} /> Vincolo</button>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3><Target size={18} /> Priorità di questa fase</h3>
            <small>Non sono immutabili: guidano i pesi suggeriti. Le analisi già congelate conservano i pesi di allora.</small>
            {Object.keys(PRI).map((k) => (
              <div key={k}><div className="row between" style={{ fontSize: 14 }}><span>{PRI[k]}</span><strong>{p.priorities[k] ?? 3}/5</strong></div>
                <input type="range" min={1} max={5} value={p.priorities[k] ?? 3} onChange={(e) => set({ priorities: { ...p.priorities, [k]: +e.target.value } })} /></div>
            ))}
          </div>
          <div className="card stack">
            <h3><User size={18} /> Contesto personale</h3>
            <small>Poche righe per area, aggiornabili nel tempo.</small>
            {Object.keys(CTX).map((k) => (
              <div key={k}><label className="f">{CTX[k]}</label><input value={p.context[k] ?? ""} onChange={(e) => set({ context: { ...p.context, [k]: e.target.value } })} /></div>
            ))}
          </div>
          <div className="card stack">
            <h3>Privacy e dati</h3>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={p.ai_share.economia} onChange={(e) => set({ ai_share: { ...p.ai_share, economia: e.target.checked } })} /> Consenti di inviare all&apos;AI cifre economiche (default per l&apos;Analista)</label>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={p.ai_share.contesto} onChange={(e) => set({ ai_share: { ...p.ai_share, contesto: e.target.checked } })} /> Consenti di inviare contesto e priorità</label>
            <div className="row">
              <button className="btn" onClick={exportAll}><Download size={16} /> Esporta tutto (JSON)</button>
              <button className="btn danger" onClick={wipe}><AlertOctagon size={16} /> Cancella tutti i dati</button>
            </div>
            <small>Account: {ws.email}</small>
          </div>
        </div>
      </div>
    </>
  );
}
