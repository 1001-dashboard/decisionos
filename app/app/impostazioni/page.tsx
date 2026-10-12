"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus, Trash2, Download, AlertOctagon, Wallet, Target, User, ShieldCheck } from "lucide-react";
import { useWs, type Profile } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { customRes, resLabel, uid, type Rule } from "@/lib/engine";

import { PRI } from "@/lib/priorities";
const CTX: Record<string, string> = { economia: "Economia", lavoro: "Lavoro", famiglia: "Famiglia", tempo: "Tempo", residenza: "Residenza", progetti: "Progetti" };
const RES = ["cash0", "cash_m", "hours_w"];
const RL: Record<string, [string, string, string]> = {
  cash0: ["Risparmi disponibili oggi", "€", "Quanto potresti usare senza indebitarti."],
  cash_m: ["Quanto ti resta ogni mese", "€/mese", "Entrate meno uscite. Negativo se oggi stai consumando risparmi."],
  hours_w: ["Ore libere a settimana", "ore", "Tempo che potresti dedicare a lavoro o progetti nuovi."],
};
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
          <h3><Wallet size={18} /> La tua situazione oggi</h3>
          <small>È il punto di partenza: ogni alternativa la modifica (passo «Soldi e tempo»). Bastano cifre approssimative.</small>
          {RES.map((k) => (
            <div key={k} className="grid" style={{ gridTemplateColumns: "1.3fr 1fr 1fr", gap: 8, alignItems: "end" }}>
              <div><label className="f" title={RL[k][2]}>{RL[k][0]} ({RL[k][1]})</label><input type="number" value={p.resources[k] ?? 0} onChange={(e) => set({ resources: { ...p.resources, [k]: +e.target.value }, resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], dt: today } } })} /><small>{RL[k][2]}</small></div>
              <div><label className="f">Fonte</label><input value={p.resources_meta[k]?.src ?? ""} onChange={(e) => set({ resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], src: e.target.value } } })} /></div>
              <div><label className="f">Aggiornato</label><input type="date" value={p.resources_meta[k]?.dt ?? ""} onChange={(e) => set({ resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], dt: e.target.value } } })} /></div>
            </div>
          ))}
          <h4 style={{ margin: "6px 0 0" }}>Altre risorse</h4>
          <small>Quello che le tue decisioni consumano oltre a soldi e ore: persone disponibili, budget di reparto, capacità, giorni di ferie, energia… Ogni strada potrà aumentarle o ridurle, e i limiti qui sotto valgono anche per loro.</small>
          {customRes(p.resources, p.resources_meta).map((k) => (
            <div key={k} className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <input aria-label="Nome risorsa" style={{ flex: "2 1 160px" }} value={p.resources_meta[k]?.l ?? ""} onChange={(e) => set({ resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], l: e.target.value } } })} />
              <input aria-label="Unità" placeholder="unità" style={{ flex: "1 1 90px" }} value={p.resources_meta[k]?.u ?? ""} onChange={(e) => set({ resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], u: e.target.value } } })} />
              <input aria-label="Valore oggi" type="number" style={{ flex: "1 1 90px" }} value={p.resources[k] ?? 0} onChange={(e) => set({ resources: { ...p.resources, [k]: +e.target.value }, resources_meta: { ...p.resources_meta, [k]: { ...p.resources_meta[k], dt: today } } })} />
              <button className="iconbtn" aria-label="Togli risorsa" onClick={() => { const r = { ...p.resources }, mt = { ...p.resources_meta }; delete r[k]; delete mt[k]; set({ resources: r, resources_meta: mt, rules: p.rules.filter((x) => x.r !== k) }); }}><Trash2 size={15} /></button>
            </div>
          ))}
          <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => { const k = "x_" + uid().slice(0, 6); set({ resources: { ...p.resources, [k]: 0 }, resources_meta: { ...p.resources_meta, [k]: { l: "Nuova risorsa", u: "", dt: today } } }); }}><Plus size={14} /> Risorsa</button>
          <div><label className="f">Orizzonte predefinito</label>
            <select value={p.horizon} onChange={(e) => set({ horizon: +e.target.value })}><option value={3}>3 mesi</option><option value={12}>12 mesi</option><option value={24}>24 mesi</option><option value={60}>5 anni</option></select></div>
          <hr style={{ margin: "4px 0" }} />
          <h3><ShieldCheck size={18} /> I tuoi limiti di sicurezza</h3>
          <small>Un piano che li viola viene segnalato o escluso. Es. «non scendere mai sotto 3.000 € di risparmi».</small>
          {p.rules.map((r, i) => (
            <div key={r.id} className="row" style={{ flexWrap: "wrap" }}>
              <input style={{ flex: "1 1 160px" }} value={r.name} onChange={(e) => setRule(i, { name: e.target.value })} />
              <select style={{ flex: "1 1 170px", width: "auto" }} value={r.r} onChange={(e) => setRule(i, { r: e.target.value })}>{[...RULE_R, ...customRes(p.resources, p.resources_meta)].map((x) => <option key={x} value={x}>{resLabel(x, p.resources_meta)}</option>)}</select>
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
            <small>Valgono per questa fase della tua vita e sono il punto di partenza dell&apos;importanza dei criteri nelle nuove decisioni. Se in una decisione dai un&apos;importanza molto diversa, Decision OS te lo fa notare. Le analisi congelate conservano i pesi di allora.</small>
            {Object.keys(PRI).map((k) => (
              <div key={k}><div className="row between" style={{ fontSize: 14 }}><span>{PRI[k].l} <small>· {PRI[k].d}</small></span><strong>{p.priorities[k] ?? 3}/5</strong></div>
                <input type="range" min={1} max={5} value={p.priorities[k] ?? 3} onChange={(e) => set({ priorities: { ...p.priorities, [k]: +e.target.value } })} /></div>
            ))}
          </div>
          <div className="card stack">
            <h3><User size={18} /> Contesto personale</h3>
            <small>Poche righe per area, aggiornabili nel tempo. Per un contesto completo, con fatti, vincoli, obiettivi e progetti che Decision OS usa in ogni decisione, vai a <Link href="/app/contesto"><b>Contesto</b></Link>: puoi importarlo da ChatGPT, Claude o Gemini.</small>
            {Object.keys(CTX).map((k) => (
              <div key={k}><label className="f">{CTX[k]}</label><input value={p.context[k] ?? ""} onChange={(e) => set({ context: { ...p.context, [k]: e.target.value } })} /></div>
            ))}
          </div>
          <div className="card stack">
            <h3>Privacy e dati</h3>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={p.ai_share.economia} onChange={(e) => set({ ai_share: { ...p.ai_share, economia: e.target.checked } })} /> Consenti di inviare all&apos;AI cifre economiche (default per l&apos;Analista)</label>
            <small className="muted">Senza consenso gli importi vengono oscurati due volte, nell&apos;app e sul server: in cifre e nelle forme comuni in lettere. Un importo scritto in modo insolito nel testo libero può sfuggire: se un dato è delicato, non scriverlo nel racconto.</small>
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={p.ai_share.contesto} onChange={(e) => set({ ai_share: { ...p.ai_share, contesto: e.target.checked } })} /> Consenti di inviare contesto e priorità (default: lo puoi cambiare in ogni richiesta)</label>
            <small className="muted">Vale per il profilo qui sopra, per gli elementi confermati della sezione Contesto e per le priorità generali. Gli elementi privati non vengono mai inviati. Senza consenso il server scarta comunque contesto e priorità.</small>
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
