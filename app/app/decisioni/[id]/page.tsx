"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Snowflake, CheckCircle2, Bot, Check, AlertCircle, ArrowRight, ArrowLeft,
  ArrowLeftRight, Lightbulb, StickyNote, Wallet, ChevronDown, TrendingUp, TrendingDown, ShieldAlert, Link2, Scale, Swords, RefreshCw, ThumbsUp, ThumbsDown, X, Brain, FileText,
} from "lucide-react";
import { useWs } from "@/components/Workspace";
import { ScoreBars } from "@/components/charts";
import {
  analyzeDecision, applyCombo, combos, eur, fmt, normalize, turningPoints, uid, weightsFromImp, scaleNum, levelOf,
  tradeoff, solidity, crossEffects, hashOf, biasChecks, conclusive,
  LEVELS, type Crit, type Decision, type Impact, type Model, type Opt, type Rel, untestedText } from "@/lib/engine";
import { CRIT_LIB } from "@/lib/templates";
import { impFor, priGap } from "@/lib/priorities";
import { ai, compact } from "@/lib/ai";

const LVC = ["#c94040", "#e07b39", "#d9a521", "#7bb661", "#23906a"];
const SRC: { k: Rel; l: string }[] = [{ k: "F", l: "Certo" }, { k: "D", l: "Me l'hanno detto" }, { k: "S", l: "Stima mia" }];
const UNITS = ["€/mese", "€", "€/anno", "ore/settimana", "minuti", "km", "mesi"];

const STEPS = ["Alternative", "Cosa conta", "Valuta", "Soldi e tempo", "Risultato"];

/* ---------- stato di completezza ---------- */
function status(d: Decision) {
  const m = d.model;
  const scaleMissing = m.criteria.filter((c) => c.kind === "num" && (c.worst == null || c.best == null || c.worst === c.best));
  const cells = m.options.flatMap((o) => m.criteria.map((c) => ({ o, c })));
  const missing = cells.filter(({ o, c }) => (c.kind === "num" ? o.raw?.[c.id] == null : o.s?.[c.id] == null));
  const money = m.options.some((o) => (o.impacts ?? []).length);
  const done = [m.options.length >= 2, m.criteria.length >= 1 && !scaleMissing.length, cells.length > 0 && !missing.length, money];
  const pct = Math.round(((done[0] ? 1 : 0) + (done[1] ? 1 : 0) + (cells.length ? (cells.length - missing.length) / cells.length : 0) + (money ? 0.5 : 0)) / 3.5 * 100);
  return { scaleMissing, missing, cells: cells.length, done, pct };
}

/* ---------- piccoli componenti ---------- */
function Hint({ children }: { children: React.ReactNode }) {
  return <div className="hint"><Lightbulb size={16} /><div>{children}</div></div>;
}
function Num({ value, onChange, placeholder, w = 110, suffix }: { value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; w?: number; suffix?: string }) {
  const [t, setT] = useState(value == null ? "" : String(value));
  useEffect(() => { setT(value == null ? "" : String(value)); }, [value]);
  return (
    <span className="numin" style={{ width: w + (suffix ? 70 : 0) }}>
      <input inputMode="decimal" value={t} placeholder={placeholder ?? "—"}
        onChange={(e) => { const x = e.target.value.replace(",", "."); setT(e.target.value); if (x === "" || x === "-") onChange(null); else if (!isNaN(+x)) onChange(+x); }} />
      {suffix ? <em>{suffix}</em> : null}
    </span>
  );
}

function PcList({ items, kind, onChange }: { items: string[]; kind: "pro" | "con"; onChange: (v: string[]) => void }) {
  const [t, setT] = useState("");
  const add = () => { if (t.trim()) { onChange([...items, t.trim()]); setT(""); } };
  return (
    <div className={`pcl ${kind}`}>
      <b>{kind === "pro" ? <><ThumbsUp size={13} /> A favore</> : <><ThumbsDown size={13} /> Contro</>}</b>
      {items.map((x, i) => <div key={i} className="pci"><span>{x}</span><button className="iconbtn" aria-label="Togli" onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={13} /></button></div>)}
      <input value={t} placeholder={kind === "pro" ? "+ aggiungi un pro" : "+ aggiungi un contro"} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} onBlur={add} />
    </div>
  );
}

const mid = (v: number | number[]) => (Array.isArray(v) ? v[v.length === 3 ? 1 : 0] : v);   // dati vecchi con intervallo su un campo a valore unico

