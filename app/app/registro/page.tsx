"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Snowflake, CheckCircle2, Trash2, GitCompare, Bot, GraduationCap } from "lucide-react";
import { useWs, type Snapshot, type Outcome } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { ai } from "@/lib/ai";
import { watchProposals } from "@/lib/monitor";
import { analyzeDecision, fmt, eur, isOut, predOf, lessons, LEARN_MIN, type DecResult, type Act } from "@/lib/engine";

const CAUSE: Record<string, string> = { ragionamento: "Errore di ragionamento", dato: "Dato sbagliato", imprevisto: "Evento imprevedibile", nessuno: "Previsione corretta" };

function Compare({ s }: { s: Snapshot }) {
  const { decisions } = useWs();
  const then = (s.result as { res: DecResult[] }).res ?? [];
  return (
    <div className="stack" style={{ marginTop: 10 }}>
      {then.map((t) => {
        const cur = decisions.find((d) => d.id === t.id);
        const now = cur ? analyzeDecision(cur) : null;
        const w0 = s.input.decisions.find((d) => d.id === t.id)?.model.criteria ?? [];
        const changedW = cur ? cur.model.criteria.filter((c) => { const o = w0.find((x) => x.id === c.id); return !o || o.w !== c.w; }) : [];
        return (
          <div key={t.id}>
            <strong>{t.name}</strong>{!now && <small> · decisione eliminata</small>}
            <table className="t num"><thead><tr><th>Alternativa</th><th>Allora</th><th>Oggi</th><th>Δ</th></tr></thead>
              <tbody>{t.rows.map((r) => {
                const n = now?.rows.find((x) => x.id === r.id);
                const dlt = n ? n.score - r.score : null;
                return <tr key={r.id}><td>{r.name}{r.excluded.length ? " (esclusa)" : ""}</td><td>{fmt(r.score)}</td><td>{n ? fmt(n.score) : "—"}</td>
                  <td>{dlt == null ? "—" : <span className={`pill ${Math.abs(dlt) < 0.05 ? "info" : dlt > 0 ? "ok" : "bad"}`}>{dlt > 0 ? "+" : ""}{fmt(dlt)}</span>}</td></tr>;
              })}</tbody></table>
            {now && now.rows[0]?.id !== t.rows[0]?.id && <div className="note warn">La prima scelta è cambiata: da {t.rows[0]?.name} a {now.rows[0]?.name}.</div>}
            {changedW.length ? <small>Pesi modificati da allora: {changedW.map((c) => `${c.name} ${w0.find((x) => x.id === c.id)?.w ?? "nuovo"}→${c.w}`).join(", ")}</small> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Numero in euro salvato quando esci dal campo. «1.500» e «1500» valgono uguale. */
function Eur({ v, on, ph }: { v: number | null | undefined; on: (x: number | null) => void; ph?: string }) {
  return <span className="numin" style={{ width: 150 }}><input inputMode="decimal" defaultValue={v == null ? "" : String(v)} placeholder={ph ?? "—"}
    onBlur={(e) => { const t = e.target.value.trim().replace(/\./g, "").replace(",", "."); const x = t === "" ? null : +t; if (x === null || !isNaN(x)) { if (x !== (v ?? null)) on(x); } }} /><em>€</em></span>;
}

/** Consuntivo con gli stessi campi della previsione: è ciò che permette di misurare i tuoi errori di stima. */
function Consuntivo({ o }: { o: Outcome }) {
  const { saveOutcome } = useWs();
  const p = o.pred!; const a: Act = o.act ?? {};
  const set = (x: Partial<Act>) => saveOutcome({ id: o.id, act: { ...a, ...x } });
  const filled = a.ok != null || a.c0 != null || a.m != null || Object.keys(a.hit ?? {}).length > 0;
  return (
    <details className="cons" open={!!o.observed && !filled}>
      <summary>Consuntivo{filled ? " · compilato" : ""} <small className="muted">— stessi campi della previsione, servono a misurare i tuoi errori di stima</small></summary>
      <div className="stack" style={{ marginTop: 8 }}>
        {p.c0 != null && <div><label className="f">{p.c0 < 0 ? "Spesa iniziale" : "Entrata iniziale"}: prevista {eur(Math.abs(p.c0))}</label><Eur v={a.c0 == null ? null : Math.abs(a.c0)} ph="reale" on={(x) => set({ c0: x == null ? null : p.c0! < 0 ? -Math.abs(x) : Math.abs(x) })} /></div>}
        {p.m && <div><label className="f">Differenza mensile: prevista {eur(p.m[1])} (se va male {eur(p.m[0])})</label><Eur v={a.m} ph="reale, es. -300" on={(x) => set({ m: x })} /></div>}
        {p.rs.length > 0 && <div><label className="f">Rischi che avevi previsto: quali sono successi?</label>
          {p.rs.map((r) => { const h = a.hit?.[r.id]; return (
            <div key={r.id} className="stack" style={{ gap: 4, marginTop: 6 }}>
              <label className="hitrow"><input type="checkbox" checked={h != null} onChange={(e) => { const hit = { ...(a.hit ?? {}) }; if (e.target.checked) hit[r.id] = 0; else delete hit[r.id]; set({ hit }); }} />
                <span>{r.t} <small className="muted">(probabilità {r.p}{r.tot ? `, previsti ${eur(Math.abs(r.tot))}` : ""})</small></span></label>
              {h != null && <Eur v={h ? Math.abs(h) : null} ph="costo reale" on={(x) => set({ hit: { ...(a.hit ?? {}), [r.id]: x == null ? 0 : -Math.abs(x) } })} />}
            </div>); })}
        </div>}
        <div><label className="f">Com&apos;è andata, nel complesso?</label>
          <select style={{ width: "auto", display: "block" }} value={a.ok ?? ""} onChange={(e) => set({ ok: e.target.value ? +e.target.value : null })}>
            <option value="">—</option>{["Molto peggio del previsto", "Peggio", "Come previsto", "Meglio", "Molto meglio"].map((l, i) => <option key={i} value={i + 1}>{i + 1} · {l}</option>)}
          </select></div>
      </div>
    </details>
  );
}

/** Cosa insegnano le decisioni passate: solo sopra una soglia minima di casi, sempre con il numero di casi. */
function Lessons() {
  const { outcomes } = useWs();
  const withPred = outcomes.filter((o) => o.pred);
  if (!withPred.length) return null;
  const done = withPred.filter((o) => o.act && Object.keys(o.act).length).length;
  const ls = lessons(outcomes);
  return (
    <div className="card stack">
      <h3><GraduationCap size={18} /> Cosa stai imparando</h3>
      {ls.length ? ls.map((l) => <div key={l.k} className="note">{l.t} <small className="muted">· su {l.n} {l.k.startsWith("r_") ? "rischi" : "casi"}</small></div>)
        : <small>Servono almeno {LEARN_MIN} decisioni con il consuntivo compilato per dire qualcosa di affidabile sui tuoi errori di stima: ne hai {done}. Sotto questa soglia ogni percentuale sarebbe rumore.</small>}
    </div>
  );
}

function OutcomeCard({ o }: { o: Outcome }) {
  const { saveOutcome, deleteOutcome } = useWs();
  const [busy, setBusy] = useState(false);
  const [ai_, setAi] = useState<{ p?: string[]; c?: string } | null>(null);
  async function retro() {
    setBusy(true);
    try {
      const r = await ai<{ p?: string[]; c?: string; k?: string }>("retro", { n: o.decision_name, scelta: o.chosen, previsto: o.expected, accaduto: o.observed });
      setAi(r);
      if (r.k && !o.cause) saveOutcome({ id: o.id, cause: r.k });
    } catch (e) { alert((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <div className="card stack">
      <div className="row between"><div><h3 style={{ margin: 0 }}>{o.decision_name}</h3><small>Scelta: <strong>{o.chosen}</strong> · {new Date(o.decided_at).toLocaleDateString("it-IT")}</small></div>
        <button className="iconbtn" onClick={() => confirm("Eliminare questa voce?") && deleteOutcome(o.id)}><Trash2 size={15} /></button></div>
      {o.expected && <div><label className="f">Previsto</label><p style={{ margin: 0, fontSize: 14 }}>{o.expected}</p></div>}
      <div><label className="f">Cosa è successo davvero</label><textarea defaultValue={o.observed ?? ""} onBlur={(e) => e.target.value !== (o.observed ?? "") && saveOutcome({ id: o.id, observed: e.target.value })} /></div>
      <div className="row">
        <select style={{ width: "auto" }} value={o.cause ?? ""} onChange={(e) => saveOutcome({ id: o.id, cause: e.target.value || null })}><option value="">Causa dello scarto…</option>{Object.entries(CAUSE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input type="date" style={{ width: "auto" }} value={o.review_at ?? ""} onChange={(e) => saveOutcome({ id: o.id, review_at: e.target.value || null })} title="Data revisione" />
        <button className="btn sm" disabled={busy || !o.observed} onClick={retro}><Bot size={14} /> {busy ? "…" : "Retrospettiva AI"}</button>
      </div>
      {o.pred && <Consuntivo o={o} />}
      {ai_ && <div className="note"><ul style={{ margin: 0, paddingLeft: 18 }}>{(ai_.p ?? []).map((p, i) => <li key={i}>{p}</li>)}</ul>{ai_.c && <p style={{ margin: "6px 0 0" }}><strong>{ai_.c}</strong></p>}</div>}
    </div>
  );
}

function Inner() {
  const q = useSearchParams();
  const ws = useWs();
  const [cmp, setCmp] = useState<string | null>(null);
  const pre = ws.decisions.find((d) => d.id === q.get("d"));
  const [f, setF] = useState({ decision_id: pre?.id ?? "", chosen: q.get("o") ?? "", expected: "", review_at: "" });   // chosen = id della strada
  const dec = ws.decisions.find((d) => d.id === f.decision_id);
  const top = useMemo(() => (dec ? analyzeDecision(dec).rows.find((r) => !r.excluded.length) : null), [dec]);

  async function register() {
    if (!dec || !f.chosen) return;
    const r = analyzeDecision(dec);
    await ws.createSnapshot(`${dec.name} · decisione presa`, { decisions: [dec], deps: ws.deps, resources: ws.profile.resources, rules: ws.profile.rules, horizon: ws.profile.horizon }, { res: [r] });
    const ch = dec.model.options.find((o) => o.id === f.chosen && !isOut(o));
    if (!ch) return;
    await ws.saveOutcome({ decision_id: dec.id, decision_name: dec.name, chosen: ch.name, chosen_id: ch.id, pred: predOf(dec, r, ch.id, ws.profile.resources), expected: f.expected || null, review_at: f.review_at || null });
    // la strada scelta diventa uno stato vero della decisione (le altre tornano attive se erano «scelta»)
    const now = new Date().toISOString();
    const options = dec.model.options.map((o) => (o.id === ch.id ? { ...o, st: "scelta" as const, stAt: now } : o.st === "scelta" ? { ...o, st: "attiva" as const, stAt: now } : o));
    // la scelta entra «in osservazione»: condizioni di revisione proposte dal motore (le puoi togliere o aggiungerne nella decisione)
    const mm = { ...dec.model, options };
    const watch = dec.model.watch?.length ? dec.model.watch : watchProposals({ ...dec, model: mm }, ch.id, ws.profile.resources, ws.profile.rules);
    await ws.saveDecision({ ...dec, status: "presa", model: { ...mm, watch } });
    setF({ decision_id: "", chosen: "", expected: "", review_at: "" });
  }

  return (
    <>
      <Top t="Registro" s="Decisioni prese, analisi congelate, risultati nel tempo" />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card stack">
            <h3><CheckCircle2 size={18} /> Registra una decisione presa</h3>
            <select value={f.decision_id} onChange={(e) => setF({ ...f, decision_id: e.target.value, chosen: "" })}>
              <option value="">Scegli la decisione…</option>
              {ws.decisions.filter((d) => d.status === "aperta").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {dec && (
              <>
                <select value={f.chosen} onChange={(e) => setF({ ...f, chosen: e.target.value })}>
                  <option value="">Alternativa scelta…</option>
                  {dec.model.options.filter((o) => !isOut(o)).map((o) => <option key={o.id} value={o.id}>{o.name}{o.id === top?.id ? " (prima nel modello)" : ""}</option>)}
                </select>
                {dec.model.options.some(isOut) && <small className="muted">Le strade non perseguibili o abbandonate non sono selezionabili: per sceglierne una, prima riattivala nella decisione.</small>}
                {f.chosen && top && f.chosen !== top.id && <div className="note warn">Hai scelto un&apos;alternativa diversa dalla prima del modello. Annota nel previsto il motivo: in revisione capirai se il modello sbagliava o mancava un criterio.</div>}
                <textarea placeholder="Cosa ti aspetti che succeda (cifre, tempi)" value={f.expected} onChange={(e) => setF({ ...f, expected: e.target.value })} />
                <div><label className="f">Data di revisione</label><input type="date" value={f.review_at} onChange={(e) => setF({ ...f, review_at: e.target.value })} /></div>
                <button className="btn pri" disabled={!f.chosen} onClick={register}>Registra e congela l&apos;analisi</button>
              </>
            )}
          </div>
          <Lessons />
          {ws.outcomes.map((o) => <OutcomeCard key={o.id} o={o} />)}
        </div>

        <div className="card stack">
          <h3><Snowflake size={18} /> Analisi congelate</h3>
          <small>Risultati salvati al momento dell&apos;analisi, mai sovrascritti. Confrontali con lo stato attuale.</small>
          {!ws.snapshots.length && <div className="empty">Usa «Congela analisi» da una decisione.</div>}
          {ws.snapshots.map((s) => (
            <div key={s.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <div className="row between">
                <div><strong>{s.label}</strong><br /><small>{new Date(s.created_at).toLocaleString("it-IT")}</small></div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn sm" onClick={() => setCmp(cmp === s.id ? null : s.id)}><GitCompare size={14} /> {cmp === s.id ? "Chiudi" : "Confronta con oggi"}</button>
                  <button className="iconbtn" onClick={() => confirm("Eliminare l'analisi congelata?") && ws.deleteSnapshot(s.id)}><Trash2 size={15} /></button>
                </div>
              </div>
              {cmp === s.id && <Compare s={s} />}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default function Registro() {
  return <Suspense><Inner /></Suspense>;
}
