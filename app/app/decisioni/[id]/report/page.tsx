"use client";
import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Printer, CheckCircle2, AlertTriangle, XCircle, ThumbsUp, ThumbsDown, Square } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { ScoreBars, LineChart, Legend, PAL } from "@/components/charts";
import {
  analyzeDecision, biasChecks, cashBreakpoint, cashSeries, crossEffects, eur, fmt, hashOf, normalize, solidity, tradeoff, turningPoints,
  LEVELS, SCEN, type Scen,
} from "@/lib/engine";
import { actionPlan, consequences, projection, valueText, HZ } from "@/lib/narrative";
import { compact } from "@/lib/ai";
import { PRI } from "@/lib/priorities";
import { BP } from "@/lib/bp";

const TONE = { ok: <CheckCircle2 size={15} />, warn: <AlertTriangle size={15} />, bad: <XCircle size={15} /> };
const SL: Record<Scen, string> = { sfavorevole: "Se va male", centrale: "Probabile", favorevole: "Se va bene" };
const REL: Record<string, string> = { F: "certo", D: "dichiarato", S: "stima" };
const TIPO: Record<string, string> = { lavoro: "Lavoro", casa: "Casa", acquisto: "Acquisto", soldi: "Soldi", progetto: "Progetto", relazioni: "Relazioni", famiglia: "Famiglia", salute: "Salute", studio: "Studio", morale: "Scelta morale", altro: "Altro" };

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
    return { res, nm, turns, trade: tradeoff(d, res), sol: solidity(d, res), bias: biasChecks(d, res), plan: actionPlan(d, res, turns, d.due) };
  }, [d]);
  // titolo della pagina = nome proposto per il PDF quando lo salvi
  useEffect(() => {
    if (!d) return;
    const prev = document.title;
    document.title = `Decision OS - ${d.name}`.replace(/[\\/:*?"<>|]/g, "");
    return () => { document.title = prev; };
  }, [d]);
  if (!d || !data) return <div className="empty">Decisione non trovata. <Link href="/app/decisioni">Torna all&apos;elenco</Link></div>;
  const { res, nm, turns, trade, sol, bias, plan } = data;
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
  const controFresh = contro && contro.h === hashOf(compact(d, res, { eco: ws.profile.ai_share.economia, ctx: ctxStr, res: R }));
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

        {/* SINTESI */}
        <section className="rep-sum">
          <div className="rep-kicker">In sintesi</div>
          {!top ? <p className="big">Nessuna alternativa rispetta tutti i requisiti fissati.</p> : (
            <>
              <p className="big">Con le priorità indicate prevale <b>{top.name}</b>: {gap}.{missing ? ` Risultato provvisorio: mancano ${missing} valori.` : ""}</p>
              <dl>
                <dt>Perché</dt><dd>Pesano soprattutto {drivers.map((x) => `«${x}»`).join(" e ") || "—"}.</dd>
                {turns[0] && <><dt>A una condizione</dt><dd>{turns[0].text}</dd></>}
                {trade?.risks[0] && <><dt>Rischio principale</dt><dd>{trade.risks[0]}</dd></>}
                {sol && <><dt>Solidità</dt><dd>{!sol.tested ? "Basato su dati certi o dichiarati." : sol.holds ? `Regge anche con stime sbagliate del ${sol.pct * 100}%.` : `Fragile: con stime sbagliate del ${sol.pct * 100}% vincerebbe ${sol.newTop}.`} {sol.estShare + sol.unkShare > 50 ? `Il ${sol.estShare + sol.unkShare}% del punteggio poggia su stime o dati senza fonte.` : ""}</dd></>}
                {bias[0] && <><dt>Attenzione</dt><dd>{bias[0].t}</dd></>}
                <dt>Prossimo passo</dt><dd>{plan[0]}</dd>
              </dl>
            </>
          )}
          <p className="rep-note">Questo report non decide al posto tuo: mostra cosa prevale secondo le priorità che hai indicato, a quali condizioni e con quali rischi.</p>
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
            </div>
            <div>
              <h3>Il tuo punto di partenza</h3>
              <ul>
                <li>Risparmi disponibili: <b>{eur(R.cash0 ?? 0)}</b></li>
                <li>Margine mensile attuale: <b>{eur(R.cash_m ?? 0)}</b></li>
                <li>Ore libere a settimana: <b>{fmt(R.hours_w ?? 0)}</b></li>
                {rules.map((r) => <li key={r.id}>Limite: {r.name}{r.min != null ? ` ≥ ${fmt(r.min)}` : ""}{r.max != null ? ` ≤ ${fmt(r.max)}` : ""}</li>)}
              </ul>
            </div>
          </div>
          <h3>Le tue priorità generali in questa fase</h3>
          <div className="rep-pri">{Object.keys(PRI).map((k) => <span key={k}>{PRI[k].l} <b>{ws.profile.priorities[k] ?? 3}/5</b></span>)}</div>
        </section>

        {/* ALTERNATIVE */}
        <section className="rsec">
          <H t="Le alternative e cosa comporterebbero" />
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
          <H t="Il confronto" />
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
          <div style={{ marginTop: 12 }}><ScoreBars rows={res.rows} reasons /></div>
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
              <p>Risparmi a fine periodo per ogni alternativa, nei tre scenari. Proiezione lineare, senza probabilità: «se va male» e «se va bene» sono ipotesi, non previsioni.</p>
              <table className="rt">
                <thead><tr><th>Alternativa</th><th>Periodo</th>{SCEN.map((s) => <th key={s}>{SL[s]}</th>)}<th>Ore libere</th></tr></thead>
                <tbody>{m.options.flatMap((o) => projection(o, R, rules).map((p, j) => (
                  <tr key={o.id + p.h} className={j === 0 ? "first" : ""}>
                    <td>{j === 0 ? <b>{o.name}</b> : ""}</td><td>{p.h} mesi</td>
                    {SCEN.map((s) => <td key={s} className={`num ${p.s[s].viol.length ? "neg" : ""}`}>{eur(p.s[s].res.cash_end ?? 0)}</td>)}
                    <td className="num">{fmt(p.s.centrale.res.hours_w ?? 0)} h</td>
                  </tr>
                )))}</tbody>
              </table>
              <div className="rep-chart">
                <Legend items={m.options.map((o, i) => ({ name: o.name, color: PAL[i % PAL.length] }))} />
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
              <p>Punteggio di {top?.name}: <b>{100 - sol.estShare - sol.unkShare}%</b> su dati certi o dichiarati, <b>{sol.estShare}%</b> su stime, <b>{sol.unkShare}%</b> senza fonte. {!sol.tested ? "Nessuna stima da mettere alla prova." : sol.holds ? `Prova di stress superata: con le stime sbagliate del ${sol.pct * 100}% a suo sfavore resta prima.` : `Prova di stress non superata: con le stime sbagliate del ${sol.pct * 100}% vincerebbe ${sol.newTop}.`}</p>
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
          <H t="Piano d'azione prima di decidere" />
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