export default function DecisionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const ws = useWs();
  const src = ws.decisions.find((d) => d.id === id);
  const [d, setD] = useState<Decision | null>(src ?? null);
  const [step, setStep] = useState<number | null>(null);
  const [saved, setSaved] = useState(true);
  const [more, setMore] = useState(false);
  const [notes, setNotes] = useState<Record<string, boolean>>({});
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { if (src && !d) setD(src); }, [src, d]);
  const st = useMemo(() => (d ? status(d) : null), [d]);
  useEffect(() => {
    if (!d || !st || step != null) return;
    setStep(!st.done[0] ? 0 : !st.done[1] ? 1 : st.missing.length ? 2 : 4);
  }, [d, st, step]);
  const res = useMemo(() => (d ? analyzeDecision(d) : null), [d]);
  const nm = useMemo(() => (d ? normalize(d.model) : null), [d]);
  const turns = useMemo(() => (d && res ? turningPoints(d, res) : []), [d, res]);
  const trade = useMemo(() => (d && res ? tradeoff(d, res) : null), [d, res]);
  const bias = useMemo(() => (d && res ? biasChecks(d, res) : []), [d, res]);
  const sol = useMemo(() => (d && res ? solidity(d, res) : null), [d, res]);
  const [crossOpt, setCrossOpt] = useState<string>("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const others = useMemo(() => ws.decisions.filter((x) => x.status === "aperta" && x.id !== id && x.model.options.length), [ws.decisions, id]);

  if (!d || !res || !st || !nm) return <div className="empty">Decisione non trovata. <Link href="/app/decisioni">Torna all&apos;elenco</Link></div>;
  const m = d.model;
  const S = step ?? 0;

  function upd(next: Decision) {
    setD(next); setSaved(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => { await ws.saveDecision(next); setSaved(true); }, 600);
  }
  const setM = (fn: (m: Model) => void) => { const mm = structuredClone(d.model); fn(mm); upd({ ...d, model: mm }); };
  const opt = (mm: Model, oid: string) => mm.options.find((o) => o.id === oid)!;
  const crit = (mm: Model, cid: string) => mm.criteria.find((c) => c.id === cid)!;

  /* importanza: alla prima modifica converte i pesi vecchi in importanza 1-5 */
  function setImp(cid: string, v: number) {
    setM((mm) => {
      const n = mm.criteria.length || 1;
      mm.criteria.forEach((c) => { if (c.imp == null) c.imp = Math.max(1, Math.min(5, Math.round((c.w / (100 / n)) * 3))); });
      crit(mm, cid).imp = v;
      const w = weightsFromImp(mm.criteria);
      mm.criteria.forEach((c, i) => { c.w = w[i]; });
    });
  }
  function addCrit(c: Partial<Crit>) {
    setM((mm) => {
      mm.criteria.forEach((x) => { if (x.imp == null) x.imp = 3; });
      mm.criteria.push({ id: uid(), name: c.name ?? "Nuovo criterio", w: 0, imp: c.imp ?? (c.name ? impFor(c.name, ws.profile.priorities) : 3), kind: c.kind ?? "g", unit: c.unit, worst: c.worst ?? null, best: c.best ?? null });
      const w = weightsFromImp(mm.criteria); mm.criteria.forEach((x, i) => { x.w = w[i]; });
    });
  }
  function setKind(cid: string, k: "num" | "g") {
    setM((mm) => {
      const c = crit(mm, cid);
      if (c.kind === k) return;
      c.kind = k;
      if (k === "num") { c.unit ??= "€/mese"; c.worst ??= 0; c.best ??= 1000; mm.options.forEach((o) => { delete o.s[cid]; }); }
      else mm.options.forEach((o) => { if (o.s[cid] != null) o.s[cid] = levelOf(o.s[cid]) * 25; delete o.raw?.[cid]; });
      mm.constraints = mm.constraints.filter((x) => x.crit !== cid);
    });
  }
  const cons = (cid: string) => m.constraints.find((k) => k.crit === cid);
  function setCons(cid: string, v: { min?: number | null; max?: number | null } | null) {
    setM((mm) => {
      mm.constraints = mm.constraints.filter((k) => k.crit !== cid);
      if (v) mm.constraints.push({ id: uid(), name: crit(mm, cid).name, crit: cid, min: v.min ?? null, max: v.max ?? null });
    });
  }
  /* impatti semplificati */
  const imp = (o: Opt, r: string) => (o.impacts ?? []).find((i) => i.r === r);
  function setImpact(oid: string, r: string, v: Impact["v"] | null, tag?: string) {
    setM((mm) => {
      const o = opt(mm, oid);
      o.impacts = (o.impacts ?? []).filter((i) => i.r !== r);
      if (v != null) o.impacts.push({ r, v, ...(tag ? { tag } : {}) });
    });
  }
  async function freeze() {
    const label = prompt("Nome dell'analisi da congelare", `${d!.name} · ${new Date().toLocaleDateString("it-IT")}`);
    if (!label) return;
    await ws.createSnapshot(label, { decisions: [d!], deps: ws.deps, resources: ws.profile.resources, rules: ws.profile.rules, horizon: ws.profile.horizon }, { res: [res] });
    alert("Analisi congelata nel Registro.");
  }
  async function del() {
    if (!confirm("Eliminare definitivamente questa decisione? Le analisi congelate nel Registro restano.")) return;
    await ws.deleteDecision(d!.id); router.replace("/app/decisioni");
  }

  const ok = res.rows.filter((r) => !r.excluded.length);
  const top = ok[0];
  const provisional = st.missing.length > 0;
  const concl = conclusive(d, res);
  const R = ws.profile.resources;
  const cOpt = crossOpt && m.options.some((o) => o.id === crossOpt) ? crossOpt : top?.id ?? m.options[0]?.id ?? "";
  const cross = cOpt ? crossEffects(cOpt, d, others, ws.deps, R, ws.profile.rules, ws.profile.horizon) : [];
  const gaps = m.criteria.map((c) => ({ c, g: priGap(c.name, c.imp, ws.profile.priorities) })).filter((x) => x.g);
  const ctxStr = ws.profile.ai_share.contesto ? Object.entries(ws.profile.context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ") : undefined;
  const aiPayload = compact(d, res, { eco: ws.profile.ai_share.economia, ctx: ctxStr, res: R });
  const aiHash = hashOf(aiPayload);
  const contro = m.ai?.contro;
  async function runContro() {
    setAiBusy(true); setAiErr("");
    try {
      const x = await ai<{ p?: string[]; c?: string }>("contro", aiPayload);
      setM((mm) => { mm.ai = { ...mm.ai, contro: { p: (x.p ?? []).slice(0, 6), c: x.c, at: new Date().toISOString(), h: aiHash } }; });
    } catch (e) { setAiErr((e as Error).message); } finally { setAiBusy(false); }
  }
  const noBase = !(R.cash0 || R.cash_m || R.hours_w);

  /* ---------- verdetto in linguaggio semplice ---------- */
  function verdict() {
    if (m.options.length < 2) return { tone: "warn", t: "Servono almeno due alternative.", s: "Torna al passo 1." };
    if (!m.criteria.length) return { tone: "warn", t: "Dimmi cosa conta per te.", s: "Aggiungi almeno un criterio al passo 2." };
    if (!top) return { tone: "bad", t: "Nessuna alternativa rispetta i tuoi requisiti.", s: "Rivedi i requisiti minimi o cerca un'altra opzione." };
    const mg = res!.margin ?? 0;
    const gap = ok.length < 2 ? "è l'unica che rispetta i requisiti" : mg === 0 ? "è alla pari con " + ok[1].name : mg < 3 ? `è quasi alla pari con ${ok[1].name}` : mg < 10 ? `ha un vantaggio contenuto su ${ok[1].name}` : `ha un vantaggio netto su ${ok[1].name}`;
    if (concl.pend) return { tone: "warn", t: "Classifica provvisoria: la prima non ha ancora superato un requisito obbligatorio.", s: `${concl.pend.name} è davanti, ma va verificato: ${concl.pend.req.join("; ")}. Se non lo rispetta viene scartata e la classifica cambia. Completa il dato al passo 3.` };
    if (ok.length < 2 && !provisional) return { tone: "ok", t: `Con le tue priorità di oggi prevale ${top.name}.`, s: `${top.name} è l'unica che rispetta tutti i tuoi requisiti.` };
    if (provisional && !concl.ok) return { tone: "warn", t: "Classifica provvisoria: i dati non bastano per una conclusione.", s: `Mancano ${st!.missing.length} valori (fino al ${concl.missW}% del peso). Con quei dati potrebbe prevalere ${concl.contenders.join(" oppure ")}. Completali al passo 3.` };
    if (provisional) return { tone: "warn", t: `Prevale ${top.name} anche nel caso peggiore dei dati mancanti.`, s: `Mancano ancora ${st!.missing.length} valori, ma nessuno di essi può ribaltare la classifica. Completali comunque per affinare il risultato.` };
    return { tone: mg < 3 || res!.fragile.length ? "warn" : "ok", t: `Con le tue priorità di oggi prevale ${top.name}.`, s: `${top.name} ${gap}${res!.fragile.length ? ", ma la classifica cambia facilmente se cambi l'importanza di un criterio" : ""}.` };
  }
  const V = verdict();

  return (
    <div className="wiz">
      <div className="top" style={{ marginBottom: 10 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <input className="title-in" value={d.name} onChange={(e) => upd({ ...d, name: e.target.value })} aria-label="Titolo" />
          <div className="row" style={{ gap: 8, marginTop: 4 }}>
            <span className={`pill ${saved ? "ok" : "info"}`}>{saved ? "Salvato" : "Salvataggio…"}</span>
            {d.due && <span className="pill info">entro {new Date(d.due).toLocaleDateString("it-IT")}</span>}
            <button className="btn ghost sm" onClick={() => setMore(!more)}>Dettagli <ChevronDown size={14} /></button>
          </div>
        </div>
        <div className="row noprint">
          <Link className="btn sm" href={`/app/decisioni/${d.id}/report`}><FileText size={15} /> Report</Link>
          <button className="btn sm" onClick={freeze} title="Salva una fotografia di questa analisi nel Registro"><Snowflake size={15} /> Congela</button>
          <Link className="btn sm" href={`/app/registro?d=${d.id}`}><CheckCircle2 size={15} /> Ho deciso</Link>
          <button className="iconbtn" title="Elimina" onClick={del}><Trash2 size={17} /></button>
        </div>
      </div>
      {more && (
        <div className="card grid g3" style={{ marginBottom: 14 }}>
          <div><label className="f">Stato</label><select value={d.status} onChange={(e) => upd({ ...d, status: e.target.value as Decision["status"] })}><option value="aperta">Aperta</option><option value="presa">Presa</option><option value="archiviata">Archiviata</option></select></div>
          <div><label className="f">Da decidere entro</label><input type="date" value={d.due ?? ""} onChange={(e) => upd({ ...d, due: e.target.value || null })} /></div>
          <div><label className="f">Peso rispetto alle altre decisioni</label><select value={d.imp} onChange={(e) => upd({ ...d, imp: +e.target.value })}><option value={1}>Normale</option><option value={2}>Alta</option><option value={3}>Molto alta</option></select></div>
          <div style={{ gridColumn: "1/-1" }}><label className="f">La situazione in breve</label><textarea style={{ minHeight: 70 }} value={d.descr ?? ""} onChange={(e) => upd({ ...d, descr: e.target.value })} /></div>
        </div>
      )}

      {/* stepper */}
      <div className="stepper noprint">
        {STEPS.map((l, i) => {
          const ok = i < 4 ? st.done[i] : !provisional && !!top;
          const opt = i === 3;
          return (
            <button key={l} className={`stp ${S === i ? "on" : ""} ${ok ? "ok" : ""}`} onClick={() => setStep(i)}>
              <span className="n">{ok ? <Check size={14} /> : i + 1}</span>
              <span className="l">{l}{opt && !ok ? <small> facoltativo</small> : null}</span>
            </button>
          );
        })}
      </div>
      <div className="progress noprint"><span style={{ width: `${st.pct}%` }} /></div>

      {/* ---------- 1. ALTERNATIVE ---------- */}
      {S === 0 && (
        <section className="stack">
          <h2 className="sh">Quali strade hai davanti?</h2>
          <Hint>Scrivi le alternative reali, da 2 a 3: due offerte, due case, due fornitori, fare o non fare. Per ognuna annota pro e contro a parole: servono a capire, e dopo a non ingannarti. Includi quasi sempre <b>lasciare le cose come stanno</b> e, se esiste, una <b>via di mezzo</b>: spesso è la scelta migliore e nessuno la considera.</Hint>
          <div className="grid g3">
            {m.options.map((o, i) => (
              <div key={o.id} className="card stack">
                <div className="row between" style={{ flexWrap: "nowrap" }}>
                  <span className="optbadge" style={{ background: ["#15406a", "#13879a", "#e49b2f"][i] }}>{String.fromCharCode(65 + i)}</span>
                  <button className="iconbtn" title="Elimina" onClick={() => confirm(`Eliminare «${o.name}»?`) && setM((mm) => { mm.options = mm.options.filter((x) => x.id !== o.id); })}><Trash2 size={15} /></button>
                </div>
                <input value={o.name} placeholder="Nome dell'alternativa" onChange={(e) => setM((mm) => { opt(mm, o.id).name = e.target.value; })} style={{ fontWeight: 600 }} />
                <textarea style={{ minHeight: 60 }} placeholder="In due parole: cosa comporta?" value={o.note ?? ""} onChange={(e) => setM((mm) => { opt(mm, o.id).note = e.target.value; })} />
                <PcList kind="pro" items={o.pro ?? []} onChange={(v) => setM((mm) => { opt(mm, o.id).pro = v; })} />
                <PcList kind="con" items={o.con ?? []} onChange={(v) => setM((mm) => { opt(mm, o.id).con = v; })} />
              </div>
            ))}
            {m.options.length < 3 && (
              <div className="card stack" style={{ borderStyle: "dashed", justifyContent: "center" }}>
                <button className="btn" onClick={() => setM((mm) => { mm.options.push({ id: uid(), name: "", s: {} }); })}><Plus size={16} /> Aggiungi alternativa</button>
                {!m.options.some((o) => /com'è|status quo|restare|rimanere/i.test(o.name)) && <button className="btn ghost sm" onClick={() => setM((mm) => { mm.options.push({ id: uid(), name: "Lasciare tutto com'è", s: {} }); })}>+ Lasciare tutto com&apos;è</button>}
                <button className="btn ghost sm" onClick={() => setM((mm) => { mm.options.push({ id: uid(), name: "Via di mezzo / negoziare", s: {} }); })}>+ Via di mezzo / negoziare</button>
              </div>
            )}
          </div>
          {m.options.length >= 3 && <small>Massimo 3 alternative: oltre, il confronto diventa confuso.</small>}
        </section>
      )}

      {/* ---------- 2. COSA CONTA ---------- */}
      {S === 1 && (
        <section className="stack">
          <h2 className="sh">Cosa conta per te in questa scelta?</h2>
          {m.nota && <div className="note"><b>Nota dell&apos;Analista:</b> {m.nota}</div>}
          <Hint>Per ogni aspetto scegli come misurarlo. <b>Cifra</b> se si conta (soldi, ore, km): poi indichi cosa per te è pessimo e cosa è ottimo. <b>Giudizio</b> se si valuta (famiglia, crescita): poi scegli da Pessimo a Ottimo. Evita doppioni che misurano la stessa cosa (es. «prezzo» e «convenienza»).</Hint>
          {m.criteria.map((c) => {
            const w = nm.criteria.find((x) => x.id === c.id)!.w;
            const k = cons(c.id);
            const isNum = c.kind === "num";
            const lessBetter = isNum && c.worst != null && c.best != null && c.best < c.worst;
            return (
              <div key={c.id} className="card stack crit">
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <input value={c.name} onChange={(e) => setM((mm) => { crit(mm, c.id).name = e.target.value; })} style={{ fontWeight: 600 }} aria-label="Nome criterio" />
                  <button className="iconbtn" title="Elimina" onClick={() => setM((mm) => { mm.criteria = mm.criteria.filter((x) => x.id !== c.id); mm.constraints = mm.constraints.filter((x) => x.crit !== c.id); if (mm.criteria.some((x) => x.imp != null)) { const ww = weightsFromImp(mm.criteria); mm.criteria.forEach((x, i) => { x.w = ww[i]; }); } })}><Trash2 size={15} /></button>
                </div>
                <input className="why-in" placeholder="Perché conta in questa scelta? (facoltativo)" value={c.why ?? ""} onChange={(e) => setM((mm) => { crit(mm, c.id).why = e.target.value; })} />
                <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
                  <div>
                    <label className="f">Come lo misuri</label>
                    <div className="seg"><button className={isNum ? "on" : ""} onClick={() => setKind(c.id, "num")}>Cifra</button><button className={c.kind === "g" ? "on" : ""} onClick={() => setKind(c.id, "g")}>Giudizio</button>{!c.kind && <button className="on" title="Formato precedente">Punteggio 0-100</button>}</div>
                    {isNum && (
                      <div className="stack" style={{ marginTop: 10 }}>
                        <div><label className="f">Unità</label><input list="units" value={c.unit ?? ""} onChange={(e) => setM((mm) => { crit(mm, c.id).unit = e.target.value; })} style={{ width: 160 }} /></div>
                        <div className="row" style={{ alignItems: "flex-end" }}>
                          <div><label className="f">Pessimo</label><Num value={c.worst} onChange={(v) => setM((mm) => { crit(mm, c.id).worst = v; })} /></div>
                          <button className="iconbtn" title="Inverti: meno è meglio" onClick={() => setM((mm) => { const x = crit(mm, c.id); [x.worst, x.best] = [x.best, x.worst]; })}><ArrowLeftRight size={16} /></button>
                          <div><label className="f">Ottimo</label><Num value={c.best} onChange={(v) => setM((mm) => { crit(mm, c.id).best = v; })} /></div>
                        </div>
                        <small>{c.worst == null || c.best == null || c.worst === c.best ? <span className="err">Indica pessimo e ottimo, diversi tra loro.</span> : lessBetter ? "Meno è meglio (es. un costo)." : "Più è meglio."}</small>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="f">Quanto conta</label>
                    <div className="dots">
                      {[1, 2, 3, 4, 5].map((i) => <button key={i} className={(c.imp ?? 0) >= i ? "on" : ""} onClick={() => setImp(c.id, i)} aria-label={`Importanza ${i}`}>{i}</button>)}
                    </div>
                    <small>{["", "Poco", "Abbastanza", "Importante", "Molto importante", "Fondamentale"][c.imp ?? 0] || "Scegli da 1 a 5"} · pesa il <b>{w}%</b> del totale</small>
                    {(() => {
                      const gp = priGap(c.name, c.imp, ws.profile.priorities);
                      return gp ? (
                        <div className="prigap">
                          Nelle tue priorità generali <b>{gp.label}</b> vale {gp.pri}/5, qui {gp.g > 0 ? "conta molto di più" : "conta molto di meno"}. È voluto?
                          <button className="btn ghost sm" onClick={() => setImp(c.id, gp.pri)}>Allinea a {gp.pri}</button>
                        </div>
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <label className="f">Requisito minimo (non negoziabile)</label>
                    {!k ? (
                      <button className="btn sm" onClick={() => setCons(c.id, isNum ? (lessBetter ? { max: c.worst } : { min: c.worst }) : { min: 50 })}>+ Imposta un limite</button>
                    ) : (
                      <div className="row">
                        {isNum ? (
                          <>
                            <select style={{ width: "auto" }} value={k.max != null ? "max" : "min"} onChange={(e) => setCons(c.id, e.target.value === "max" ? { max: k.min ?? k.max } : { min: k.max ?? k.min })}><option value="min">almeno</option><option value="max">al massimo</option></select>
                            <Num value={k.min ?? k.max} suffix={c.unit} onChange={(v) => setCons(c.id, k.max != null ? { max: v } : { min: v })} />
                          </>
                        ) : (
                          <><span className="muted">almeno</span><select style={{ width: "auto" }} value={k.min ?? 50} onChange={(e) => setCons(c.id, { min: +e.target.value })}>{LEVELS.map((l, i) => <option key={l} value={i * 25}>{l}</option>)}</select></>
                        )}
                        <button className="iconbtn" title="Togli il limite" onClick={() => setCons(c.id, null)}><Trash2 size={15} /></button>
                      </div>
                    )}
                    <small style={{ display: "block", marginTop: 6 }}>Sotto questo limite l&apos;alternativa è scartata, qualunque sia il resto.</small>
                  </div>
                </div>
              </div>
            );
          })}
          <datalist id="units">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>
          <div className="card stack" style={{ borderStyle: "dashed" }}>
            <div className="row"><button className="btn" onClick={() => addCrit({})}><Plus size={16} /> Aggiungi criterio</button><small>oppure scegli tra gli aspetti più comuni:</small></div>
            {CRIT_LIB.map((g) => {
              const items = g.items.filter((x) => !m.criteria.some((c) => c.name.toLowerCase() === x.name.toLowerCase()));
              return items.length ? (
                <div key={g.g} className="libg"><b>{g.g}</b>{items.map((x) => <button key={x.name} className="pill info" style={{ cursor: "pointer", border: 0, padding: ".45em .8em" }} onClick={() => addCrit(x)}>+ {x.name}</button>)}</div>
              ) : null;
            })}
          </div>
        </section>
      )}

      {/* ---------- 3. VALUTA ---------- */}
      {S === 2 && (
        <section className="stack">
          <h2 className="sh">Come se la cava ogni alternativa?</h2>
          {!m.options.length || !m.criteria.length ? <div className="card empty">Prima completa i passi 1 e 2.</div> : (
            <>
              <Hint>Compila ogni casella. Per le cifre metti il valore reale; per i giudizi scegli il livello. Indica anche <b>da dove viene il dato</b>: le stime pesano sull&apos;affidabilità del risultato.{st.missing.length ? <> Mancano <b>{st.missing.length}</b> valori.</> : <> Tutto compilato.</>}</Hint>
              {m.criteria.map((c) => (
                <div key={c.id} className="card stack">
                  <div className="row between">
                    <h3 style={{ margin: 0 }}>{c.name}</h3>
                    <small>{c.kind === "num" ? `${c.unit ?? ""} · pessimo ${c.worst ?? "?"} → ottimo ${c.best ?? "?"}` : c.kind === "g" ? "Giudizio" : "Punteggio 0-100"}</small>
                  </div>
                  {m.options.map((o, i) => {
                    const val = c.kind === "num" ? o.raw?.[c.id] : o.s?.[c.id];
                    const meta = o.m?.[c.id] ?? {};
                    const nk = `${o.id}.${c.id}`;
                    const sc = c.kind === "num" && val != null ? scaleNum(val, c) : null;
                    return (
                      <div key={o.id} className={`cell ${val == null ? "miss" : ""}`}>
                        <div className="cl"><span className="optbadge sm" style={{ background: ["#15406a", "#13879a", "#e49b2f"][i] }}>{String.fromCharCode(65 + i)}</span><b>{o.name || "(senza nome)"}</b></div>
                        <div className="cv">
                          {c.kind === "g" ? (
                            <div className="lv">{LEVELS.map((l, li) => (
                              <button key={l} title={l} className={val != null && levelOf(val) === li && o.s[c.id] === li * 25 ? "on" : ""} style={val != null && o.s[c.id] === li * 25 ? { background: LVC[li], borderColor: LVC[li], color: "#fff" } : undefined}
                                onClick={() => setM((mm) => { opt(mm, o.id).s[c.id] = li * 25; })}>{l}</button>
                            ))}</div>
                          ) : c.kind === "num" ? (
                            <span className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                              <Num value={val} suffix={c.unit} w={120} onChange={(v) => setM((mm) => { const x = opt(mm, o.id); x.raw ??= {}; if (v == null) delete x.raw[c.id]; else x.raw[c.id] = v; })} />
                              {sc != null && <span className="minibar" title={`${sc}/100 sulla tua scala`}><span style={{ width: `${sc}%` }} /></span>}
                            </span>
                          ) : (
                            <Num value={val} w={80} onChange={(v) => setM((mm) => { const x = opt(mm, o.id); if (v == null) delete x.s[c.id]; else x.s[c.id] = Math.max(0, Math.min(100, v)); })} />
                          )}
                          <span className="row" style={{ gap: 6 }}>
                            <select className="srcsel" value={meta.rel && meta.rel !== "?" ? meta.rel : ""} onChange={(e) => setM((mm) => { const x = opt(mm, o.id); x.m ??= {}; x.m[c.id] = { ...x.m[c.id], rel: (e.target.value || undefined) as Rel }; })}>
                              <option value="">Fonte?</option>{SRC.map((s) => <option key={s.k} value={s.k}>{s.l}</option>)}
                            </select>
                            <button className={`iconbtn ${meta.why ? "has" : ""}`} title="Nota" onClick={() => setNotes({ ...notes, [nk]: !notes[nk] })}><StickyNote size={15} /></button>
                          </span>
                        </div>
                        {(notes[nk] || meta.why) && <input className="note-in" placeholder="Perché? Da dove viene questo dato?" value={meta.why ?? ""} onChange={(e) => setM((mm) => { const x = opt(mm, o.id); x.m ??= {}; x.m[c.id] = { ...x.m[c.id], why: e.target.value }; })} />}
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="card stack">
                <h3 style={{ margin: 0 }}>Cosa non sai ancora</h3>
                <small>I dubbi che vanno chiariti prima di decidere: chiedili, cercali, poi segnali come chiariti.</small>
                {(m.assumptions ?? []).map((a) => (
                  <div key={a.id} className="row" style={{ flexWrap: "nowrap" }}>
                    <button className={`chk ${a.rel === "F" ? "on" : ""}`} title={a.rel === "F" ? "Chiarito" : "Da chiarire"} onClick={() => setM((mm) => { const x = mm.assumptions!.find((y) => y.id === a.id)!; x.rel = x.rel === "F" ? "?" : "F"; })}><Check size={14} /></button>
                    <input value={a.t} style={{ textDecoration: a.rel === "F" ? "line-through" : undefined }} onChange={(e) => setM((mm) => { mm.assumptions!.find((y) => y.id === a.id)!.t = e.target.value; })} />
                    <button className="iconbtn" onClick={() => setM((mm) => { mm.assumptions = mm.assumptions!.filter((y) => y.id !== a.id); })}><Trash2 size={15} /></button>
                  </div>
                ))}
                <button className="btn sm" style={{ alignSelf: "flex-start" }} onClick={() => setM((mm) => { (mm.assumptions ??= []).push({ id: uid(), t: "", rel: "?", dt: new Date().toISOString().slice(0, 10) }); })}><Plus size={14} /> Aggiungi un dubbio</button>
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------- 4. SOLDI E TEMPO ---------- */}
      {S === 3 && (
        <section className="stack">
          <h2 className="sh">Cosa cambia per soldi e tempo?</h2>
          <div className={`note ${noBase ? "warn" : ""} row between`}>
            <span><Wallet size={15} /> Oggi: risparmi <b>{eur(R.cash0 ?? 0)}</b> · restano <b>{eur(R.cash_m ?? 0)}</b> al mese · <b>{fmt(R.hours_w ?? 0)}</b> ore libere a settimana{noBase ? ". Imposta prima la tua situazione di partenza." : ""}</span>
            <Link href="/app/impostazioni" className="btn sm">Modifica</Link>
          </div>
          <Hint>Indica le <b>differenze rispetto a oggi</b> per ogni alternativa. Così Decision OS calcola quanti mesi reggi e cosa succede se va peggio del previsto. Per il mensile: <b>+</b> se a fine mese ti resta di più, <b>−</b> se ti resta di meno.</Hint>
          <div className="grid g3" style={{ alignItems: "start" }}>
            {m.options.map((o, i) => {
              const c0 = imp(o, "cash0"), cm = imp(o, "cash_m"), h = imp(o, "hours_w");
              const cmv = cm ? (Array.isArray(cm.v) ? cm.v : [cm.v, cm.v, cm.v]) : [null, null, null];
              const sim = applyCombo([o.id], new Map([[o.id, o]]), [], R, ws.profile.rules, 12, 1);
              const setCm = (k: number, v: number | null) => {
                const a = [...cmv] as (number | null)[]; a[k] = v;
                if (a.every((x) => x == null)) return setImpact(o.id, "cash_m", null);
                const mid = a[1] ?? a[0] ?? a[2] ?? 0;
                setImpact(o.id, "cash_m", [a[0] ?? mid, a[1] ?? mid, a[2] ?? mid]);
              };
              return (
                <div key={o.id} className="card stack">
                  <div className="row" style={{ flexWrap: "nowrap" }}><span className="optbadge" style={{ background: ["#15406a", "#13879a", "#e49b2f"][i] }}>{String.fromCharCode(65 + i)}</span><h3 style={{ margin: 0 }}>{o.name || "(senza nome)"}</h3></div>
                  {(o.impacts ?? []).some((x) => x.src === "ai") && (
                    <div className="aiflag">
                      <span><b>Stima dell&apos;AI</b>: questi importi li ha proposti l&apos;Analista, non sono dati tuoi. Correggili o confermali.</span>
                      <button className="btn sm" onClick={() => setM((mm) => { opt(mm, o.id).impacts?.forEach((x) => { delete x.src; }); })}><Check size={14} /> Li confermo</button>
                    </div>
                  )}
                  <div>
                    <label className="f">Spesa iniziale una tantum</label>
                    <Num value={c0 ? -mid(c0.v) : null} suffix="€" onChange={(v) => setImpact(o.id, "cash0", v == null ? null : -Math.abs(v), c0?.tag)} />
                    <small>Anticipo, acquisto, trasloco, iscrizione… scrivi l&apos;importo, senza segno.</small>
                    {c0 && <label className="row" style={{ gap: 6, fontSize: 13, marginTop: 4 }}><input type="checkbox" checked={!!c0.tag} onChange={(e) => setImpact(o.id, "cash0", c0.v, e.target.checked ? "spesa-condivisa" : undefined)} /> Spesa condivisa con altre decisioni (contata una volta sola)</label>}
                  </div>
                  <div>
                    <label className="f">Differenza al mese rispetto a oggi</label>
                    <div className="tri">
                      {["Se va male", "Probabile", "Se va bene"].map((l, k) => <div key={l}><small>{l}</small><Num value={cmv[k]} w={92} onChange={(v) => setCm(k, v)} /></div>)}
                    </div>
                    <small>In €/mese: quanto entra in più (o esce in più) ogni mese con questa scelta. Es. rata di 250 € → −250.</small>
                  </div>
                  <div>
                    <label className="f">Ore a settimana che richiede in più</label>
                    <Num value={h ? -mid(h.v) : null} suffix="ore" onChange={(v) => setImpact(o.id, "hours_w", v == null ? null : -v)} />
                  </div>
                  {(c0 || cm) && (
                    <div className="note" style={{ fontSize: 13 }}>
                      Tra 12 mesi (scenario probabile): <b>{eur(sim.res.cash_end ?? 0)}</b> di risparmi
                      {sim.res.autonomia_mesi !== Infinity ? <>, reggi <b>{fmt(sim.res.autonomia_mesi)}</b> mesi</> : null}.
                      {sim.viol.length ? <div className="err">⚠ {sim.viol.join("; ")}</div> : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <small>Vuoi vedere 3 mesi, 2 anni o 5 anni e gli scenari peggiori? Apri <Link href="/app/scenari">Scenari</Link>.</small>
        </section>
      )}

      {/* ---------- 5. RISULTATO ---------- */}
      {S === 4 && (
        <section className="stack">
          <div className={`verdict ${V.tone}`}>
            <div className="vi">{V.tone === "ok" ? <CheckCircle2 size={28} /> : <AlertCircle size={28} />}</div>
            <div><h2 style={{ margin: 0 }}>{V.t}</h2><p style={{ margin: "6px 0 0" }}>{V.s}</p></div>
          </div>
          {trade && !provisional && (
            <div className="grid g3" style={{ alignItems: "start" }}>
              <div className="card stack trade g">
                <h3 style={{ margin: 0 }}><TrendingUp size={18} /> Scegliendo {trade.a} guadagni</h3>
                <small>rispetto a {trade.b}</small>
                {trade.gains.length ? <ul className="clean">{trade.gains.map((x) => <li key={x}>{x}</li>)}</ul> : <small>Nessun vantaggio netto.</small>}
              </div>
              <div className="card stack trade l">
                <h3 style={{ margin: 0 }}><TrendingDown size={18} /> Rinunci a</h3>
                <small>rispetto a {trade.b}</small>
                {trade.losses.length ? <ul className="clean">{trade.losses.map((x) => <li key={x}>{x}</li>)}</ul> : <small>Nulla: {trade.a} è uguale o migliore su ogni aspetto.</small>}
              </div>
              <div className="card stack trade r">
                <h3 style={{ margin: 0 }}><ShieldAlert size={18} /> Rischi</h3>
                <small>cosa potrebbe andare diversamente</small>
                {trade.risks.length ? <ul className="clean">{trade.risks.map((x) => <li key={x}>{x}</li>)}</ul> : <small>Nessun rischio evidente nei dati inseriti.</small>}
              </div>
            </div>
          )}
          {!provisional && top && m.options.length > 1 && (
            <div className={`card row honest ${bias.length ? "warn" : "ok"}`} style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 14 }}>
              <span className="iconwrap"><Brain size={20} /></span>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>Testa o pancia?</h3>
                {bias.length ? <ul className="clean" style={{ marginTop: 6 }}>{bias.map((b) => <li key={b.k}>{b.t}</li>)}</ul>
                  : <p style={{ margin: "6px 0 0" }}>Nessun segnale che il risultato sia stato spinto a favore di una preferenza: vantaggio distribuito su più aspetti, stime non sbilanciate, stato attuale incluso nel confronto.</p>}
                <small>Non è un giudizio: è un invito a ricontrollare i punti dove di solito ci si racconta una storia.</small>
              </div>
            </div>
          )}
          {sol && !provisional && m.options.length > 1 && (
            <div className={`card row sol ${!sol.tested ? "" : sol.holds ? "ok" : "bad"}`} style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 14 }}>
              <span className="iconwrap"><Scale size={20} /></span>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ margin: 0 }}>Quanto sono solide le basi</h3>
                <div className="solbar" title="Composizione del punteggio della prima">
                  <span className="f" style={{ width: `${100 - sol.estShare - sol.unkShare}%` }} />
                  <span className="s" style={{ width: `${sol.estShare}%` }} />
                  <span className="u" style={{ width: `${sol.unkShare}%` }} />
                </div>
                <small>Punteggio di {top?.name}: <b>{100 - sol.estShare - sol.unkShare}%</b> su dati certi o dichiarati · <b>{sol.estShare}%</b> su stime{sol.unkShare ? <> · <b>{sol.unkShare}%</b> senza fonte indicata</> : null}</small>
                <p style={{ margin: "8px 0 0" }}>
                  {!sol.tested ? untestedText(sol)
                    : sol.holds ? <>Prova superata: anche se le tue stime fossero sbagliate del {sol.pct * 100}% a sfavore di {top?.name}, resterebbe prima.</>
                    : <><b>Attenzione:</b> se le stime fossero sbagliate del {sol.pct * 100}% a sfavore di {top?.name}, passerebbe in testa <b>{sol.newTop}</b>. Verifica le stime prima di decidere.</>}
                </p>
              </div>
            </div>
          )}
          <div className="grid g2" style={{ alignItems: "start" }}>
            <div className="card stack">
              <h3 style={{ margin: 0 }}>Il confronto</h3>
              {m.criteria.length && m.options.length ? <ScoreBars rows={res.rows} reasons={false} provisional={!concl.ok} /> : <small>Niente da confrontare ancora.</small>}
              {res.rows.filter((r) => r.excluded.length).map((r) => <div key={r.id} className="note bad"><b>{r.name}</b> è scartata: {r.excluded.join("; ")}.</div>)}
              {res.rows.filter((r) => r.pending.length).map((r) => <div key={r.id} className="note warn"><b>{r.name}</b>: requisito da verificare ({r.pending.join("; ")}).</div>)}
              {res.warn.filter((w) => !w.startsWith("Somma pesi")).map((w) => <div key={w} className="note warn">{w}</div>)}
            </div>
            <div className="stack">
              <div className="card stack">
                <h3 style={{ margin: 0 }}><Lightbulb size={18} /> Cosa ti farebbe cambiare idea</h3>
                {provisional ? <small>Completa tutti i valori per calcolarlo.</small> : turns.length ? (
                  <ul className="clean">{turns.map((t) => <li key={t.crit}>{t.text}</li>)}</ul>
                ) : <small>Nessun singolo valore, da solo, ribalta la classifica: il risultato è solido.</small>}
                {!provisional && res.fragile.length > 0 && (
                  <div className="note warn" style={{ fontSize: 14 }}>
                    Dipende molto da quanto conta {res.fragile.map((f) => `«${f.name}»`).join(" e ")}: piccole variazioni di importanza cambiano il vincitore. Chiediti se l&apos;importanza che hai dato è davvero quella.
                  </div>
                )}
              </div>
              <div className="card stack contro">
                <h3 style={{ margin: 0 }}><Swords size={18} /> Il parere contrario</h3>
                {!contro ? (
                  <>
                    <small>L&apos;Analista cerca i migliori argomenti <b>contro</b> {top ? `«${top.name}»` : "la prima scelta"}: alternative ignorate, ipotesi deboli, pesi discutibili.</small>
                    <button className="btn pri" disabled={aiBusy || !top} onClick={runContro}><Swords size={15} /> {aiBusy ? "L'Analista sta ragionando…" : "Mettimi alla prova"}</button>
                  </>
                ) : (
                  <>
                    <ul className="clean">{contro.p.map((x, i) => <li key={i}>{x}</li>)}</ul>
                    {contro.c && <div className="note"><b>{contro.c}</b></div>}
                    <div className="row between">
                      <small>{contro.h === aiHash ? `Generato il ${new Date(contro.at).toLocaleDateString("it-IT")}` : <span style={{ color: "#a86a10" }}>Hai cambiato i dati da allora: il parere potrebbe non essere più valido.</span>}</small>
                      <button className="btn sm" disabled={aiBusy} onClick={runContro}><RefreshCw size={14} /> {aiBusy ? "…" : "Rifai"}</button>
                    </div>
                  </>
                )}
                {aiErr && <div className="err">{aiErr}</div>}
                <small>All&apos;AI vanno criteri e valori{ws.profile.ai_share.economia ? ", cifre economiche" : ""}{ctxStr ? " e contesto" : ""}. Il parere resta salvato: non viene richiesto di nuovo finché non lo rifai.</small>
              </div>
              {gaps.length > 0 && (
                <div className="note warn" style={{ fontSize: 14 }}>
                  Importanza diversa dalle tue priorità generali: {gaps.map((x) => `«${x.c.name}» ${x.c.imp}/5 (${x.g!.label} ${x.g!.pri}/5)`).join(", ")}. <button className="btn ghost sm" onClick={() => setStep(1)}>Rivedi</button>
                </div>
              )}
              <div className="card stack">
                <h3 style={{ margin: 0 }}>Prossimi passi</h3>
                {provisional && <button className="btn" onClick={() => setStep(2)}><ArrowLeft size={15} /> Completa i {st.missing.length} valori mancanti</button>}
                {!m.options.some((o) => (o.impacts ?? []).length) && <button className="btn" onClick={() => setStep(3)}>Aggiungi l&apos;impatto su soldi e tempo</button>}
                <Link href={`/app/analista?d=${d.id}`} className="btn"><Bot size={15} /> Altre analisi: dati e punto di svolta</Link>
                <button className="btn" onClick={freeze}><Snowflake size={15} /> Congela questa analisi</button>
                <Link href={`/app/registro?d=${d.id}`} className="btn pri"><CheckCircle2 size={15} /> Ho deciso: registra la scelta</Link>
              </div>
            </div>
          </div>
          <div className="card stack">
            <div className="row between">
              <h3 style={{ margin: 0 }}><Link2 size={18} /> Effetti sulle altre decisioni</h3>
              {m.options.length > 1 && others.length > 0 && (
                <select style={{ width: "auto" }} value={cOpt} onChange={(e) => setCrossOpt(e.target.value)} aria-label="Se scelgo">
                  {m.options.map((o) => <option key={o.id} value={o.id}>Se scelgo: {o.name || "(senza nome)"}</option>)}
                </select>
              )}
            </div>
            {!others.length ? (
              <small>Nessun&apos;altra decisione aperta. Quando ne aggiungi una (un progetto, la casa, un acquisto), qui vedrai come si influenzano: conflitti di tempo e soldi, scelte che diventano impossibili.</small>
            ) : cross.map((cx) => (
              <div key={cx.dec} className="xdec">
                <div className="row between"><b>{cx.name}</b><Link href={`/app/decisioni/${cx.dec}`} className="btn ghost sm">Apri <ArrowRight size={14} /></Link></div>
                {cx.rows.map((r) => (
                  <div key={r.id} className={`xrow ${r.ok ? "ok" : "no"}`}>
                    <span className={`pill ${r.ok ? "ok" : r.why[0] === "già scartata nella sua decisione" ? "info" : "bad"}`}>{r.ok ? "resta possibile" : r.why[0] === "già scartata nella sua decisione" ? "già scartata" : "diventa impossibile"}</span>
                    <span className="xn">{r.name}</span>
                    <small className="xw">{r.ok ? <>ti restano {fmt(r.hours ?? 0)} h/settimana · {eur(r.cashM ?? 0)}/mese</> : r.why[0] === "già scartata nella sua decisione" ? null : r.why.join("; ")}</small>
                    {r.auto && <button className="btn sm" onClick={() => ws.saveDep({ id: uid(), if: cOpt, excl: r.id, why: r.why[0], confirmed: true })}>Segna come incompatibili</button>}
                  </div>
                ))}
              </div>
            ))}
            {others.length > 0 && <small>I conflitti di tempo e soldi sono rilevati in automatico dai tuoi limiti di sicurezza. Gli altri legami (es. «se mi trasferisco, il progetto si ferma») li aggiungi in <Link href="/app/connessioni">Connessioni</Link>.</small>}
          </div>
          <Link href={`/app/decisioni/${d.id}/report`} className="card row repcta" style={{ textDecoration: "none", color: "inherit", flexWrap: "nowrap", gap: 14 }}>
            <span className="iconwrap n"><FileText size={20} /></span>
            <span style={{ flex: 1 }}><b>Report completo</b><br /><small>Premessa, alternative con pro, contro e conseguenze, scenari, effetti, piano d&apos;azione. Pronto da salvare in PDF.</small></span>
            <ArrowRight size={18} />
          </Link>
          <details className="card">
            <summary>Come è stato calcolato</summary>
            <div className="tablewrap" style={{ marginTop: 10 }}>
              <table className="t num"><thead><tr><th>Alternativa</th><th>Criterio</th><th>Valore</th><th>Sulla tua scala</th><th>Peso</th><th>Contributo</th></tr></thead>
                <tbody>{res.rows.flatMap((r) => r.detail.map((x, i) => (
                  <tr key={r.id + x.crit}><td>{i ? "" : <strong>{r.name}</strong>}</td><td>{x.name}</td>
                    <td>{x.kind === "num" ? (x.raw != null ? `${fmt(x.raw)} ${x.unit ?? ""}` : "—") : x.kind === "g" ? (x.s != null ? LEVELS[levelOf(x.s)] : "—") : x.s ?? "—"}</td>
                    <td>{x.s ?? "—"}</td><td>{x.w}%</td><td>{x.contrib ?? "—"}</td></tr>
                )))}</tbody></table>
            </div>
            <small>Punteggio = somma di (valore sulla tua scala × peso). Misura quanto un&apos;alternativa rispetta le tue priorità, non la probabilità che sia giusta.</small>
          </details>
        </section>
      )}

      <div className="row between noprint" style={{ marginTop: 22 }}>
        {S > 0 ? <button className="btn" onClick={() => { setStep(S - 1); window.scrollTo({ top: 0 }); }}><ArrowLeft size={16} /> {STEPS[S - 1]}</button> : <span />}
        {S < 4 && <button className="btn pri" onClick={() => { setStep(S + 1); window.scrollTo({ top: 0 }); }}>{STEPS[S + 1]} <ArrowRight size={16} /></button>}
      </div>
    </div>
  );
}
