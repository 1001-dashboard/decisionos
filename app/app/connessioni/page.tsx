"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2, Sparkles, Check } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { useAnalysis } from "@/components/useAnalysis";
import { Top } from "@/components/Shell";
import { ai } from "@/lib/ai";
import { eur, fmt, uid, RES_LABEL, SCEN, type Dep } from "@/lib/engine";

type Kind = "excl" | "req" | "and";
const KL: Record<Kind, string> = { excl: "è incompatibile con", req: "richiede", and: "insieme a (effetto extra)" };

export default function Connessioni() {
  const { decisions, deps, saveDep, deleteDep, profile } = useWs();
  const open = decisions.filter((d) => d.status === "aperta");
  const [sel, setSel] = useState<string[]>(() => [...open].sort((a, b) => b.imp - a.imp).slice(0, 3).map((d) => d.id));
  const { pool, cmb } = useAnalysis(sel);
  const [busy, setBusy] = useState(false);
  const [e, setE] = useState("");

  const opts = useMemo(() => open.flatMap((d) => d.model.options.map((o) => ({ id: o.id, l: `${d.name} · ${o.name}`, d: d.id }))), [open]);
  const lab = (id?: string) => opts.find((o) => o.id === id)?.l ?? "(opzione rimossa)";
  const kind = (d: Dep): Kind => (d.excl ? "excl" : d.req ? "req" : "and");

  function setKind(d: Dep, k: Kind, target: string) {
    const n: Dep = { id: d.id, if: d.if, why: d.why, confirmed: d.confirmed, impacts: k === "and" ? d.impacts ?? [{ r: "cash_m", v: 0 }] : undefined };
    n[k] = target;
    saveDep(n);
  }
  async function propose() {
    setBusy(true); setE("");
    try {
      const x = await ai<{ d: { if: string; excl?: string; req?: string; why?: string }[] }>("link", {
        ds: pool.map((d) => ({ n: d.name, o: d.model.options.map((o) => ({ id: o.id, n: o.name })) })),
        ...(profile.ai_share.contesto ? { ctx: profile.context } : {}),
      });
      const ids = new Set(opts.map((o) => o.id));
      const got = (x.d ?? []).filter((p) => ids.has(p.if) && ((p.excl && ids.has(p.excl)) || (p.req && ids.has(p.req))));
      for (const p of got) await saveDep({ id: uid(), if: p.if, ...(p.excl ? { excl: p.excl } : { req: p.req! }), why: p.why, confirmed: false }, "ai");
      if (!got.length) setE("Nessun collegamento proposto.");
    } catch (err) { setE((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <Top t="Connessioni" s="Effetti tra le scelte: conflitti, requisiti, costi condivisi" />
      <div className="card stack" style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Decisioni da analizzare insieme <small>(max 3)</small></h3>
        <div className="row">
          {open.map((d) => (
            <label key={d.id} className={`pill ${sel.includes(d.id) ? "teal" : "info"}`} style={{ cursor: "pointer", padding: ".4em .8em" }}>
              <input type="checkbox" checked={sel.includes(d.id)} disabled={!sel.includes(d.id) && sel.length >= 3}
                onChange={(x) => setSel(x.target.checked ? [...sel, d.id] : sel.filter((s) => s !== d.id))} /> {d.name}
            </label>
          ))}
          {!open.length && <small>Nessuna decisione aperta.</small>}
        </div>
      </div>

      <div className="card stack" style={{ marginBottom: 16 }}>
        <div className="row between">
          <h3 style={{ margin: 0 }}>Collegamenti</h3>
          <div className="row">
            <button className="btn sm" disabled={busy || pool.length < 2} onClick={propose}><Sparkles size={15} /> Proponi con l&apos;Analista</button>
            <button className="btn sm pri" disabled={opts.length < 2} onClick={() => saveDep({ id: uid(), if: opts[0].id, excl: opts.find((o) => o.d !== opts[0].d)?.id ?? opts[1].id, why: "", confirmed: true })}><Plus size={15} /> Collegamento</button>
          </div>
        </div>
        <small>L&apos;AI può proporre, ma un collegamento entra nel calcolo solo quando lo confermi.</small>
        {e && <div className="err">{e}</div>}
        {deps.map((d) => {
          const k = kind(d);
          return (
            <div key={d.id} className="stack" style={{ padding: 12, borderRadius: 12, background: d.confirmed ? "var(--bg)" : "var(--orange-l)" }}>
              <div className="row">
                <span className="muted">Se scelgo</span>
                <select style={{ flex: "1 1 200px", width: "auto" }} value={d.if} onChange={(x) => saveDep({ ...d, if: x.target.value })}>{opts.map((o) => <option key={o.id} value={o.id}>{o.l}</option>)}</select>
                <select style={{ flex: "0 1 210px", width: "auto" }} value={k} onChange={(x) => setKind(d, x.target.value as Kind, d[k] as string)}>{(Object.keys(KL) as Kind[]).map((kk) => <option key={kk} value={kk}>{KL[kk]}</option>)}</select>
                <select style={{ flex: "1 1 200px", width: "auto" }} value={d[k] as string} onChange={(x) => setKind(d, k, x.target.value)}>{opts.map((o) => <option key={o.id} value={o.id}>{o.l}</option>)}</select>
              </div>
              {k === "and" && (d.impacts ?? []).map((im, i) => (
                <div key={i} className="row">
                  <span className="muted">effetto</span>
                  <select style={{ width: "auto" }} value={im.r} onChange={(x) => { const n = structuredClone(d); n.impacts![i].r = x.target.value; saveDep(n); }}>{["cash0", "cash_m", "hours_w"].map((r) => <option key={r} value={r}>{RES_LABEL[r]}</option>)}</select>
                  <input className="n" type="number" defaultValue={Array.isArray(im.v) ? im.v[1] : im.v} onBlur={(x) => { const n = structuredClone(d); n.impacts![i].v = +x.target.value; saveDep(n); }} />
                </div>
              ))}
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input placeholder="Perché (motivo)" defaultValue={d.why ?? ""} onBlur={(x) => x.target.value !== (d.why ?? "") && saveDep({ ...d, why: x.target.value })} />
                {d.confirmed ? <span className="pill ok">confermato</span> : <button className="btn sm teal" onClick={() => saveDep({ ...d, confirmed: true })}><Check size={14} /> Conferma</button>}
                <button className="iconbtn" onClick={() => deleteDep(d.id)}><Trash2 size={15} /></button>
              </div>
              {(!opts.some((o) => o.id === d.if) || !opts.some((o) => o.id === d[k])) && <small className="err">Riferisce un&apos;opzione non più aperta: {lab(d.if)} / {lab(d[k] as string)}</small>}
            </div>
          );
        })}
        {!deps.length && <small>Nessun collegamento. Esempio: «Lavoro all&apos;estero» è incompatibile con «Progetto full-time».</small>}
      </div>

      <div className="card stack">
        <h3 style={{ margin: 0 }}>Piani combinati</h3>
        <small>Prodotto delle alternative ammissibili. Risorse di partenza dal tuo profilo; costi con lo stesso tag contati una volta. Orizzonte {profile.horizon} mesi.</small>
        {pool.length < 1 ? <div className="empty">Seleziona decisioni con alternative e criteri.</div> : (
          <div className="tablewrap"><table className="t num">
            <thead><tr><th>Piano</th><th>Punteggio</th><th>Liquidità finale (sfav / centr / fav)</th><th>Flusso/mese</th><th>Ore libere</th><th>Stato</th></tr></thead>
            <tbody>{cmb.map((c) => (
              <tr key={c.key} style={{ opacity: c.excluded.length ? 0.55 : 1 }}>
                <td><strong>{c.names.join(" + ")}</strong></td><td>{fmt(c.score)}</td>
                <td>{SCEN.map((s) => eur(c.scen[s].res.cash_end ?? 0)).join(" / ")}</td>
                <td>{eur(c.scen.centrale.res.cash_m ?? 0)}</td>
                <td>{fmt(c.scen.centrale.res.hours_w ?? 0)} h</td>
                <td>{c.excluded.length ? <span className="pill bad" title={c.excluded.join("; ")}>{c.excluded[0].replace("[centrale] ", "")}</span> : c.fragileSfav ? <span className="pill warn" title={c.scen.sfavorevole.viol.join("; ")}>a rischio se sfavorevole</span> : <span className="pill ok">ammissibile</span>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
