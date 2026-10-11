"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Plus, Trash2, Snowflake, CheckCircle2, Bot, Check, AlertCircle, ArrowRight, ArrowLeft,
  ArrowLeftRight, GitBranch, Sparkles, ListOrdered, Milestone, Lightbulb, StickyNote, Wallet, ChevronDown, TrendingUp, TrendingDown, ShieldAlert, Link2, Scale, Swords, RefreshCw, ThumbsUp, ThumbsDown, X, Brain, FileText,
} from "lucide-react";
import { useWs } from "@/components/Workspace";
import { ScoreBars } from "@/components/charts";
import {
  analyzeDecision, applyCombo, combos, eur, fmt, normalize, turningPoints, uid, weightsFromImp, scaleNum, levelOf,
  tradeoff, solidity, crossEffects, hashOf, biasChecks, conclusive, infoValue, readiness, focus, stopText, fallbackText, oddScenario, isStatusQuo, riskViews, riskSummary, customRes,
  type Resources, type Rule, type Risk,
  areasOf, phasesOf, snapPhase, PHASE_SETS, PLAN_L, PLAN_D, type Area, type Horizon, type Cond, type Dilemma as DilemmaT, type PlanKind, type Phase,
  LEVELS, type Crit, type Decision, type Impact, type Model, type Opt, type Rel, untestedText } from "@/lib/engine";
import { CRIT_LIB } from "@/lib/templates";
import { briefing } from "@/lib/narrative";
import { impFor, priGap } from "@/lib/priorities";
import { ai, compact, mergeStrade, type AiStrade } from "@/lib/ai";

const LVC = ["#c94040", "#e07b39", "#d9a521", "#7bb661", "#23906a"];
const SRC: { k: Rel; l: string }[] = [{ k: "F", l: "Certo" }, { k: "D", l: "Me l'hanno detto" }, { k: "S", l: "Stima mia" }];
const UNITS = ["€/mese", "€", "€/anno", "ore/settimana", "minuti", "km", "mesi"];

const OPC = ["#15406a", "#13879a", "#e49b2f", "#7a5bbf", "#3f8f5b"];
const KDL = PLAN_L;
const areaL = (a: Area) => a.charAt(0).toUpperCase() + a.slice(1);
const ST_L: Record<Cond["st"], string> = { "?": "Da verificare", si: "Sì", no: "No" };

const STEPS = ["Strade", "Conseguenze", "Cosa conta", "Valuta", "Soldi e tempo", "Decisione"];

