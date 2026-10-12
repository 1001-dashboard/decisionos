"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles, FilePlus, Wand2, HelpCircle, Briefcase, Home, Car, Rocket, Package, Users, GraduationCap, PiggyBank,
  ThumbsUp, ThumbsDown, Info, RefreshCw, X,
} from "lucide-react";
import { TEMPLATES, fromTemplate, type Template } from "@/lib/templates";
import { impFor } from "@/lib/priorities";
import { useWs } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { ai, structToModel, type AiStruct } from "@/lib/ai";
import { exampleDecision } from "@/lib/demo";
import { uid, weightsFromImp, redactMoney, PLAN_L, TIPO_L, type Model } from "@/lib/engine";
import { relevantCtx, aiContext, CTX_ONE } from "@/lib/context";

const TI: Record<string, React.ReactNode> = { briefcase: <Briefcase size={20} />, home: <Home size={20} />, car: <Car size={20} />, rocket: <Rocket size={20} />, package: <Package size={20} />, users: <Users size={20} />, graduation: <GraduationCap size={20} />, piggy: <PiggyBank size={20} /> };
const REL = { F: ["ok", "verificato"], D: ["info", "dichiarato"], S: ["warn", "stima"], "?": ["bad", "da chiarire"] } as const;
const TIPO = TIPO_L;

type Draft = { name: string; model: Model; questions: string[]; serve: boolean };

