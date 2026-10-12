"use client";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { execPlan, type PlanItem } from "@/lib/execution";
import { monitorOf, watchState } from "@/lib/monitor";
import { aiContext } from "@/lib/context";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, CheckCircle2, AlertTriangle, XCircle, ThumbsUp, ThumbsDown, Square } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { ScoreBars, LineChart, Legend, PAL } from "@/components/charts";
import {
  analyzeDecision, biasChecks, conclusive, cashBreakpoint, cashSeries, crossEffects, eur, fmt, hashOf, normalize, solidity, tradeoff, turningPoints,
  LEVELS, SCEN, type Scen, untestedText, TIPO_L, evidenceOf, infoValue, readiness, focus, stopText, fallbackText, oddScenario, invertedScenario, contiDelta, saldo, isOut, OPT_ST, riskViews, riskSummary, phasesOf, snapPhase, customRes, PLAN_L } from "@/lib/engine";
import { actionPlan, briefing, consequences, projection, valueText, HZ } from "@/lib/narrative";
import { compact } from "@/lib/ai";
import { PRI } from "@/lib/priorities";
import { BP } from "@/lib/bp";

const TONE = { ok: <CheckCircle2 size={15} />, warn: <AlertTriangle size={15} />, bad: <XCircle size={15} /> };
const SL: Record<Scen, string> = { sfavorevole: "Se va male", centrale: "Probabile", favorevole: "Se va bene" };
const REL: Record<string, string> = { F: "certo", D: "dichiarato", S: "stima" };
const TIPO = TIPO_L;

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const ws = useWs();
  const d = ws.decisions.find((x) => x.id === id);
  const R = ws.profile.resources, rules = ws.profile.rules;
  const others = ws.decisions.filter((x) => x.status === "aperta" && x.id !== id && x.model.options.length);
  const data = useMemo(() => {
    if (!d) return null;
    const res = analyzeDecision(d);
    const nm = normalize(d.model);
    const turns = turningPoints(d, res);
    const info = infoValue(d);
    return { res, nm, turns, concl: conclusive(d, res), trade: tradeoff(d, res), sol: solidity(d, res), bias: biasChecks(d, res), plan: actionPlan(d, res, turns, d.due),
      rd: readiness(d, res, R, rules, info), foc: focus(d, res, turns, info) };
  }, [d, R, rules]);
  // titolo della pagina = nome proposto per il PDF quando lo salvi
  useEffect(() => {
    if (!d) return;
    const prev = document.title;
    document.title = `Decision OS - ${d.name}`.replace(/[\\/:*?"<>|]/g, "");
    return () => { document.title = prev; };
  }, [d]);
  if (!d || !data) return <div className="empty">Decisione non trovata. <Link href="/app/decisioni">Torna all&apos;elenco</Link></div>;
  const { res, nm, turns, concl, trade, sol, bias, plan, rd, foc } = data;
  const pl = execPlan(d, rd);
  const mon = monitorOf(d);
  const ev = evidenceOf(d, res);
  const who = (x: PlanItem) => (x.who || x.due || x.blocked ? <small className="muted"> — {[x.who, x.due ? `entro il ${new Date(x.due).toLocaleDateString("it-IT")}` : "", x.blocked ? `dopo: ${x.blocked}` : ""].filter(Boolean).join(" · ")}{x.late ? " (in ritardo)" : ""}</small> : null);
  const ST: Record<string, string> = { "?": "da verificare", si: "verificata", no: "non soddisfatta" };
  const m = d.model;
  const ok = res.rows.filter((r) => !r.excluded.length);
  const top = ok[0];
  const missing = res.rows.reduce((a, r) => a + r.missing.length, 0);
  const mg = res.margin ?? 0;
  const gap = ok.length < 2 ? "è l'unica che rispetta i requisiti" : mg < 3 ? `è quasi alla pari con ${ok[1].name}` : mg < 10 ? `ha un vantaggio contenuto su ${ok[1].name}` : `ha un vantaggio netto su ${ok[1].name}`;
  const drivers = top ? top.detail.filter((x) => x.contrib).sort((a, b) => (b.contrib ?? 0) - (a.contrib ?? 0)).slice(0, 2).map((x) => x.name) : [];
  const today = new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  const contro = m.ai?.contro;
  const ctxStr = ws.profile.ai_share.contesto ? Object.entries(ws.profile.context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ") : undefined;
  // stessa impronta della pagina della decisione: include il contesto realmente inviato
  const controFresh = contro && contro.h === hashOf(compact(d, res, { eco: ws.profile.ai_share.economia, res: R, ...aiContext(ws.vault, d, { consent: m.cxAi ?? ws.profile.ai_share.contesto, eco: ws.profile.ai_share.economia, profile: ws.profile.context }) }));
  const cashRule = rules.find((r) => r.r === "cash_end" && r.min != null);
  const series = m.options.flatMap((o, i) => {
    const p = projection(o, R, rules);
    const res24 = (sc: Scen) => {
      const st = p.find((x) => x.h === 24)!.s[sc].res;
      return cashSeries(st, 24);
    };
    return [{ name: o.name, color: PAL[i % PAL.length], data: res24("centrale") }, { name: `${o.name} (se va male)`, color: PAL[i % PAL.length], data: res24("sfavorevole"), dash: true }];
  });
  const hasMoney = m.options.some((o) => (o.impacts ?? []).length);
  let n = 0;
  const H = ({ t }: { t: string }) => <h2 className="rh"><span>{++n}</span>{t}</h2>;

  return (
    <div className="rep-wrap">
      <div className="rep-bar noprint">
        <Link href={`/app/decisioni/${d.id}`} className="btn sm"><ArrowLeft size={15} /> Torna alla decisione</Link>
        <button className="btn pri sm" onClick={() => window.print()}><Printer size={15} /> Scarica PDF</button>
        <small>Nella finestra di stampa: destinazione «Salva come PDF», attiva «Grafica di sfondo», disattiva «Intestazioni e piè di pagina».</small>
      </div>

      <article className="rep">
        <header className="rep-cover">
          <div className="row between" style={{ alignItems: "flex-start" }}>
            <div>
              <div className="rep-kicker">Decision OS · Report decisionale</div>
              <h1>{d.name}</h1>
              <div className="rep-meta">
                <span>{today}</span>
                {m.tipo && <span>{TIPO[m.tipo] ?? m.tipo}</span>}
                <span>Stato: {d.status}</span>
                {d.due && <span>Da decidere entro il {new Date(d.due).toLocaleDateString("it-IT")}</span>}
              </div>
            </div>
            <img src={`${BP}/brand/mark.png`} alt="" style={{ height: 46 }} />
          </div>
        </header>

        {/* SINTESI: decisione condizionata */}
        <section className={`rep-sum ${rd.state}`}>
          <div className="rep-kicker">Decisione</div>
          <p className="rep-state">{rd.state === "pronta" ? "Pronta" : rd.state === "non_pronta" ? "Non ancora pronta" : rd.state === "nessuna" ? "Nessuna strada regge" : "Da impostare"}</p>
          {rd.state === "non_pronta" && rd.lead && (
            <>
              {rd.open.some((c) => c.grp === "cond") ? <>
                <p className="big">«{rd.lead.name}» è potenzialmente la strada migliore per le priorità indicate, <b>ma solo se</b>:</p>
                <div className="rep-cgrp">Condizioni perché la strada regga</div>
                <ol className="rep-conds">{rd.open.filter((c) => c.grp === "cond").map((c) => <li key={c.key}>{c.t}{c.gate ? <b> (vincolante)</b> : null}</li>)}</ol>
                {rd.fallback && <p>{fallbackText(rd)}</p>}
              </> : <p className="big">«{rd.lead.name}» è in testa, ma l&apos;analisi non è ancora abbastanza affidabile per decidere.</p>}
              {rd.open.some((c) => c.grp === "chiarire") && <>
                <div className="rep-cgrp">Cose da chiarire prima di decidere</div>
                <ul className="rep-conds">{rd.open.filter((c) => c.grp === "chiarire").map((c) => <li key={c.key}>{c.t}</li>)}</ul>
              </>}
            </>
          )}
          {rd.state === "pronta" && rd.lead && <p className="big">Con i dati di oggi la strada che rispetta meglio le priorità indicate è <b>{rd.lead.name}</b>{rd.done.length ? ", con le sue condizioni verificate" : ""}. Nessun dato incerto può ribaltarla.</p>}
          {rd.state === "nessuna" && <p className="big">Nessuna strada rispetta i requisiti e le condizioni vincolanti fissate.</p>}
          {rd.state === "vuota" && <p className="big">Servono almeno due strade e un criterio per un&apos;analisi.</p>}
          <dl>
            {foc && <><dt>La scelta vera</dt><dd>{foc.trade}</dd></>}
            {rd.dilemma && <><dt>Strade mancanti</dt><dd>{rd.dilemma.msg} Da considerare: {rd.dilemma.sugg.map((x) => `«${x.name}»`).join(", ")}.</dd></>}
            {foc && foc.calm.length > 0 && <><dt>Non cambia la scelta</dt><dd>{foc.calm.map((x) => `«${x.critName}» di ${x.optName}`).join(", ")}: qualunque valore plausibile abbiano.</dd></>}
            {rd.failed.length > 0 && <><dt>Non soddisfatte</dt><dd>{rd.failed.map((c) => c.t).join("; ")}.</dd></>}
            {rd.wait && (rd.wait.m > 0 || rd.wait.exp.length > 0 || rd.wait.left != null || rd.wait.over != null) && <><dt>Costo dell&apos;attesa</dt><dd>{rd.wait.over != null ? `La data che ti eri dato è passata da ${rd.wait.over} ${rd.wait.over === 1 ? "giorno" : "giorni"}. ` : ""}{rd.wait.left != null ? (rd.wait.left === 0 ? "Scade oggi. " : `Restano ${rd.wait.left} ${rd.wait.left === 1 ? "giorno" : "giorni"}. `) : ""}{rd.wait.m > 0 ? `Aspettare costa circa ${eur(rd.wait.c30)} al mese (${eur(rd.wait.c7)} a 7 giorni, ${eur(rd.wait.c90)} a 90). ` : ""}{rd.wait.exp.map((x) => `«${x.name}» scade tra ${x.days} giorni. `).join("")}{rd.wait.t ?? ""}</dd></>}
            {rd.done.length > 0 && <><dt>Già verificate</dt><dd>{rd.done.map((c) => c.t).join("; ")}.</dd></>}
          </dl>
          <p className="rep-note">Questo report non decide al posto tuo: dice a quali condizioni una strada regge, cosa verificare prima e in che ordine. Il punteggio è solo una parte dell&apos;analisi (sezione «Il confronto»).</p>
        </section>

        {/* PREMESSA */}
        <section className="rsec">
          <H t="Premessa" />
          <h3>La situazione</h3>
          <p>{d.descr?.trim() || "Nessuna descrizione inserita."}</p>
          {m.nota && <p className="rep-callout"><b>Nota dell&apos;Analista:</b> {m.nota}</p>}
          <div className="rep-grid2">
            <div>
              <h3>Cosa stai decidendo</h3>
              <ul>{m.options.map((o) => <li key={o.id}><b>{o.name}</b>{o.note ? ` — ${o.note}` : ""}</li>)}</ul>
              {m.closed && <p className="rep-callout">Il {new Date(m.closed.at).toLocaleDateString("it-IT")} hai dichiarato che non esistono altre strade realisticamente perseguibili.</p>}
              {((m.scartate ?? []).length > 0 || m.options.some(isOut)) && <><h3>Strade considerate e scartate</h3><ul>
                {m.options.filter(isOut).map((x) => <li key={x.id}>{x.name} ({OPT_ST[x.st!].toLowerCase()}{x.stAt ? `, ${new Date(x.stAt).toLocaleDateString("it-IT")}` : ""}){x.stWhy ? ` — ${x.stWhy}` : " — senza motivo indicato"}</li>)}
                {(m.scartate ?? []).map((x, k) => <li key={k}>{x.name}{x.why ? ` — ${x.why}` : " — senza motivo indicato"}</li>)}</ul></>}
            </div>
            <div>
              <h3>Il tuo punto di partenza</h3>
              <ul>
                <li>Risparmi disponibili: <b>{eur(R.cash0 ?? 0)}</b></li>
                <li>Margine mensile attuale: <b>{eur(R.cash_m ?? 0)}</b></li>
                <li>Ore libere a settimana: <b>{fmt(R.hours_w ?? 0)}</b></li>
                {customRes(R, ws.profile.resources_meta).map((k) => <li key={k}>{ws.profile.resources_meta[k]?.l}: <b>{fmt(R[k] ?? 0)}{ws.profile.resources_meta[k]?.u ? ` ${ws.profile.resources_meta[k]?.u}` : ""}</b></li>)}
                {rules.map((r) => <li key={r.id}>Limite: {r.name}{r.min != null ? ` ≥ ${fmt(r.min)}` : ""}{r.max != null ? ` ≤ ${fmt(r.max)}` : ""}</li>)}
              </ul>
            </div>
          </div>
          <h3>Le tue priorità generali in questa fase</h3>
          <div className="rep-pri">{Object.keys(PRI).map((k) => <span key={k}>{PRI[k].l} <b>{ws.profile.priorities[k] ?? 3}/5</b></span>)}</div>
        </section>

        {/* PIANO OPERATIVO */}
        {(pl.prima.length > 0 || pl.dopo.length > 0 || pl.fatti.length > 0) && (
          <section className="rsec">
            <H t="Piano operativo" />
            {pl.prima.length > 0 && <><h3>Prima di decidere, in quest&apos;ordine</h3>
            <ol className="rep-steps">
              {pl.prima.map((x) => <li key={x.key}><Square size={14} /> <span><b>{x.t}</b>{who(x)}{x.why ? <><br /><small className="muted">Serve per: {x.why}</small></> : null}{x.stop && <><br /><small className="rep-stop">{x.stop}</small></>}</span></li>)}
              <li><Square size={14} /> <span><b>Poi aggiorna i dati in Decision OS:</b> il risultato si ricalcola e ti dice se la decisione è pronta.</span></li>
            </ol></>}
            {pl.dopo.length > 0 && <><h3>Dopo la scelta: attuazione</h3>
            <ol className="rep-steps">{pl.dopo.map((x) => <li key={x.key}><Square size={14} /> <span><b>{x.t}</b>{who(x)}</span></li>)}</ol></>}
            {pl.fatti.length > 0 && <><h3>Già fatti</h3>
            <ul className="rep-steps">{pl.fatti.map((x) => <li key={x.key}>✓ <span>{x.t} <small className="muted">· {new Date(x.done!).toLocaleDateString("it-IT")}{x.who ? ` · ${x.who}` : ""}</small></span></li>)}</ul></>}
          </section>
        )}

        {/* EVIDENZE */}
        {ev && (
          <section className="rsec">
            <H t="Su cosa poggia" />
            <p>{ev.text}</p>
            <table className="rt"><thead><tr><th>Dato</th><th>Valore</th><th>Peso</th><th>Prova</th></tr></thead>
              <tbody>{ev.items.map((x) => <tr key={x.crit}><td>{x.name}</td><td>{x.val}</td><td>{x.share}%</td>
                <td>{x.rel === "F" ? "verificato" : x.rel === "D" ? "dichiarato" : x.rel === "S" ? (x.ai ? "stima AI" : "stima") : "senza fonte"}{[x.src, x.dt ? `del ${new Date(x.dt).toLocaleDateString("it-IT")}` : "", x.doc, x.until ? `${x.expired ? "scaduto" : "valido"} fino al ${new Date(x.until).toLocaleDateString("it-IT")}` : "", x.old ? `rilevato ${x.age} giorni fa` : ""].filter(Boolean).map((t) => " · " + t).join("")}</td></tr>)}</tbody></table>
          </section>
        )}

        {/* MONITORAGGIO */}
        {(m.watch?.length || m.reopened?.length) ? (
          <section className="rsec">
            <H t="Questa scelta regge finché…" />
            {mon && <p><b>{mon.state === "rivedere" ? "Da rivedere: un presupposto non è più vero." : "In osservazione."}</b></p>}
            <ul className="rep-steps">{(m.watch ?? []).map((w) => { const s = watchState(w); return <li key={w.id}>{s.hit ? "✗" : "○"} <span>{w.t} <small className="muted">· {s.hit ? "scattata" : s.last ? `ultimo controllo ${new Date(s.last.at).toLocaleDateString("it-IT")}` : "mai controllata"}{!s.hit ? `, prossimo ${new Date(s.next).toLocaleDateString("it-IT")}` : ""}</small></span></li>; })}</ul>
            {m.reopened?.length ? <p className="muted">Riaperta: {m.reopened.map((x) => `${new Date(x.at).toLocaleDateString("it-IT")} (${x.why})`).join("; ")}.</p> : null}
          </section>
        ) : null}

        {/* CONSEGUENZE NEL TEMPO */}
        <section className="rsec">
          <H t="Se scegli questa strada, cosa succede dopo" />
          {!m.options.some((o) => (o.tl ?? []).length || (o.cond ?? []).length) && <p className="muted">Le conseguenze nel tempo non sono ancora state descritte (passo «Conseguenze»).</p>}
          {m.options.map((o, i) => { const b = briefing(d, res, o, R, rules); return (
            <div key={o.id} className="rep-alt">
              <h3 style={{ margin: 0 }}><span className="optbadge sm" style={{ background: PAL[i % PAL.length] }}>{String.fromCharCode(65 + i)}</span> Se scegli «{o.name}»{o.kd && o.kd !== "base" ? <small className="muted"> · {PLAN_L[o.kd]}</small> : null}</h3>
              {(b.watch.length > 0 || b.plus.length > 0) && (
                <div className="rep-grid2" style={{ marginTop: 6 }}>
                  <div><b className="rep-con">Tieni conto di</b><ul>{b.watch.map((x, k) => <li key={k}>{x}</li>)}{!b.watch.length && <li className="muted">—</li>}</ul></div>
                  <div><b className="rep-pro">Però hai anche</b><ul>{b.plus.map((x, k) => <li key={k}>{x}</li>)}{!b.plus.length && <li className="muted">—</li>}</ul></div>
                </div>
              )}
              {(o.tl ?? []).length > 0 && (
                <div className="rep-tl">
                  {phasesOf(m).map((ph) => { const its = (o.tl ?? []).filter((x) => snapPhase(phasesOf(m), x.h).h === ph.h); return (
                    <div key={ph.h}><b>{ph.l}</b><ul>{its.map((x, k) => <li key={k}>{x.t}{x.src === "ai" ? <span className="aitag">AI</span> : null}</li>)}{!its.length && <li className="muted">—</li>}</ul></div>); })}
                </div>
              )}
              <div className="rep-grid2">
                {(o.cond ?? []).length > 0 && <div><b>Ha senso solo se</b><ul>{(o.cond ?? []).map((c) => <li key={c.id}>{c.t} <small className="muted">({ST[c.st]}{c.gate ? ", vincolante" : ""})</small></li>)}</ul></div>}
                {(o.next ?? []).length > 0 && <div><b>Ti costringe a decidere poi</b><ul>{(o.next ?? []).map((x) => <li key={x}>{x}</li>)}</ul></div>}
              </div>
            </div>
          ); })}
        </section>

        {/* RISCHI */}
        <section className="rsec">
          <H t="Rischi: cosa può andare storto e quanto costa" />
          {!m.options.some((o) => (o.risks ?? []).length) ? <p className="muted">Nessun rischio indicato (passo «Conseguenze»). Senza registro dei rischi le strade sembrano più sicure di quanto sono.</p> : (
            <>
              <table className="rt">
                <thead><tr><th>Strada</th><th>Rischi</th><th>Rischio peggiore, se succede</th><th>Costo pesato</th><th>Oltre i limiti</th></tr></thead>
                <tbody>{riskSummary(d, R, rules).map((x) => (
                  <tr key={x.id}><td><b>{x.name}</b></td><td>{x.n ? `${x.n}${x.alte ? ` (${x.alte} alti)` : ""}` : "nessuno indicato"}</td>
                    <td>{x.worst ? `${x.worst.t}${x.worst.tot ? ` · ${eur(x.worst.tot)}` : ""}` : "—"}</td><td className="num">{x.n ? eur(x.pesato) : "—"}</td><td>{x.n ? (x.rompe ? `sì (${x.rompe})` : "no") : "—"}</td></tr>
                ))}</tbody>
              </table>
              <p className="rep-note2">Costo pesato = somma degli impatti × peso convenzionale della probabilità (bassa 10%, media 30%, alta 60%): un ordine di grandezza per confrontare le strade, non una previsione.</p>
              {m.options.filter((o) => (o.risks ?? []).length).map((o) => (
                <div key={o.id} style={{ marginTop: 8 }}>
                  <b>{o.name}</b>
                  <ul className="rep-risks">{riskViews(o, R, rules).map((r) => (
                    <li key={r.id} className={`p-${r.p}`}><span className="rp">{r.p}</span> <span><b>{r.t}</b>{r.src === "ai" ? <span className="aitag">AI</span> : null}
                      {r.tot ? <> — se succede {eur(r.tot)}{r.endAfter != null ? `, a 12 mesi resteresti con ${eur(r.endAfter)}` : ""}</> : <span className="muted"> — impatto in € non indicato</span>}
                      {r.breaks.length ? <><br /><small className="rep-stop">Oltre i tuoi limiti: {r.breaks.join("; ")}</small></> : null}
                      {r.x ? <><br /><small>Contromisura: {r.x}</small></> : r.p !== "bassa" ? <><br /><small className="muted">Nessuna contromisura indicata</small></> : null}</span></li>
                  ))}</ul>
                </div>
              ))}
            </>
          )}
        </section>

        {/* ALTERNATIVE */}
        <section className="rsec">
          <H t="Pro, contro e cosa comporterebbero in cifre" />
          {m.options.map((o, i) => {
            const row = res.rows.find((x) => x.id === o.id)!;
            const cons = consequences(d, res, o, others, ws.deps, R, rules);
            return (
              <div key={o.id} className="rep-alt">
                <div className="row between" style={{ flexWrap: "nowrap" }}>
                  <h3 style={{ margin: 0 }}><span className="optbadge sm" style={{ background: PAL[i % PAL.length] }}>{String.fromCharCode(65 + i)}</span> {o.name}</h3>
                  <span className={`pill ${row.excluded.length ? "bad" : row.id === top?.id ? "ok" : "info"}`}>{row.excluded.length ? "scartata" : `${fmt(row.score)} punti${row.id === top?.id ? " · prima" : ""}`}</span>
                </div>
                {o.note && <p className="muted" style={{ margin: "4px 0 0" }}>{o.note}</p>}
                {(o.pro?.length || o.con?.length) ? (
                  <div className="rep-grid2" style={{ marginTop: 8 }}>
                    <div><b className="rep-pro"><ThumbsUp size={14} /> A favore</b><ul>{(o.pro ?? []).map((x) => <li key={x}>{x}</li>)}{!o.pro?.length && <li className="muted">—</li>}</ul></div>
                    <div><b className="rep-con"><ThumbsDown size={14} /> Contro</b><ul>{(o.con ?? []).map((x) => <li key={x}>{x}</li>)}{!o.con?.length && <li className="muted">—</li>}</ul></div>
                  </div>
                ) : null}
                <b style={{ display: "block", marginTop: 8 }}>Cosa comporterebbe</b>
                <ul className="rep-cons">{cons.map((c, j) => <li key={j} className={c.tone}>{TONE[c.tone]} <span>{c.t}</span></li>)}</ul>
              </div>
            );
          })}
        </section>

        {/* CRITERI */}
        <section className="rsec">
          <H t="Cosa conta e come è stato misurato" />
          <table className="rt">
            <thead><tr><th>Aspetto</th><th>Perché conta</th><th>Misura</th><th>Importanza</th><th>Peso</th><th>Requisito</th></tr></thead>
            <tbody>{nm.criteria.map((c) => {
              const k = m.constraints.find((x) => x.crit === c.id);
              const kv = (v: number) => (c.kind === "num" ? `${fmt(v)} ${c.unit ?? ""}` : c.kind === "g" ? LEVELS[Math.round(v / 25)] : fmt(v));
              return (
                <tr key={c.id}>
                  <td><b>{c.name}</b></td><td>{c.why || <span className="muted">—</span>}</td>
                  <td>{c.kind === "num" ? `${c.unit ?? ""}: pessimo ${fmt(c.worst ?? 0)}, ottimo ${fmt(c.best ?? 0)}` : c.kind === "g" ? "Giudizio" : "Punteggio 0-100"}</td>
                  <td className="num">{c.imp ? "●".repeat(c.imp) : "—"}</td><td className="num">{c.w}%</td>
                  <td>{k ? `${k.min != null ? "almeno " + kv(k.min) : ""}${k.max != null ? "al massimo " + kv(k.max) : ""}` : "—"}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </section>

        {/* CONFRONTO */}
        <section className="rsec">
          <H t="Il confronto (punteggio)" />
          <table className="rt">
            <thead><tr><th>Aspetto</th>{m.options.map((o) => <th key={o.id}>{o.name}</th>)}</tr></thead>
            <tbody>
              {nm.criteria.map((c) => (
                <tr key={c.id}><td><b>{c.name}</b> <span className="muted">{c.w}%</span></td>
                  {m.options.map((o) => { const rel = o.m?.[c.id]?.rel; return <td key={o.id}>{valueText(c, o)} {rel && REL[rel] ? <small className="muted">({REL[rel]})</small> : null}</td>; })}</tr>
              ))}
              <tr className="tot"><td>Punteggio</td>{m.options.map((o) => { const r = res.rows.find((x) => x.id === o.id)!; return <td key={o.id}>{r.excluded.length ? "scartata" : fmt(r.score)}{r.range ? ` (${fmt(r.range[0])}–${fmt(r.range[1])})` : ""}</td>; })}</tr>
            </tbody>
          </table>
          <div style={{ marginTop: 12 }}><ScoreBars rows={res.rows} reasons provisional={!concl.ok} /></div>
        </section>

        {/* SCAMBIO */}
        {trade && (
          <section className="rsec">
            <H t={`${trade.a} rispetto a ${trade.b}`} />
            <div className="rep-grid3">
              <div className="rep-box g"><b>Guadagni</b><ul>{trade.gains.map((x) => <li key={x}>{x}</li>)}{!trade.gains.length && <li>Nessun vantaggio netto.</li>}</ul></div>
              <div className="rep-box l"><b>Rinunci a</b><ul>{trade.losses.map((x) => <li key={x}>{x}</li>)}{!trade.losses.length && <li>Nulla: è uguale o migliore su ogni aspetto.</li>}</ul></div>
              <div className="rep-box r"><b>Rischi</b><ul>{trade.risks.map((x) => <li key={x}>{x}</li>)}{!trade.risks.length && <li>Nessun rischio evidente nei dati.</li>}</ul></div>
            </div>
          </section>
        )}

        {/* SCENARI */}
        <section className="rsec">
          <H t="Scenari: soldi e tempo nel tempo" />
          {!hasMoney ? <p className="muted">Non sono stati indicati effetti su soldi e tempo: inseriscili nel passo «Soldi e tempo» per vedere gli scenari.</p> : (
            <>
              {(m.oggi?.length || m.options.some((o) => o.conti?.length)) ? (
                <div className="rep-conti">
                  <h3>Da dove vengono le cifre: i conti</h3>
                  <div className="rep-grid2">
                    <div><b>Oggi, al mese</b><ul>{(m.oggi ?? []).map((l) => <li key={l.id}>{l.t}: {l.v == null ? <i>da inserire</i> : `${l.k === "e" ? "+" : "−"}${eur(l.v)}`} <small className="muted">({l.f === "S" ? "stima" : l.f === "F" ? "verificato" : "detto da te"}{l.src === "ai" ? ", proposto dall'AI" : ""})</small></li>)}{!m.oggi?.length && <li className="muted">—</li>}</ul>
                      <small>Saldo: {eur(saldo(m.oggi ?? [])[1])}/mese</small></div>
                    {m.options.filter((o) => o.conti?.length).map((o) => { const cd = contiDelta(o, m.oggi ?? [])!; return (
                      <div key={o.id}><b>Con «{o.name}»</b><ul>{o.conti!.filter((l) => !l.from || (m.oggi ?? []).find((x) => x.id === l.from)?.v !== l.v).map((l) => <li key={l.id}>{l.t}: {l.v == null ? <i>da inserire</i> : `${l.k === "e" ? "+" : "−"}${eur(l.v)}${l.u ? " una tantum" : ""}`} <small className="muted">({l.f === "S" ? "stima" : l.f === "F" ? "verificato" : "detto da te"})</small></li>)}</ul>
                        <small>Il resto come oggi. Differenza: {cd.delta[1] >= 0 ? "+" : ""}{eur(cd.delta[1])}/mese (se va male {eur(cd.delta[0])}, se va bene {eur(cd.delta[2])}){cd.missing.length ? ` · mancano: ${cd.missing.join(", ")}` : ""}.</small></div>); })}
                  </div>
                </div>
              ) : null}
              <p>Risparmi a fine periodo per ogni alternativa, nei tre scenari. Proiezione lineare (risparmi di oggi + differenza mensile × mesi), senza probabilità: «se va male» e «se va bene» sono ipotesi, non previsioni.</p>
              {m.options.filter((o) => invertedScenario(o)).map((o) => <p key={"iv" + o.id} className="rep-callout warn"><b>Attenzione su {o.name}:</b> «se va male» è migliore di «se va bene» nella differenza mensile: probabilmente sono spese scritte senza il segno −. Le cifre di questa strada sono rovesciate e vanno corrette prima di usarle.</p>)}
              {m.options.filter((o) => oddScenario(o)).map((o) => { const od = oddScenario(o)!; return <p key={o.id} className="rep-callout warn"><b>Attenzione su {o.name}:</b> «se va male» ({eur(od.sf)}/mese) è lontano dal probabile ({eur(od.c)}/mese) e cambia segno. Descrive un altro evento, come perdere lo stipendio, non la stessa strada andata peggio: la colonna «Se va male» di questa strada non è affidabile.</p>; })}
              {m.options.some((o) => (o.impacts ?? []).some((i) => i.src === "ai")) && <p className="rep-callout">Contiene importi stimati dall&apos;AI e non confermati ({m.options.filter((o) => (o.impacts ?? []).some((i) => i.src === "ai")).map((o) => `«${o.name}»`).join(", ")}): trattali come ipotesi da verificare.</p>}
              <table className="rt">
                <thead><tr><th>Alternativa</th><th>Periodo</th>{SCEN.map((s) => <th key={s}>{SL[s]}</th>)}<th>Ore libere</th></tr></thead>
                <tbody>{m.options.flatMap((o) => { const ai = (o.impacts ?? []).some((i) => i.src === "ai"); const T = ai ? <span className="aitag" title="Importi stimati dall'AI, non confermati">AI</span> : null; return projection(o, R, rules).map((p, j) => (
                  <tr key={o.id + p.h} className={j === 0 ? "first" : ""}>
                    <td>{j === 0 ? <><b>{o.name}</b>{T}</> : ""}</td><td>{p.h} mesi</td>
                    {SCEN.map((s) => <td key={s} className={`num ${p.s[s].viol.length ? "neg" : ""}`}>{eur(p.s[s].res.cash_end ?? 0)}{T}</td>)}
                    <td className="num">{fmt(p.s.centrale.res.hours_w ?? 0)} h{(o.impacts ?? []).some((i) => i.r === "hours_w" && i.src === "ai") ? T : null}</td>
                  </tr>
                )); })}</tbody>
              </table>
              <div className="rep-chart">
                <Legend items={m.options.map((o, i) => ({ name: o.name + ((o.impacts ?? []).some((x) => x.src === "ai") ? " (stima AI)" : ""), color: PAL[i % PAL.length] }))} />
                <LineChart series={series} threshold={cashRule ? { v: cashRule.min!, label: cashRule.name } : undefined} xLabel={(i) => (i === 0 ? "oggi" : `${i}m`)} yFmt={(v) => fmt(v / 1000) + "k"} height={230} />
                <small className="muted">Linea piena: scenario probabile. Tratteggio: se va male. In rosso il tuo limite di sicurezza.</small>
              </div>
              <h3>Quando cambiare piano</h3>
              <ul>{m.options.map((o) => {
                const st = projection(o, R, rules).find((x) => x.h === 24)!.s;
                const bp = cashBreakpoint({ cash0: st.centrale.res.cash0 }, rules, 24);
                return <li key={o.id}><b>{o.name}</b>: {bp == null ? "nessun limite di sicurezza impostato" : bp < 0 ? `regge finché non perdi più di ${eur(-bp)} al mese rispetto a oggi` : `rivedi il piano se ogni mese ti restano meno di ${eur(bp)} in più rispetto a oggi`}{st.sfavorevole.viol.length ? `; se va male: ${st.sfavorevole.viol[0]}` : "; regge anche se va male"}.</li>;
              })}</ul>
            </>
          )}
        </section>

        {/* EFFETTI */}
        <section className="rsec">
          <H t="Effetti sulle altre decisioni" />
          {!others.length ? <p className="muted">Nessun&apos;altra decisione aperta al momento del report.</p> : m.options.map((o) => {
            const cx = crossEffects(o.id, d, others, ws.deps, R, rules, 12);
            return (
              <div key={o.id} style={{ marginBottom: 8 }}>
                <b>Se scegli {o.name}:</b>
                <ul>{cx.map((x) => {
                  const no = x.rows.filter((r) => !r.ok && r.why[0] !== "già scartata nella sua decisione");
                  return <li key={x.dec}>«{x.name}»: {no.length ? <>diventano impossibili {no.map((r) => `${r.name} (${r.why[0]})`).join("; ")}</> : "tutte le opzioni restano possibili"}</li>;
                })}</ul>
              </div>
            );
          })}
        </section>

        {/* FIDUCIA */}
        <section className="rsec">
          <H t="Quanto fidarsi di questo risultato" />
          {sol && (
            <>
              <div className="solbar" style={{ maxWidth: "100%" }}><span className="f" style={{ width: `${100 - sol.estShare - sol.unkShare}%` }} /><span className="s" style={{ width: `${sol.estShare}%` }} /><span className="u" style={{ width: `${sol.unkShare}%` }} /></div>
              <p>Punteggio di {top?.name}: <b>{100 - sol.estShare - sol.unkShare}%</b> su dati certi o dichiarati, <b>{sol.estShare}%</b> su stime, <b>{sol.unkShare}%</b> senza fonte. {!sol.tested ? untestedText(sol) : sol.holds ? `Prova di stress superata: con le stime sbagliate del ${sol.pct * 100}% a suo sfavore resta prima.` : `Prova di stress non superata: con le stime sbagliate del ${sol.pct * 100}% vincerebbe ${sol.newTop}.`}</p>
            </>
          )}
          {res.fragile.length > 0 && <p><b>Sensibilità:</b> la classifica cambia con piccole variazioni di importanza su {res.fragile.map((f) => `«${f.name}»`).join(" e ")}.</p>}
          <h3>Testa o pancia?</h3>
          {bias.length ? <ul>{bias.map((b) => <li key={b.k}>{b.t}</li>)}</ul> : <p>Nessun segnale che il risultato sia stato spinto verso una preferenza.</p>}
        </section>

        {/* SVOLTA + CONTRARIO */}
        <section className="rsec">
          <H t="Cosa ti farebbe cambiare idea" />
          {missing ? <p className="muted">Completa i valori mancanti per calcolare le soglie.</p> : turns.length ? <ul>{turns.map((t) => <li key={t.crit}>{t.text}</li>)}</ul> : <p>Nessun singolo valore, da solo, ribalta la classifica.</p>}
          {contro && (
            <>
              <h3>Il parere contrario dell&apos;Analista</h3>
              <ul>{contro.p.map((x, i) => <li key={i}>{x}</li>)}</ul>
              {contro.c && <p className="rep-callout">{contro.c}</p>}
              <small className="muted">Generato il {new Date(contro.at).toLocaleDateString("it-IT")}{controFresh ? "" : " — i dati sono cambiati da allora"}.</small>
            </>
          )}
        </section>

        {/* PIANO */}
        <section className="rsec">
          <H t="Altre verifiche e data della decisione" />
          <ul className="rep-check">{plan.map((p, i) => <li key={i}><Square size={15} /> <span>{p}</span></li>)}</ul>
          {(m.assumptions ?? []).filter((a) => a.rel !== "?").length > 0 && (
            <>
              <h3>Dati già chiariti</h3>
              <ul>{(m.assumptions ?? []).filter((a) => a.rel !== "?").map((a) => <li key={a.id}>{a.t}</li>)}</ul>
            </>
          )}
        </section>

        <footer className="rep-foot">
          <b>Come è stato calcolato.</b> Ogni valore è portato su una scala da pessimo (0) a ottimo (100) definita da te; il punteggio è la media pesata con l&apos;importanza che hai dato a ciascun aspetto. Misura quanto un&apos;alternativa rispetta le tue priorità, non la probabilità che sia giusta. Scenari, soglie e controlli sono calcolati dal motore di Decision OS in modo ripetibile; l&apos;AI interviene solo dove indicato.
          <div className="row between" style={{ marginTop: 10 }}><span>Decision OS · danilorusciano.it/decisionos</span><span>{today}</span></div>
        </footer>
      </article>
    </div>
  );
}
