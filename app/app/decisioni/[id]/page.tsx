"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, Snowflake, CheckCircle2, Scale, Wrench, FileSearch, FileText, Bot, Printer } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { ScoreBars } from "@/components/charts";
import ReportView from "@/components/ReportView";
import { analyzeDecision, combos, fmt, uid, RES_LABEL, type Decision, type Model, type Opt, type Rel, type Impact } from "@/lib/engine";
import { buildReport } from "@/lib/report";

const REL: Record<Rel, [string, string]> = { F: ["ok", "verificato"], D: ["info", "dichiarato"], S: ["warn", "stima"], "?": ["bad", "mancante"] };
const TABS = [
  { k: "cmp", l: "Comparatore", i: Scale }, { k: "mod", l: "Modello", i: Wrench },
  { k: "dat", l: "Dati e ipotesi", i: FileSearch }, { k: "rep", l: "Report", i: FileText },
];
const RES = ["cash0", "cash_m", "hours_w"];
const numOrNull = (s: string) => (s === "" ? null : Number(s));

export default function DecisionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ws = useWs();
  const src = ws.decisions.find((d) => d.id === id);
  const [d, setD] = useState<Decision | null>(src ?? null);
  const [tab, setTab] = useState("cmp");
  const [saved, setSaved] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { if (src && !d) setD(src); }, [src, d]);
  const res = useMemo(() => (d ? analyzeDecision(d) : null), [d]);
  const rep = useMemo(() => {
    if (!d || !res) return [];
    const c = combos([d], [res], ws.deps, ws.profile.resources, ws.profile.rules, ws.profile.horizon);
    return buildReport([d], [res], c, ws.profile.rules, ws.profile.horizon);
  }, [d, res, ws.deps, ws.profile]);

  if (!d || !res) return <div className="empty">Decisione non trovata. <Link href="/app/decisioni">Torna all&apos;elenco</Link></div>;
  const m = d.model;

  function upd(next: Decision) {
    setD(next); setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await ws.saveDecision(next); setSaved(true); }, 700);
  }
  const setM = (fn: (m: Model) => Model) => upd({ ...d, model: fn(structuredClone(d.model)) });
  const setOpt = (oid: string, fn: (o: Opt) => void) => setM((mm) => { fn(mm.options.find((o) => o.id === oid)!); return mm; });

  async function freeze() {
    const label = prompt("Nome dell'analisi congelata", `${d!.name} · ${new Date().toLocaleDateString("it-IT")}`);
    if (!label) return;
    await ws.createSnapshot(label, { decisions: [d!], deps: ws.deps, resources: ws.profile.resources, rules: ws.profile.rules, horizon: ws.profile.horizon }, { res: [res] });
    alert("Analisi congelata nel Registro.");
  }
  async function del() {
    if (!confirm("Eliminare definitivamente questa decisione? Le analisi congelate nel Registro restano.")) return;
    await ws.deleteDecision(d!.id); router.replace("/app/decisioni");
  }

  return (
    <>
      <Top t={d.name} s={saved ? "Salvato" : "Salvataggio…"}>
        <button className="btn sm" onClick={freeze}><Snowflake size={15} /> Congela analisi</button>
        <Link className="btn sm" href={`/app/registro?d=${d.id}`}><CheckCircle2 size={15} /> Registra scelta</Link>
        <Link className="btn sm" href={`/app/analista?d=${d.id}`}><Bot size={15} /> Analista</Link>
        <button className="iconbtn" title="Elimina" onClick={del}><Trash2 size={17} /></button>
      </Top>

      <div className="card grid g4" style={{ marginBottom: 16 }}>
        <div><label className="f">Titolo</label><input value={d.name} onChange={(e) => upd({ ...d, name: e.target.value })} /></div>
        <div><label className="f">Stato</label>
          <select value={d.status} onChange={(e) => upd({ ...d, status: e.target.value as Decision["status"] })}>
            <option value="aperta">Aperta</option><option value="presa">Presa</option><option value="archiviata">Archiviata</option>
          </select></div>
        <div><label className="f">Importanza (peso nei piani combinati)</label>
          <select value={d.imp} onChange={(e) => upd({ ...d, imp: +e.target.value })}><option value={1}>Normale</option><option value={2}>Alta</option><option value={3}>Molto alta</option></select></div>
        <div><label className="f">Da decidere entro</label><input type="date" value={d.due ?? ""} onChange={(e) => upd({ ...d, due: e.target.value || null })} /></div>
      </div>

      <div className="seg" style={{ marginBottom: 16 }}>
        {TABS.map(({ k, l, i: I }) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><span className="row" style={{ gap: 6 }}><I size={15} />{l}</span></button>)}
      </div>

      {tab === "cmp" && (
        !m.options.length || !m.criteria.length
          ? <div className="card empty">Aggiungi almeno due alternative e un criterio nel <button className="btn sm" onClick={() => setTab("mod")}>Modello</button></div>
          : <div className="grid g2" style={{ alignItems: "start" }}>
            <div className="card stack"><h3>Punteggi ponderati</h3><ScoreBars rows={res.rows} />
              {res.warn.map((w) => <div key={w} className="note warn">{w}</div>)}
            </div>
            <div className="stack">
              <div className="grid g3">
                <div className="card kpi"><div className="l">Margine 1ª – 2ª</div><div className="v num">{res.margin != null ? `${fmt(res.margin)} pt` : "—"}</div></div>
                <div className="card kpi"><div className="l">Robustezza</div><div className="v" style={{ fontSize: "1.4rem", color: res.tie ? "var(--red)" : res.fragile.length ? "#b8741a" : "var(--green)" }}>{res.tie ? "Parità" : res.fragile.length ? "Fragile" : res.sens.length ? "Robusta" : "—"}</div></div>
                <div className="card kpi"><div className="l">Escluse da vincoli</div><div className="v">{res.rows.filter((r) => r.excluded.length).length}</div></div>
              </div>
              <div className="card">
                <h3>Sensibilità dei pesi</h3>
                <p className="muted" style={{ fontSize: 13 }}>Variazione minima di un singolo peso che cambia la prima scelta. Entro ±10 punti la classifica è fragile.</p>
                <table className="t num"><thead><tr><th>Criterio</th><th>Peso</th><th>Ribalta con</th><th>Nuova prima</th></tr></thead>
                  <tbody>{res.sens.map((s) => {
                    const c = m.criteria.find((x) => x.id === s.crit)!;
                    return <tr key={s.crit}><td>{s.name}</td><td>{c.w}%</td>
                      <td>{s.delta == null ? <span className="pill ok">mai</span> : <span className={`pill ${Math.abs(s.delta) <= 10 ? "warn" : "info"}`}>{s.delta > 0 ? "+" : ""}{s.delta} pt</span>}</td>
                      <td>{res.rows.find((r) => r.id === s.newTop)?.name ?? "—"}</td></tr>;
                  })}</tbody></table>
              </div>
            </div>
            <div className="card" style={{ gridColumn: "1 / -1" }}>
              <details open><summary>Ricostruzione di ogni punteggio</summary>
                <div className="tablewrap" style={{ marginTop: 10 }}>
                  <table className="t num"><thead><tr><th>Alternativa</th><th>Criterio</th><th>Valore</th><th>Peso</th><th>Contributo</th><th>Base</th></tr></thead>
                    <tbody>{res.rows.flatMap((r) => r.detail.map((x, i) => (
                      <tr key={r.id + x.crit}><td>{i ? "" : <strong>{r.name}</strong>}</td><td>{x.name}</td><td>{x.s ?? "—"}</td><td>{x.w}%</td><td>{x.contrib ?? "—"}</td>
                        <td>{x.meta?.why ?? ""} {x.s != null ? <span className={`pill ${REL[x.meta?.rel ?? "D"][0]}`}>{REL[x.meta?.rel ?? "D"][1]}</span> : <span className="pill bad">mancante</span>}</td></tr>
                    )))}</tbody></table>
                </div>
              </details>
            </div>
          </div>
      )}

      {tab === "mod" && (
        <div className="stack">
          <div className="card stack">
            <div className="row between"><h3 style={{ margin: 0 }}>Criteri</h3><span className={`pill ${res.weightSum === 100 ? "ok" : "warn"}`}>somma pesi {res.weightSum}</span></div>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Dichiara cosa vale 0 e cosa vale 100. Criteri che misurano lo stesso beneficio: stesso «gruppo» (il sistema avvisa) o meglio unirli.</p>
            <div className="tablewrap"><table className="t"><thead><tr><th>Criterio</th><th>Peso %</th><th>Gruppo</th><th>0 =</th><th>100 =</th><th /></tr></thead>
              <tbody>{m.criteria.map((c, i) => (
                <tr key={c.id}>
                  <td><input value={c.name} onChange={(e) => setM((mm) => { mm.criteria[i].name = e.target.value; return mm; })} /></td>
                  <td><input className="n" type="number" min={0} max={100} value={c.w} onChange={(e) => setM((mm) => { mm.criteria[i].w = +e.target.value; return mm; })} /></td>
                  <td><input style={{ width: 90 }} value={c.group ?? ""} onChange={(e) => setM((mm) => { mm.criteria[i].group = e.target.value || undefined; return mm; })} /></td>
                  <td><input value={c.lo ?? ""} onChange={(e) => setM((mm) => { mm.criteria[i].lo = e.target.value; return mm; })} /></td>
                  <td><input value={c.hi ?? ""} onChange={(e) => setM((mm) => { mm.criteria[i].hi = e.target.value; return mm; })} /></td>
                  <td><button className="iconbtn" onClick={() => setM((mm) => { mm.criteria.splice(i, 1); mm.constraints = mm.constraints.filter((k) => k.crit !== c.id); return mm; })}><Trash2 size={15} /></button></td>
                </tr>))}</tbody></table></div>
            <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setM((mm) => { mm.criteria.push({ id: uid(), name: "Nuovo criterio", w: 0 }); return mm; })}><Plus size={14} /> Criterio</button>
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Vincoli non negoziabili</h3>
            <p className="muted" style={{ fontSize: 13, margin: 0 }}>Un&apos;alternativa fuori soglia (o senza il dato) è esclusa, qualunque sia il punteggio.</p>
            {m.constraints.map((k, i) => (
              <div key={k.id} className="row" style={{ flexWrap: "wrap" }}>
                <input style={{ flex: "1 1 180px" }} value={k.name} placeholder="Nome" onChange={(e) => setM((mm) => { mm.constraints[i].name = e.target.value; return mm; })} />
                <select style={{ flex: "1 1 160px" }} value={k.crit} onChange={(e) => setM((mm) => { mm.constraints[i].crit = e.target.value; return mm; })}>{m.criteria.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
                <span className="muted">min</span><input className="n" type="number" value={k.min ?? ""} onChange={(e) => setM((mm) => { mm.constraints[i].min = numOrNull(e.target.value); return mm; })} />
                <span className="muted">max</span><input className="n" type="number" value={k.max ?? ""} onChange={(e) => setM((mm) => { mm.constraints[i].max = numOrNull(e.target.value); return mm; })} />
                <button className="iconbtn" onClick={() => setM((mm) => { mm.constraints.splice(i, 1); return mm; })}><Trash2 size={15} /></button>
              </div>
            ))}
            <button className="btn sm" style={{ alignSelf: "flex-start" }} disabled={!m.criteria.length} onClick={() => setM((mm) => { mm.constraints.push({ id: uid(), name: "", crit: mm.criteria[0].id, min: 50 }); return mm; })}><Plus size={14} /> Vincolo</button>
          </div>

          <div className="grid g3" style={{ alignItems: "start" }}>
            {m.options.map((o, oi) => (
              <div key={o.id} className="card stack">
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input value={o.name} onChange={(e) => setOpt(o.id, (x) => { x.name = e.target.value; })} style={{ fontWeight: 600 }} />
                  <button className="iconbtn" title="Elimina alternativa" onClick={() => setM((mm) => { mm.options.splice(oi, 1); return mm; })}><Trash2 size={15} /></button>
                </div>
                {m.criteria.map((c) => {
                  const meta = o.m?.[c.id] ?? {};
                  return (
                    <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                      <div className="row between" style={{ flexWrap: "nowrap" }}>
                        <span style={{ fontSize: 14 }}>{c.name}</span>
                        <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                          <select style={{ width: 104, padding: ".3em" }} value={o.s[c.id] == null ? "?" : meta.rel ?? "D"}
                            onChange={(e) => setOpt(o.id, (x) => { x.m ??= {}; x.m[c.id] = { ...x.m[c.id], rel: e.target.value as Rel }; if (e.target.value === "?") delete x.s[c.id]; })}>
                            <option value="F">verificato</option><option value="D">dichiarato</option><option value="S">stima</option><option value="?">mancante</option>
                          </select>
                          <input className="n" type="number" min={0} max={100} value={o.s[c.id] ?? ""} placeholder="—"
                            onChange={(e) => setOpt(o.id, (x) => { if (e.target.value === "") delete x.s[c.id]; else x.s[c.id] = Math.max(0, Math.min(100, +e.target.value)); })} />
                        </span>
                      </div>
                      <input style={{ marginTop: 4, fontSize: 13 }} placeholder="Motivazione / fonte" value={meta.why ?? ""}
                        onChange={(e) => setOpt(o.id, (x) => { x.m ??= {}; x.m[c.id] = { ...x.m[c.id], why: e.target.value }; })} />
                    </div>
                  );
                })}
                <details>
                  <summary>Impatti sulle risorse ({o.impacts?.length ?? 0})</summary>
                  <div className="stack" style={{ marginTop: 8 }}>
                    <small>Valori sfavorevole / centrale / favorevole. «Tag» = costo una tantum condiviso tra decisioni, contato una volta.</small>
                    {(o.impacts ?? []).map((im, ii) => {
                      const vv = Array.isArray(im.v) ? im.v : [im.v, im.v, im.v];
                      const setV = (k: number, val: number) => setOpt(o.id, (x) => { const cur = x.impacts![ii]; const a = (Array.isArray(cur.v) ? [...cur.v] : [cur.v, cur.v, cur.v]) as [number, number, number]; a[k] = val; cur.v = a; });
                      return (
                        <div key={ii} className="stack" style={{ background: "var(--bg)", padding: 8, borderRadius: 10 }}>
                          <div className="row" style={{ flexWrap: "nowrap" }}>
                            <select value={im.r} onChange={(e) => setOpt(o.id, (x) => { x.impacts![ii].r = e.target.value; })}>{RES.map((r) => <option key={r} value={r}>{RES_LABEL[r]}</option>)}</select>
                            <button className="iconbtn" onClick={() => setOpt(o.id, (x) => { x.impacts!.splice(ii, 1); })}><Trash2 size={15} /></button>
                          </div>
                          <div className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                            {[0, 1, 2].map((k) => <input key={k} type="number" title={["sfavorevole", "centrale", "favorevole"][k]} value={vv[k]} onChange={(e) => setV(k, +e.target.value)} />)}
                          </div>
                          <input placeholder="tag (facoltativo)" value={im.tag ?? ""} onChange={(e) => setOpt(o.id, (x) => { x.impacts![ii].tag = e.target.value || undefined; })} />
                        </div>
                      );
                    })}
                    <button className="btn sm" onClick={() => setOpt(o.id, (x) => { (x.impacts ??= []).push({ r: "cash_m", v: [0, 0, 0] } as Impact); })}><Plus size={14} /> Impatto</button>
                    <label className="f" style={{ marginTop: 6 }}>Esclusione manuale (motivo)</label>
                    <input value={o.block ?? ""} placeholder="vuoto = nessuna" onChange={(e) => setOpt(o.id, (x) => { x.block = e.target.value || undefined; })} />
                    <small>ID per i collegamenti: <code>{o.id}</code></small>
                  </div>
                </details>
              </div>
            ))}
            {m.options.length < 3 ? (
              <button className="card btn" style={{ minHeight: 120, justifyContent: "center", borderStyle: "dashed" }}
                onClick={() => setM((mm) => { mm.options.push({ id: uid(), name: `Alternativa ${mm.options.length + 1}`, s: {} }); return mm; })}><Plus size={16} /> Alternativa</button>
            ) : <small>V1: massimo 3 alternative per decisione.</small>}
          </div>
        </div>
      )}

      {tab === "dat" && (
        <div className="card stack">
          <h3 style={{ margin: 0 }}>Su quali fatti stai ragionando</h3>
          <div><label className="f">Descrizione</label><textarea value={d.descr ?? ""} onChange={(e) => upd({ ...d, descr: e.target.value })} /></div>
          <div className="tablewrap"><table className="t"><thead><tr><th>Dato o ipotesi</th><th>Tipo</th><th>Affidabilità</th><th>Fonte</th><th>Data</th><th /></tr></thead>
            <tbody>{(m.assumptions ?? []).map((a, i) => (
              <tr key={a.id}>
                <td><input value={a.t} onChange={(e) => setM((mm) => { mm.assumptions![i].t = e.target.value; return mm; })} /></td>
                <td><select value={a.rel} onChange={(e) => setM((mm) => { mm.assumptions![i].rel = e.target.value as Rel; return mm; })}>{(Object.keys(REL) as Rel[]).map((k) => <option key={k} value={k}>{REL[k][1]}</option>)}</select></td>
                <td><select value={a.aff ?? ""} onChange={(e) => setM((mm) => { mm.assumptions![i].aff = (e.target.value || undefined) as never; return mm; })}><option value="">—</option><option value="alta">alta</option><option value="media">media</option><option value="bassa">bassa</option></select></td>
                <td><input value={a.src ?? ""} onChange={(e) => setM((mm) => { mm.assumptions![i].src = e.target.value; return mm; })} /></td>
                <td><input type="date" value={a.dt ?? ""} onChange={(e) => setM((mm) => { mm.assumptions![i].dt = e.target.value; return mm; })} /></td>
                <td><button className="iconbtn" onClick={() => setM((mm) => { mm.assumptions!.splice(i, 1); return mm; })}><Trash2 size={15} /></button></td>
              </tr>))}</tbody></table></div>
          <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setM((mm) => { (mm.assumptions ??= []).push({ id: uid(), t: "", rel: "S", dt: new Date().toISOString().slice(0, 10) }); return mm; })}><Plus size={14} /> Dato</button>
          <small>Affidabilità alta/media/bassa con motivo, mai percentuali di sicurezza inventate.</small>
        </div>
      )}

      {tab === "rep" && (
        <div className="card">
          <div className="row between noprint" style={{ marginBottom: 14 }}><h3 style={{ margin: 0 }}>Report decisionale</h3><button className="btn sm" onClick={() => window.print()}><Printer size={15} /> Stampa / PDF</button></div>
          <ReportView sections={rep} />
          <p className="muted noprint" style={{ fontSize: 13, marginTop: 10 }}>Per l&apos;effetto sulle altre decisioni apri <Link href="/app/connessioni">Connessioni</Link>; per obiezioni e soglie l&apos;<Link href={`/app/analista?d=${d.id}`}>Analista</Link>.</p>
        </div>
      )}
    </>
  );
}