export default function Nuova() {
  const r = useRouter();
  const { createDecision, profile, vault } = useWs();
  const [cxOff, setCxOff] = useState<string[]>([]);
  const [cxUse, setCxUse] = useState(profile.ai_share.contesto);
  const [t, setT] = useState("");
  const [ans, setAns] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [eco, setEco] = useState(profile.ai_share.economia);
  const rel = t.trim().length >= 20 ? relevantCtx(vault, { name: "", descr: t }, 15) : [];
  const nSend = rel.filter((x) => !cxOff.includes(x.id) && !x.priv && !x.sens).length;
  const answers = () => (draft?.questions ?? []).map((q, i) => (ans[i]?.trim() ? `${q} ${ans[i].trim()}` : "")).filter(Boolean);

  async function struttura() {
    setBusy(true); setE("");
    try {
      const pc = aiContext(vault, { name: "", descr: t, model: { criteria: [], constraints: [], options: [], cxOff } }, { consent: cxUse, eco, profile: profile.context });
      const ctx = pc.ctx;
      const rr = answers();
      const tx = (v: string) => (eco ? v : redactMoney(v));
      // contesto e priorità solo se l'hai acconsentito per questa richiesta
      const cx = pc.cx ?? [];
      const x = await ai<AiStruct>("struttura", { t: tx(t), ...(cxUse ? { pr: profile.priorities, cxok: true } : {}), ...(rr.length ? { r: rr.map(tx) } : {}), ...(ctx ? { ctx: tx(ctx) } : {}), ...(cx.length ? { cx } : {}), ...(eco ? { eco: true } : {}) });
      const d = structToModel(x);
      if (!d.model.options.length && !d.model.criteria.length) { setE("L'Analista non ha prodotto un quadro utilizzabile: riprova, magari aggiungendo qualche dettaglio."); return; }
      setDraft(d); setAns(rr.length ? [] : ans);
    } catch (err) { setE((err as Error).message); } finally { setBusy(false); }
  }
  async function crea(model?: Model, name?: string, descr?: string) {
    setBusy(true);
    const rr = answers();
    const mm = model ? { ...model, ...(cxOff.length ? { cxOff } : {}) } : cxOff.length ? { criteria: [], constraints: [], options: [], assumptions: [], cxOff } : undefined;
    const id = await createDecision({ name: name ?? "Nuova decisione", descr: descr ?? t + (rr.length ? `\n\n${rr.join("\n")}` : ""), model: mm });
    setBusy(false);
    if (id) r.push(`/app/decisioni/${id}`);
  }
  function fromTpl(tp: Template) {
    const x = fromTemplate(tp);
    x.model.criteria.forEach((c) => { c.imp = impFor(c.name, profile.priorities, c.imp); });   // priorità generali come punto di partenza
    crea(x.model, x.name);
  }
  function demo() {
    const d = structuredClone(exampleDecision);
    d.model.options.forEach((o) => { o.id = uid(); });
    setT(d.descr ?? "");
    crea(d.model, d.name, d.descr);
  }
  const edit = (fn: (m: Model) => void) => { if (!draft) return; const m = structuredClone(draft.model); fn(m); setDraft({ ...draft, model: m }); };
  const w = draft ? weightsFromImp(draft.model.criteria) : [];

  return (
    <>
      <Top t="Nuova decisione" s="Racconta la situazione e l'Analista prepara il quadro, oppure parti da un modello." />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Racconta la scelta</h3>
          <label className="f" htmlFor="tx">Come la diresti a un amico: cosa devi scegliere, cosa ti preoccupa, cosa conta per te</label>
          <textarea id="tx" style={{ minHeight: 170 }} value={t} onChange={(x) => setT(x.target.value)}
            placeholder="Es. Mi hanno offerto un lavoro in un'altra città: guadagnerei di più ma starei lontano dalla famiglia. Oppure: devo dire a un amico una cosa scomoda e non so se farlo…" />
          <div className="row">
            <button className="btn pri" disabled={busy || t.trim().length < 20} onClick={struttura}><Sparkles size={16} /> {draft ? "Rifai il quadro" : "Prepara il quadro con l'Analista"}</button>
            <button className="btn" disabled={busy} onClick={() => crea()}><FilePlus size={16} /> Crea vuota</button>
            <button className="btn ghost" disabled={busy} onClick={demo}><Wand2 size={16} /> Vedi un esempio compilato</button>
          </div>
          {rel.length > 0 && (
            <div className="note cxu">
              <b>Dal tuo contesto ho già {rel.length} {rel.length === 1 ? "elemento pertinente" : "elementi pertinenti"}</b> per questa decisione:
              <ul className="clean" style={{ marginTop: 4 }}>{rel.map((x) => (
                <li key={x.id}><label className="row" style={{ gap: 6, alignItems: "flex-start", flexWrap: "nowrap" }}>
                  <input type="checkbox" style={{ width: "auto", marginTop: 3 }} checked={!cxOff.includes(x.id)} onChange={(e) => setCxOff((o) => (e.target.checked ? o.filter((y) => y !== x.id) : [...o, x.id]))} />
                  <span>{x.t} <small className="muted">· {CTX_ONE[x.k]}{x.priv || x.sens ? " · privato, non va all'AI" : ""}</small></span></label></li>))}</ul>
            </div>
          )}
          <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" aria-label="Usa il contesto con l'Analista" checked={cxUse} onChange={(e) => setCxUse(e.target.checked)} /> Usa con l&apos;Analista {nSend ? `${nSend} ${nSend === 1 ? "elemento" : "elementi"} del mio contesto e ` : ""}le mie priorità generali</label>
          {busy && <small>L&apos;Analista sta preparando il quadro…</small>}
          {e && <div className="err">{e}</div>}
          <label className="row" style={{ gap: 8, fontSize: 14 }}><input type="checkbox" checked={eco} onChange={(e) => setEco(e.target.checked)} /> Includi le cifre in € (stipendio, affitto…) in questa richiesta</label>
          <small>L&apos;Analista non ti dice cosa scegliere: ti propone cosa guardare. All&apos;AI va il testo{cxUse ? ", più le tue priorità generali e il contesto spuntato" : ""}. {eco ? "Le cifre in € vengono inviate." : "Gli importi vengono oscurati prima dell'invio (in cifre e nelle forme comuni in lettere, come «quarantamila euro»): li inserisci tu dopo."}</small>
        </div>

        <div className="card stack">
          <h3 style={{ margin: 0 }}>Il quadro</h3>
          {!draft ? (
            <div className="empty">
              Qui l&apos;Analista ti mostra: il tipo di scelta, le alternative con pro e contro, gli aspetti da valutare con il perché, una prima bozza di quanto contano. Se gli manca qualcosa, ti fa due o tre domande.
            </div>
          ) : (
            <>
              <div className="row">
                <input value={draft.name} onChange={(x) => setDraft({ ...draft, name: x.target.value })} style={{ fontWeight: 600, flex: 1 }} aria-label="Titolo" />
                {draft.model.tipo && <span className="pill teal">{TIPO[draft.model.tipo] ?? draft.model.tipo}</span>}
              </div>
              {draft.model.nota && <div className="note"><Info size={14} /> {draft.model.nota}</div>}

              {draft.questions.length > 0 && (
                <div className={`stack qbox ${draft.serve ? "must" : ""}`}>
                  <strong className="row" style={{ gap: 6 }}><HelpCircle size={16} /> {draft.serve ? "Prima di continuare, mi servono queste risposte" : "Per un quadro più preciso"}</strong>
                  {draft.questions.map((q, i) => (
                    <div key={q}><label className="f">{q}</label><input value={ans[i] ?? ""} onChange={(x) => { const a = [...ans]; a[i] = x.target.value; setAns(a); }} /></div>
                  ))}
                  <button className="btn sm" disabled={busy || !ans.some((a) => a?.trim())} onClick={struttura}><RefreshCw size={14} /> Aggiorna il quadro con le risposte</button>
                </div>
              )}

              <div>
                <label className="f">Le strade possibili (non solo sì o no), con pro e contro</label>
                <div className="stack" style={{ gap: 8 }}>
                  {draft.model.options.map((o) => (
                    <div key={o.id} className="altbox">
                      <div className="row between" style={{ flexWrap: "nowrap" }}>
                        <input value={o.name} onChange={(x) => edit((m) => { m.options.find((y) => y.id === o.id)!.name = x.target.value; })} style={{ fontWeight: 600 }} />
                        {o.kd && o.kd !== "base" && <span className="pill teal" style={{ flex: "none" }}>{PLAN_L[o.kd]}</span>}
                        <button className="iconbtn" title="Togli" onClick={() => edit((m) => { m.options = m.options.filter((y) => y.id !== o.id); })}><X size={15} /></button>
                      </div>
                      <div className="pc">
                        <ul className="pro">{(o.pro ?? []).map((p) => <li key={p}><ThumbsUp size={13} /> {p}</li>)}</ul>
                        <ul className="con">{(o.con ?? []).map((p) => <li key={p}><ThumbsDown size={13} /> {p}</li>)}</ul>
                      </div>
                      {((o.tl ?? []).length > 0 || (o.cond ?? []).length > 0) && (
                        <small className="muted" style={{ display: "block", marginTop: 4 }}>
                          {(o.tl ?? []).length ? `${o.tl!.length} conseguenze nel tempo` : ""}{(o.tl ?? []).length && (o.cond ?? []).length ? " · " : ""}
                          {(o.cond ?? []).length ? `solo se: ${o.cond!.slice(0, 2).map((c) => c.t).join("; ")}${o.cond!.length > 2 ? "…" : ""}` : ""}
                        </small>
                      )}
                    </div>
                  ))}
                </div>
                <small>Pro e contro sono spunti dal tuo racconto e dal buon senso: verificali, non sono fatti.</small>
              </div>

              <div>
                <label className="f">Cosa valutare e quanto conta (bozza dalle tue priorità)</label>
                {draft.model.criteria.map((c, i) => (
                  <div key={c.id} className="critrow">
                    <div style={{ minWidth: 0 }}>
                      <b>{c.name}</b> <small>{c.kind === "num" ? `· cifra in ${c.unit}` : "· giudizio"} · {w[i]}%</small>
                      {c.why && <div className="muted" style={{ fontSize: 13 }}>{c.why}</div>}
                    </div>
                    <div className="dots sm">
                      {[1, 2, 3, 4, 5].map((n) => <button key={n} className={(c.imp ?? 3) >= n ? "on" : ""} aria-label={`${c.name} importanza ${n}`} onClick={() => edit((m) => { m.criteria[i].imp = n; })}>{n}</button>)}
                    </div>
                  </div>
                ))}
              </div>
              {draft.model.constraints.length ? <div><label className="f">Limiti che hai indicato</label>{draft.model.constraints.map((k) => <div key={k.id} style={{ fontSize: 14 }}>• {k.name}</div>)}</div> : null}
              {draft.model.assumptions!.length ? (
                <div><label className="f">Da verificare</label>
                  {draft.model.assumptions!.map((a) => <div key={a.id} className="row between" style={{ fontSize: 14, flexWrap: "nowrap" }}><span>{a.t}</span><span className={`pill ${REL[a.rel][0]}`}>{REL[a.rel][1]}</span></div>)}</div>
              ) : null}
              <button className="btn pri" disabled={busy} onClick={() => crea(draft.model, draft.name)}>Conferma e apri il modello</button>
              <small style={{ display: "block" }}>Dopo potrai cambiare tutto: alternative, criteri, importanze. I valori proposti dall&apos;AI sono marcati come «stima».</small>
            </>
          )}
        </div>
      </div>

      <div className="card stack" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0 }}>Oppure parti da un modello</h3>
        <small>Alternative e criteri tipici già pronti, con l&apos;importanza presa dalle tue priorità. Senza valori: li metti tu.</small>
        <div className="tplgrid">
          {TEMPLATES.map((tp) => (
            <button key={tp.k} className="tpl" disabled={busy} onClick={() => fromTpl(tp)}>
              <span className="iconwrap t">{TI[tp.icon]}</span>
              <span><b>{tp.t}</b><small>{tp.d}</small></span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