/* ---------- stato di completezza ---------- */
function status(d: Decision) {
  const m = d.model;
  const scaleMissing = m.criteria.filter((c) => c.kind === "num" && (c.worst == null || c.best == null || c.worst === c.best));
  const cells = m.options.flatMap((o) => m.criteria.map((c) => ({ o, c })));
  const missing = cells.filter(({ o, c }) => (c.kind === "num" ? o.raw?.[c.id] == null : o.s?.[c.id] == null));
  const money = m.options.some((o) => (o.impacts ?? []).length);
  const done = [m.options.length >= 2, m.criteria.length >= 1 && !scaleMissing.length, cells.length > 0 && !missing.length, money];
  const pct = Math.round(((done[0] ? 1 : 0) + (done[1] ? 1 : 0) + (cells.length ? (cells.length - missing.length) / cells.length : 0) + (money ? 0.5 : 0)) / 3.5 * 100);
  const conseq = m.options.length >= 2 && m.options.every((o) => (o.tl ?? []).length || (o.cond ?? []).length);
  return { scaleMissing, missing, cells: cells.length, done, pct, conseq };
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

/** Strade mancanti: falso dilemma con proposte da aggiungere. */
function Dilemma({ d, add }: { d: DilemmaT; add: (kd: PlanKind, name: string) => void }) {
  return (
    <div className="card stack dilemma">
      <h3 style={{ margin: 0 }}><GitBranch size={18} /> Mancano strade</h3>
      <p style={{ margin: 0 }}>{d.msg}</p>
      <div className="stack" style={{ gap: 8 }}>
        {d.sugg.map((x) => (
          <div key={x.kd} className="row between sugg" style={{ flexWrap: "nowrap", gap: 10 }}>
            <span style={{ minWidth: 0 }}><b>{x.name}</b><br /><small>{x.why}</small></span>
            <button className="btn sm" onClick={() => add(x.kd, x.name)}><Plus size={14} /> Aggiungi</button>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Conseguenze nel tempo, decisioni generate e condizioni di una strada. */
function Conseq({ o, i, setM, onNewDecision, base, rules, phs, ars }: { o: Opt; i: number; setM: (fn: (m: Model) => void) => void; onNewDecision: (name: string) => void; base: Resources; rules: Rule[]; phs: Horizon[]; ars: Area[] }) {
  const [rt, setRt] = useState("");
  const rv = riskViews(o, base, rules);
  const editR = (rid: string, fn: (r: Risk) => void) => setM((mm) => { const r = mm.options.find((y) => y.id === o.id)!.risks?.find((z) => z.id === rid); if (r) { fn(r); delete r.src; } });
  const addRk = () => { if (!rt.trim()) return; setM((mm) => { const x = mm.options.find((y) => y.id === o.id)!; (x.risks ??= []).push({ id: uid(), t: rt.trim(), p: "media", src: "user" }); }); setRt(""); };
  const [ph, setPh] = useState(phs[0].h), [ar, setAr] = useState<Area>(ars[0]), [tt, setTt] = useState("");
  const [nx, setNx] = useState(""), [ct, setCt] = useState("");
  const edit = (fn: (x: Opt) => void) => setM((mm) => { fn(mm.options.find((y) => y.id === o.id)!); });
  const addTl = () => { if (!tt.trim()) return; edit((x) => { (x.tl ??= []).push({ h: ph, a: ars.includes(ar) ? ar : ars[0], t: tt.trim(), src: "user" }); }); setTt(""); };
  const addNx = () => { if (!nx.trim()) return; edit((x) => { (x.next ??= []).push(nx.trim()); }); setNx(""); };
  const addCd = () => { if (!ct.trim()) return; edit((x) => { (x.cond ??= []).push({ id: uid(), t: ct.trim(), st: "?", src: "user" }); }); setCt(""); };
  const tl = o.tl ?? [];
  return (
    <div className="card stack conseq">
      <div className="row" style={{ gap: 10, flexWrap: "nowrap" }}>
        <span className="optbadge" style={{ background: OPC[i % OPC.length] }}>{String.fromCharCode(65 + i)}</span>
        <h3 style={{ margin: 0, minWidth: 0 }}>{o.name || "(senza nome)"}</h3>
        {o.kd && o.kd !== "base" && <span className="pill teal">{KDL[o.kd]}</span>}
      </div>
      <div className="tline">
        {phs.map(({ h, l }) => (
          <div key={h} className="tcol">
            <b>{l}</b>
            {tl.map((x, k) => ({ x, k })).filter(({ x }) => snapPhase(phs, x.h).h === h).map(({ x, k }) => (
              <div key={k} className="titem">
                {x.a && <span className={`pill area ${x.a}`}>{areaL(x.a)}</span>}
                <span>{x.t}{x.src === "ai" && <span className="aitag" title="Proposto dall'AI">AI</span>}</span>
                <button className="iconbtn" aria-label="Togli" onClick={() => edit((y) => { y.tl = (y.tl ?? []).filter((_, j) => j !== k); })}><X size={13} /></button>
              </div>
            ))}
            {!tl.some((x) => snapPhase(phs, x.h).h === h) && <small className="muted">—</small>}
          </div>
        ))}
      </div>
      <div className="row tadd">
        <select aria-label="Quando" value={ph} onChange={(e) => setPh(+e.target.value)}>{phs.map((x) => <option key={x.h} value={x.h}>{x.l}</option>)}</select>
        <select aria-label="Area" value={ars.includes(ar) ? ar : ars[0]} onChange={(e) => setAr(e.target.value)}>{ars.map((a) => <option key={a} value={a}>{areaL(a)}</option>)}</select>
        <input placeholder="Cosa succede, concretamente" value={tt} onChange={(e) => setTt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTl(); }} />
        <button className="btn sm" onClick={addTl}><Plus size={14} /> Aggiungi</button>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="stack" style={{ gap: 6 }}>
          <label className="f">Cosa deve essere vero perché abbia senso</label>
          {(o.cond ?? []).map((c) => (
            <div key={c.id} className={`condrow st-${c.st === "?" ? "q" : c.st}`}>
              <div style={{ minWidth: 0 }}>
                <span>{c.t}</span>{c.src === "ai" && <span className="aitag" title="Proposta dall'AI">AI</span>}
                {c.how && <small className="muted" style={{ display: "block" }}>Come verificarlo: {c.how}</small>}
                <label className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={!!c.gate} onChange={(e) => edit((y) => { y.cond!.find((z) => z.id === c.id)!.gate = e.target.checked; })} /> se è no, scarto questa strada</label>
              </div>
              <div className="seg sm" role="group" aria-label={`Stato: ${c.t}`}>
                {(["?", "si", "no"] as const).map((v) => <button key={v} className={c.st === v ? "on" : ""} onClick={() => edit((y) => { y.cond!.find((z) => z.id === c.id)!.st = v; })}>{ST_L[v]}</button>)}
              </div>
              <button className="iconbtn" aria-label="Togli condizione" onClick={() => edit((y) => { y.cond = (y.cond ?? []).filter((z) => z.id !== c.id); })}><X size={13} /></button>
            </div>
          ))}
          <input placeholder="+ condizione (es. affitto annuale sotto 1.200 €)" value={ct} onChange={(e) => setCt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCd(); }} onBlur={addCd} />
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <label className="f">Decisioni che questa strada ti costringe a prendere dopo</label>
          {(o.next ?? []).map((x, k) => (
            <div key={k} className="row between nxrow" style={{ flexWrap: "nowrap", gap: 8 }}>
              <span style={{ minWidth: 0 }}>{x}</span>
              <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                <button className="btn ghost sm" title="Crea come decisione separata" onClick={() => onNewDecision(x)}>Apri come decisione</button>
                <button className="iconbtn" aria-label="Togli" onClick={() => edit((y) => { y.next = (y.next ?? []).filter((_, j) => j !== k); })}><X size={13} /></button>
              </span>
            </div>
          ))}
          <input placeholder="+ decisione che verrà dopo" value={nx} onChange={(e) => setNx(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNx(); }} onBlur={addNx} />
        </div>
      </div>

      <div className="stack" style={{ gap: 6 }}>
        <label className="f">Cosa può andare storto: rischi, impatto e contromisure</label>
        {rv.map((r) => (
          <div key={r.id} className={`riskrow p-${r.p}`}>
            <div className="rk-top">
              <span className="rk-t">{r.t}{r.src === "ai" && <span className="aitag" title="Proposto dall'AI">AI</span>}</span>
              <div className="seg sm" role="group" aria-label={`Probabilità: ${r.t}`}>
                {(["bassa", "media", "alta"] as const).map((v) => <button key={v} className={r.p === v ? "on" : ""} onClick={() => editR(r.id, (z) => { z.p = v; })}>{v[0].toUpperCase() + v.slice(1)}</button>)}
              </div>
              <button className="iconbtn" aria-label="Togli rischio" onClick={() => setM((mm) => { const x = mm.options.find((y) => y.id === o.id)!; x.risks = (x.risks ?? []).filter((z) => z.id !== r.id); })}><X size={13} /></button>
            </div>
            <div className="rk-num">
              <span><small>Perdita una tantum</small><Num value={r.c ? -r.c : null} w={90} suffix="€" onChange={(v) => editR(r.id, (z) => { z.c = v == null ? null : -Math.abs(v); })} /></span>
              <span><small>Al mese, mentre dura</small><Num value={r.m ? -r.m : null} w={90} suffix="€" onChange={(v) => editR(r.id, (z) => { z.m = v == null ? null : -Math.abs(v); })} /></span>
              <span><small>Per quanti mesi</small><Num value={r.d ?? null} w={60} suffix="mesi" onChange={(v) => editR(r.id, (z) => { z.d = v == null ? null : Math.abs(v); })} /></span>
            </div>
            <div className="rk-imp">
              {r.tot ? <>Se succede: <b>{eur(r.tot)}</b> in totale{r.endAfter != null ? <> · a 12 mesi resteresti con <b>{eur(r.endAfter)}</b></> : null}</> : <span className="muted">Impatto in € non indicato</span>}
              {r.breaks.length ? <span className="pill bad">oltre i tuoi limiti</span> : r.tot && r.endAfter != null ? <span className="pill ok">entro i tuoi limiti</span> : null}
            </div>
            <input placeholder="Come ridurlo: la contromisura" value={r.x ?? ""} onChange={(e) => editR(r.id, (z) => { z.x = e.target.value || undefined; })} />
          </div>
        ))}
        <input placeholder="+ rischio (es. contratto non rinnovato a fine stagione)" value={rt} onChange={(e) => setRt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addRk(); }} onBlur={addRk} />
      </div>
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
    setStep(!st.done[0] ? 0 : !st.done[1] ? 2 : st.missing.length ? 3 : 5);
  }, [d, st, step]);
  const res = useMemo(() => (d ? analyzeDecision(d) : null), [d]);
  const nm = useMemo(() => (d ? normalize(d.model) : null), [d]);
  const turns = useMemo(() => (d && res ? turningPoints(d, res) : []), [d, res]);
  const trade = useMemo(() => (d && res ? tradeoff(d, res) : null), [d, res]);
  const bias = useMemo(() => (d && res ? biasChecks(d, res) : []), [d, res]);
  const sol = useMemo(() => (d && res ? solidity(d, res) : null), [d, res]);
  const [crossOpt, setCrossOpt] = useState<string>("");
  const [newArea, setNewArea] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiErr, setAiErr] = useState("");
  const others = useMemo(() => ws.decisions.filter((x) => x.status === "aperta" && x.id !== id && x.model.options.length), [ws.decisions, id]);
  // decisione condizionata: quali dati ribaltano la scelta, condizioni aperte, strade mancanti
  const info = useMemo(() => (d ? infoValue(d) : []), [d]);
  const ready = useMemo(() => (d && res ? readiness(d, res, ws.profile.resources, ws.profile.rules, info) : null), [d, res, ws.profile.resources, ws.profile.rules, info]);
  const foc = useMemo(() => (d && res ? focus(d, res, turns, info) : null), [d, res, turns, info]);

  if (!d || !res || !st || !nm || !ready) return <div className="empty">Decisione non trovata. <Link href="/app/decisioni">Torna all&apos;elenco</Link></div>;
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
  const dilemma = ready.dilemma;
  const phs = phasesOf(m), ars = areasOf(m);
  const cres = customRes(R, ws.profile.resources_meta);
  // cambiare orizzonti: le tappe esistenti si agganciano al nuovo orizzonte più vicino (stesso ordine)
  const setPhases = (np: Horizon[]) => setM((mm) => {
    const old = phasesOf(mm);
    const rank = (h: number) => old.findIndex((x) => x.h === snapPhase(old, h).h);
    mm.options.forEach((o) => (o.tl ?? []).forEach((t) => { const r = rank(t.h); t.h = np[Math.min(np.length - 1, Math.max(0, r))].h; }));
    mm.phases = np;
  });
  const addArea = () => { const a = newArea.trim().toLowerCase(); if (!a) return; setM((mm) => { const cur = areasOf(mm); if (!cur.includes(a)) mm.areas = [...cur, a].slice(0, 10); }); setNewArea(""); };
  const conds = ready.open.filter((c) => c.grp === "cond"), chiar = ready.open.filter((c) => c.grp === "chiarire");
  const rsum = riskSummary(d, R, ws.profile.rules);
  const briefOrder = m.options.map((o) => {
    const row = res.rows.find((x) => x.id === o.id);
    const tag = o.id === ready.lead?.id ? "lead" : o.id === ready.fallback?.id ? "fb" : row?.excluded.length ? "out" : "";
    return { o, b: briefing(d, res, o, R, ws.profile.rules), tag, k: tag === "lead" ? 0 : tag === "fb" ? 1 : tag === "out" ? 3 : 2 };
  }).sort((a, b) => a.k - b.k);
  const setCondSt = (oid: string, cid: string, v: Cond["st"]) => setM((mm) => { const c = opt(mm, oid).cond?.find((x) => x.id === cid); if (c) c.st = v; });
  function addPlan(kd: PlanKind, name: string) {
    setM((mm) => { if (mm.options.length < 5) mm.options.push({ id: uid(), name, kd, s: {} }); });
  }
  async function newDecision(name: string) {
    const nid = await ws.createDecision({ name, descr: `Nata da «${d!.name}».` });
    if (nid) alert(`Creata la decisione «${name}»: la trovi in Decisioni.`);
  }
  const stradeHash = hashOf({ t: d.descr, o: m.options.map((o) => o.name) });
  async function runStrade() {
    setAiBusy(true); setAiErr("");
    try {
      const x = await ai<AiStrade>("strade", compact(d!, undefined, { eco: ws.profile.ai_share.economia, ctx: ctxStr }));
      const { model, added } = mergeStrade(m, x);
      model.ai = { ...model.ai, strade: { at: new Date().toISOString(), h: hashOf({ t: d!.descr, o: model.options.map((o) => o.name) }), ...(typeof x.x === "string" && x.x ? { x: x.x } : {}) } };
      upd({ ...d!, model });
      if (added.length) setAiErr("");
    } catch (e) { setAiErr((e as Error).message); } finally { setAiBusy(false); }
  }
  const sx = m.ai?.strade;
  const aiStradeBox = (
    <div className="card row aibox" style={{ gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <span className="iconwrap"><Bot size={20} /></span>
      <div style={{ flex: "1 1 260px", minWidth: 0 }}>
        <b>Analista: strade mancanti, conseguenze e condizioni</b>
        <small style={{ display: "block" }}>{sx ? (sx.h === stradeHash ? `Proposte il ${new Date(sx.at).toLocaleDateString("it-IT")}: ritrovi tutto nelle strade e nelle conseguenze, marcato AI.` : "Hai cambiato le strade da allora: puoi chiedere di nuovo.") : "Propone le strade che mancano e, per ognuna, cosa succede nel tempo e cosa deve essere vero. Completa solo ciò che è vuoto: non sovrascrive quello che hai scritto."}</small>
        {sx?.x && <div className="note" style={{ marginTop: 6 }}>{sx.x}</div>}
        {aiErr && <div className="err">{aiErr}</div>}
      </div>
      <button className="btn" disabled={aiBusy || (!!sx && sx.h === stradeHash)} onClick={runStrade}><Sparkles size={15} /> {aiBusy ? "L'Analista sta ragionando…" : sx ? "Chiedi di nuovo" : "Chiedi all'Analista"}</button>
    </div>
  );

  /* ---------- verdetto in linguaggio semplice ---------- */
  function verdict() {
    if (m.options.length < 2) return { tone: "warn", t: "Servono almeno due alternative.", s: "Torna al passo «Strade»." };
    if (!m.criteria.length) return { tone: "warn", t: "Dimmi cosa conta per te.", s: "Aggiungi almeno un criterio al passo «Cosa conta»." };
    if (!top) return { tone: "bad", t: "Nessuna alternativa rispetta i tuoi requisiti.", s: "Rivedi i requisiti minimi o cerca un'altra opzione." };
    const mg = res!.margin ?? 0;
    const gap = ok.length < 2 ? "è l'unica che rispetta i requisiti" : mg === 0 ? "è alla pari con " + ok[1].name : mg < 3 ? `è quasi alla pari con ${ok[1].name}` : mg < 10 ? `ha un vantaggio contenuto su ${ok[1].name}` : `ha un vantaggio netto su ${ok[1].name}`;
    if (concl.pend) return { tone: "warn", t: "Classifica provvisoria: la prima non ha ancora superato un requisito obbligatorio.", s: `${concl.pend.name} è davanti, ma va verificato: ${concl.pend.req.join("; ")}. Se non lo rispetta viene scartata e la classifica cambia. Completa il dato al passo «Valuta».` };
    if (ok.length < 2 && !provisional) return { tone: "ok", t: `Con le tue priorità di oggi prevale ${top.name}.`, s: `${top.name} è l'unica che rispetta tutti i tuoi requisiti.` };
    if (provisional && !concl.ok) return { tone: "warn", t: "Classifica provvisoria: i dati non bastano per una conclusione.", s: `Mancano ${st!.missing.length} valori (fino al ${concl.missW}% del peso). Con quei dati potrebbe prevalere ${concl.contenders.join(" oppure ")}. Completali al passo «Valuta».` };
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
          const ok = i === 0 ? st.done[0] : i === 1 ? st.conseq : i < 5 ? st.done[i - 1] : ready.state === "pronta";
          const opt = i === 4;
          return (
            <button key={l} className={`stp ${S === i ? "on" : ""} ${ok ? "ok" : ""}`} onClick={() => setStep(i)}>
              <span className="n">{ok ? <Check size={14} /> : i + 1}</span>
              <span className="l">{l}{opt && !ok ? <small> facoltativo</small> : null}</span>
            </button>
          );
        })}
      </div>
      <div className="progress noprint"><span style={{ width: `${st.pct}%` }} /></div>

      {/* ---------- 1. STRADE ---------- */}
      {S === 0 && (
        <section className="stack">
          <h2 className="sh">Quali strade hai davanti?</h2>
          <Hint>Le scelte vere quasi mai sono «sì o no». Oltre alla strada diretta pensa a una strada <b>condizionata</b> (solo se…), <b>sperimentale</b> (in prova, in piccolo, un pilota), <b>temporanea</b>, <b>rinviata</b> (quando avrai più informazioni) o a un&apos;<b>alternativa</b> da cercare. Negoziare non è una strada a parte: è il primo passo del piano, lo trovi alla fine.</Hint>
          {dilemma && <Dilemma d={dilemma} add={addPlan} />}
          <div className="grid g3">
            {m.options.map((o, i) => (
              <div key={o.id} className="card stack">
                <div className="row between" style={{ flexWrap: "nowrap" }}>
                  <span className="optbadge" style={{ background: OPC[i % OPC.length] }}>{String.fromCharCode(65 + i)}</span>
                  <select className="kdsel" aria-label="Tipo di strada" value={o.kd ?? "base"} onChange={(e) => setM((mm) => { opt(mm, o.id).kd = e.target.value as PlanKind; })}>
                    {(Object.keys(KDL) as PlanKind[]).map((k) => <option key={k} value={k} title={PLAN_D[k]}>{KDL[k]}</option>)}
                  </select>
                  <button className="iconbtn" title="Elimina" onClick={() => confirm(`Eliminare «${o.name}»?`) && setM((mm) => { mm.options = mm.options.filter((x) => x.id !== o.id); })}><Trash2 size={15} /></button>
                </div>
                <input value={o.name} placeholder="Nome dell'alternativa" onChange={(e) => setM((mm) => { opt(mm, o.id).name = e.target.value; })} style={{ fontWeight: 600 }} />
                <textarea style={{ minHeight: 60 }} placeholder="In due parole: cosa comporta?" value={o.note ?? ""} onChange={(e) => setM((mm) => { opt(mm, o.id).note = e.target.value; })} />
                <PcList kind="pro" items={o.pro ?? []} onChange={(v) => setM((mm) => { opt(mm, o.id).pro = v; })} />
                <PcList kind="con" items={o.con ?? []} onChange={(v) => setM((mm) => { opt(mm, o.id).con = v; })} />
              </div>
            ))}
            {m.options.length < 5 && (
              <div className="card stack" style={{ borderStyle: "dashed", justifyContent: "center" }}>
                <button className="btn" onClick={() => setM((mm) => { mm.options.push({ id: uid(), name: "", s: {} }); })}><Plus size={16} /> Aggiungi alternativa</button>
                {!m.options.some(isStatusQuo) && <button className="btn ghost sm" onClick={() => setM((mm) => { mm.options.push({ id: uid(), name: "Lasciare tutto com'è", s: {} }); })}>+ Lasciare tutto com&apos;è</button>}
              </div>
            )}
          </div>
          {m.options.length >= 5 && <small>Massimo 5 strade: oltre, il confronto diventa confuso.</small>}
          {aiStradeBox}
        </section>
      )}

      {/* ---------- 2. CONSEGUENZE ---------- */}
      {S === 1 && (
        <section className="stack">
          <h2 className="sh">Se scegli questa strada, cosa succede dopo?</h2>
          <Hint>Una scelta non è un punteggio: è una sequenza. Per ogni strada scrivi cosa succede nel tempo, nelle aree che contano per <b>questa</b> decisione. Poi <b>cosa deve essere vero</b> perché abbia senso e <b>cosa può andare storto</b>: Decision OS li usa per dirti se la decisione è pronta.</Hint>
          <div className="card stack hzbox">
            <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "end" }}>
              <div style={{ flex: "1 1 220px" }}>
                <label className="f">Orizzonti di questa decisione</label>
                <select aria-label="Orizzonti" value={Object.keys(PHASE_SETS).find((k) => JSON.stringify(PHASE_SETS[k].ph) === JSON.stringify(phs)) ?? ""} onChange={(e) => setPhases(PHASE_SETS[e.target.value].ph)}>
                  {!Object.keys(PHASE_SETS).some((k) => JSON.stringify(PHASE_SETS[k].ph) === JSON.stringify(phs)) && <option value="">Personalizzati</option>}
                  {Object.entries(PHASE_SETS).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
                </select>
              </div>
              <div className="row hzl" style={{ flex: "3 1 360px", gap: 6 }}>
                {phs.map((x, k) => <input key={k} aria-label={`Orizzonte ${k + 1}`} value={x.l} onChange={(e) => setPhases(phs.map((y, j) => (j === k ? { ...y, l: e.target.value } : y)))} />)}
              </div>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <small className="muted">Aree:</small>
              {ars.map((a) => <span key={a} className={`pill area ${a}`}>{areaL(a)} <button className="xbtn" aria-label={`Togli area ${a}`} onClick={() => setM((mm) => { mm.areas = areasOf(mm).filter((z) => z !== a); })}>×</button></span>)}
              <input className="areain" placeholder="+ area (es. clienti, salute)" value={newArea} onChange={(e) => setNewArea(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addArea(); }} onBlur={addArea} />
            </div>
          </div>
          {aiStradeBox}
          <div className="stack">
            {m.options.map((o, i) => <Conseq key={o.id} o={o} i={i} setM={setM} onNewDecision={newDecision} base={ws.profile.resources} rules={ws.profile.rules} phs={phs} ars={ars} />)}
          </div>
        </section>
      )}

      {/* ---------- 2. COSA CONTA ---------- */}
      {S === 2 && (
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
      {S === 3 && (
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
                        <div className="cl"><span className="optbadge sm" style={{ background: OPC[i % OPC.length] }}>{String.fromCharCode(65 + i)}</span><b>{o.name || "(senza nome)"}</b></div>
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
      {S === 4 && (
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
                  <div className="row" style={{ flexWrap: "nowrap" }}><span className="optbadge" style={{ background: OPC[i % OPC.length] }}>{String.fromCharCode(65 + i)}</span><h3 style={{ margin: 0 }}>{o.name || "(senza nome)"}</h3></div>
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
                    <small>In €/mese: quanto entra in più (o esce in più) ogni mese con questa scelta, rispetto a oggi. «Se va male» è la stessa strada con costi più alti o entrate più basse, non un altro evento. Es. rata di 250 € → −250.</small>
                    {(() => { const od = oddScenario(o); return od ? (
                      <div className="note warn" style={{ fontSize: 13, marginTop: 6 }}>
                        «Se va male» ({eur(od.sf)}) è lontano dal probabile ({eur(od.c)}) e cambia segno: così descrive un altro evento, come perdere lo stipendio, non la stessa strada andata peggio. Gli scenari diventano fuorvianti.
                        <div className="row" style={{ gap: 6, marginTop: 6 }}><button className="btn sm" onClick={() => setCm(0, od.fix)}>Usa {eur(od.fix)} (probabile −25%)</button><small>oppure scrivi il tuo valore</small></div>
                      </div>) : null; })()}
                  </div>
                  <div>
                    <label className="f">Ore a settimana che richiede in più</label>
                    <Num value={h ? -mid(h.v) : null} suffix="ore" onChange={(v) => setImpact(o.id, "hours_w", v == null ? null : -v)} />
                  </div>
                  {cres.map((k) => { const im = imp(o, k); const mt = ws.profile.resources_meta[k]; return (
                    <div key={k}>
                      <label className="f">Effetto su «{mt?.l}»</label>
                      <Num value={im ? mid(im.v) : null} suffix={mt?.u || undefined} onChange={(v) => setImpact(o.id, k, v)} />
                      <small>+ se la aumenta, − se la consuma. Oggi: {fmt(R[k] ?? 0)}{mt?.u ? ` ${mt.u}` : ""}.</small>
                    </div>); })}
                  {(c0 || cm) && (
                    <div className="note" style={{ fontSize: 13 }}>
                      Tra 12 mesi (scenario probabile): <b>{eur(sim.res.cash_end ?? 0)}</b> di risparmi
                      {sim.res.autonomia_mesi !== Infinity ? <>, reggi <b>{fmt(sim.res.autonomia_mesi)}</b> mesi</> : null}.
                      {sim.viol.length ? <div className="err">⚠ {sim.viol.join("; ")}</div> : null}
                    </div>
                  )}
                  {!(c0 || cm) && sim.viol.length > 0 && <div className="err">⚠ {sim.viol.join("; ")}</div>}
                </div>
              );
            })}
          </div>
          <small>Vuoi vedere 3 mesi, 2 anni o 5 anni e gli scenari peggiori? Apri <Link href="/app/scenari">Scenari</Link>.</small>
        </section>
      )}

      {/* ---------- 5. RISULTATO ---------- */}
      {S === 5 && (
        <section className="stack">
          {dilemma && <Dilemma d={dilemma} add={(kd, n) => { addPlan(kd, n); setStep(1); window.scrollTo({ top: 0 }); }} />}
          <div className={`card stack ready ${ready.state}`}>
            <div className="rk">Decisione</div>
            <h2 style={{ margin: 0 }}>{ready.state === "pronta" ? "Pronta" : ready.state === "non_pronta" ? "Non ancora pronta" : ready.state === "nessuna" ? "Nessuna strada regge" : "Da impostare"}</h2>
            {ready.state === "non_pronta" && ready.lead && (
              <>
                {conds.length > 0 ? <p className="big">«{ready.lead.name}» è potenzialmente la strada migliore per le tue priorità, <b>ma solo se</b>:</p>
                  : <p className="big">«{ready.lead.name}» è in testa, ma l&apos;analisi non è ancora abbastanza affidabile per decidere.</p>}
                {conds.length > 0 && <div className="cgrp">Condizioni perché la strada regga</div>}
                <ol className="conds">
                  {conds.map((c) => (
                    <li key={c.key}>
                      <span>{c.t}</span>
                      {c.gate && <span className="pill bad">se no, esce</span>}
                      {c.condId && (
                        <span className="seg sm" role="group" aria-label={`Verificata? ${c.t}`}>
                          {(["si", "no"] as const).map((v) => <button key={v} onClick={() => setCondSt(c.optId!, c.condId!, v)}>{ST_L[v]}</button>)}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
                {conds.length > 0 && ready.fallback && <p style={{ margin: 0 }} className="fbtxt">{fallbackText(ready)}</p>}
                {chiar.length > 0 && (
                  <>
                    <div className="cgrp">Cose da chiarire prima di decidere</div>
                    <ul className="conds chiar">{chiar.map((c) => <li key={c.key}>{c.t}</li>)}</ul>
                  </>
                )}
              </>
            )}
            {ready.state === "pronta" && ready.lead && (
              <p className="big">Con quello che sai oggi, la strada che rispetta meglio le tue priorità è <b>{ready.lead.name}</b>{ready.done.length ? ", e le sue condizioni sono verificate" : ""}. Nessun dato incerto può ribaltarla: puoi decidere.</p>
            )}
            {ready.state === "nessuna" && <p className="big">Nessuna strada rispetta i tuoi requisiti e le condizioni che hai segnato come vincolanti. Rivedi un requisito o cerca un&apos;altra strada.</p>}
            {ready.state === "vuota" && <p className="big">{V.t} {V.s}</p>}
            {ready.done.length > 0 && <div className="note ok">Già verificate: {ready.done.map((c) => c.t).join("; ")}.</div>}
            {ready.failed.length > 0 && <div className="note bad">Non soddisfatte: {ready.failed.map((c) => c.t).join("; ")}.</div>}
            <small>Decision OS non sceglie al posto tuo: ti dice a quali condizioni una strada regge e cosa verificare prima.</small>
          </div>
          {ready.open.length > 0 && (
            <div className="card stack plan">
              <h3 style={{ margin: 0 }}><ListOrdered size={18} /> Prima di rispondere, in quest&apos;ordine</h3>
              <ol className="plansteps">
                {ready.open.map((c) => <li key={c.key}><b>{c.how}</b>{c.gate && <small className="stop">{stopText(ready)}</small>}</li>)}
                <li><b>Poi torna qui:</b> Decision OS ricalcola con i nuovi dati e ti dice se la decisione è pronta.</li>
              </ol>
            </div>
          )}
          {foc && (
            <div className="card stack">
              <h3 style={{ margin: 0 }}><Scale size={18} /> La scelta vera</h3>
              <p style={{ margin: 0 }}>{foc.trade}</p>
              {foc.calm.length > 0 && <small>Non cambiano la scelta, qualunque valore abbiano: {foc.calm.map((x) => `«${x.critName}» di ${x.optName}`).join(", ")}.</small>}
            </div>
          )}
          {m.options.length > 1 && (
            <div className="stack" style={{ gap: 10 }}>
              <h3 className="sh2"><Milestone size={18} /> Se scegli questa strada</h3>
              <div className="grid g2 briefs" style={{ alignItems: "start" }}>
                {briefOrder.map(({ o, b, tag }) => (
                  <div key={o.id} className={`card stack brief ${tag}`}>
                    <div className="row between" style={{ flexWrap: "nowrap", gap: 8 }}>
                      <h3 style={{ margin: 0, minWidth: 0 }}>Se scegli «{o.name}»</h3>
                      {tag === "lead" ? <span className="pill ok">in testa</span> : tag === "fb" ? <span className="pill info">riserva</span> : tag === "out" ? <span className="pill bad">scartata</span> : null}
                    </div>
                    {b.watch.length > 0 && <div><b className="bw">Tieni conto di</b><ul className="clean">{b.watch.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
                    {b.plus.length > 0 && <div><b className="bp">Però hai anche</b><ul className="clean">{b.plus.map((x, k) => <li key={k}>{x}</li>)}</ul></div>}
                    {b.seq.length > 0 && <div><b className="bs">Cosa succede dopo</b><ul className="clean tmini">{b.seq.map((x, k) => { const [ph, ...t] = x.split(": "); return <li key={k}><span className="ph">{ph}</span> {t.join(": ")}</li>; })}</ul></div>}
                    {b.next.length > 0 && <small><b>Poi dovrai decidere:</b> {b.next.join("; ")}.</small>}
                    {!b.watch.length && !b.plus.length && !b.seq.length && <small className="muted">Mancano conseguenze, condizioni e rischi: aggiungili al passo «Conseguenze».</small>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {rsum.some((x) => x.n) && (
            <div className="card stack">
              <h3 style={{ margin: 0 }}><ShieldAlert size={18} /> Rischi a confronto</h3>
              <div className="tablewrap">
                <table className="t num riskt">
                  <thead><tr><th>Strada</th><th>Rischi</th><th>Rischio peggiore, se succede</th><th>Costo pesato</th><th>Oltre i tuoi limiti</th></tr></thead>
                  <tbody>{rsum.map((x) => (
                    <tr key={x.id} className={ready.lead?.id === x.id ? "lead" : ""}>
                      <td><strong>{x.name}</strong></td>
                      <td>{x.n ? <>{x.n} {x.n === 1 ? "rischio" : "rischi"}{x.alte ? <span className="pill bad" style={{ marginLeft: 6 }}>{x.alte} {x.alte === 1 ? "alto" : "alti"}</span> : null}</> : <span className="muted">nessuno indicato</span>}</td>
                      <td>{x.worst ? <>{x.worst.t}{x.worst.tot ? <> · <b>{eur(x.worst.tot)}</b></> : null}</> : "—"}</td>
                      <td>{x.n ? eur(x.pesato) : "—"}</td>
                      <td>{x.rompe ? <span className="pill bad">{x.rompe}</span> : x.n ? <span className="pill ok">no</span> : "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <small>Costo pesato = somma degli impatti × peso convenzionale della probabilità (bassa 10%, media 30%, alta 60%). Serve a confrontare quanto è rischiosa ogni strada, non è una previsione. Rischi e contromisure si modificano nel passo «Conseguenze».</small>
              {rsum.some((x) => !x.n) && <small className="muted">Alcune strade non hanno rischi indicati: senza, sembrano più sicure di quanto sono.</small>}
            </div>
          )}
          <details className="card deep">
            <summary>Punteggio e approfondimenti: confronto, rischi, parere contrario, effetti</summary>
            <div className="stack" style={{ marginTop: 12 }}>
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
                  Importanza diversa dalle tue priorità generali: {gaps.map((x) => `«${x.c.name}» ${x.c.imp}/5 (${x.g!.label} ${x.g!.pri}/5)`).join(", ")}. <button className="btn ghost sm" onClick={() => setStep(2)}>Rivedi</button>
                </div>
              )}
              <div className="card stack">
                <h3 style={{ margin: 0 }}>Prossimi passi</h3>
                {provisional && <button className="btn" onClick={() => setStep(3)}><ArrowLeft size={15} /> Completa i {st.missing.length} valori mancanti</button>}
                {!m.options.some((o) => (o.impacts ?? []).length) && <button className="btn" onClick={() => setStep(4)}>Aggiungi l&apos;impatto su soldi e tempo</button>}
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
            </div>
          </details>
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
        {S < 5 && <button className="btn pri" onClick={() => { setStep(S + 1); window.scrollTo({ top: 0 }); }}>{STEPS[S + 1]} <ArrowRight size={16} /></button>}
      </div>
    </div>
  );
}
