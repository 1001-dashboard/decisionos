"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Upload, Copy, Check, Trash2, Sparkles, Lock, Unlock, Eye, FileText } from "lucide-react";
import { useWs } from "@/components/Workspace";
import { Top } from "@/components/Shell";
import { ai } from "@/lib/ai";
import { redactMoney, fmt } from "@/lib/engine";
import { CONTEXT_PROMPT, CTX_L, CTX_ONE, SCOPE_L, LINK_L, scopesOf, expired, type Scope, type LinkRel, parseContext, ctxFromAi, mergeCtx, countBy, contextPicture, resUpdates, type CtxItem, type CtxKind, type AiCtx } from "@/lib/context";

const KINDS = Object.keys(CTX_L) as CtxKind[];
const RES_L: Record<string, string> = { cash0: "liquidità", cash_m: "flusso mensile", hours_w: "ore libere a settimana" };

/** Una riga del contesto: testo modificabile, tipo, fase/stabile, privato, stato. */
function Item({ x, set, del, review, all }: { x: CtxItem; set: (pt: Partial<CtxItem>) => void; del: () => void; review?: boolean; all: CtxItem[] }) {
  const exp = expired(x);
  const [lt, setLt] = useState(""), [lr, setLr] = useState<LinkRel>("influenza");
  const others = all.filter((y) => y.id !== x.id && y.st !== "superato");
  return (
    <div className={`ctxi ${x.st} ${exp ? "exp" : ""}`}>
      <div className="row" style={{ gap: 6, flexWrap: "nowrap", alignItems: "flex-start" }}>
        <select aria-label="Tipo" value={x.k} onChange={(e) => set({ k: e.target.value as CtxKind })} style={{ width: "auto" }}>{KINDS.map((k) => <option key={k} value={k}>{CTX_ONE[k]}</option>)}</select>
        <input aria-label="Elemento" defaultValue={x.t} onBlur={(e) => e.target.value.trim() && e.target.value !== x.t && set({ t: e.target.value.trim() })} style={{ flex: 1, minWidth: 0 }} />
      </div>
      <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center" }}>
        <span className="seg sm" role="group" aria-label="Validità">
          <button className={x.layer === "stabile" ? "on" : ""} onClick={() => set({ layer: "stabile" })}>Stabile</button>
          <button className={x.layer === "fase" ? "on" : ""} onClick={() => set({ layer: "fase" })}>Fase attuale</button>
        </span>
        {x.n != null && <span className="pill info">{fmt(x.n)}{x.u ? " " + x.u : ""}</span>}
        <select aria-label="Affidabilità" value={x.conf ?? ""} onChange={(e) => set({ conf: (e.target.value || undefined) as CtxItem["conf"] })} style={{ width: "auto", padding: "4px 8px", fontSize: 13 }}>
          <option value="">affidabilità?</option><option value="alta">affidabile</option><option value="media">abbastanza</option><option value="bassa">da verificare</option>
        </select>
        {x.imp && <span className="pill info">importanza {x.imp}/5</span>}
        <button className={`btn ghost sm ${x.priv ? "on" : ""}`} title="Privato: mai inviato all'AI" onClick={() => set({ priv: !x.priv })}>{x.priv ? <Lock size={13} /> : <Unlock size={13} />} {x.priv ? "Privato" : "Inviabile all'AI"}</button>
        {review ? <>
          <button className="btn sm pri" onClick={() => set({ st: "confermato" })}><Check size={13} /> Conferma</button>
          <button className="btn ghost sm" onClick={del}>Scarta</button>
        </> : <>
          {x.st === "confermato" && <button className="btn ghost sm" onClick={() => set({ st: "superato" })}>Non è più vero</button>}
          {x.st === "confermato" && <button className="btn ghost sm" onClick={() => set({ st: "escluso" })}>Non usare</button>}
          {x.st !== "confermato" && <button className="btn ghost sm" onClick={() => set({ st: "confermato" })}>Usa di nuovo</button>}
          <button className="iconbtn" title="Elimina" onClick={del}><Trash2 size={14} /></button>
        </>}
        <span className="scopes" aria-label="Ambiti">
          {scopesOf(x).map((z) => <button key={z} className="pill teal" title="Togli l'ambito" onClick={() => set({ scope: scopesOf(x).filter((y) => y !== z) })}>{SCOPE_L[z]} ×</button>)}
          <select aria-label="Aggiungi ambito" value="" onChange={(e) => e.target.value && set({ scope: [...scopesOf(x), e.target.value as Scope] })} style={{ width: "auto", padding: "3px 6px", fontSize: 12 }}>
            <option value="">+ ambito</option>{(Object.keys(SCOPE_L) as Scope[]).filter((z) => !scopesOf(x).includes(z)).map((z) => <option key={z} value={z}>{SCOPE_L[z]}</option>)}
          </select>
          <label className="row" style={{ gap: 4, fontSize: 12 }}><input type="checkbox" style={{ width: "auto" }} checked={!!x.global} onChange={(e) => set({ global: e.target.checked || undefined })} /> vale per tutte le decisioni</label>
        </span>
        <small className="muted">{[x.src, x.dt ? new Date(x.dt).toLocaleDateString("it-IT") : ""].filter(Boolean).join(" · ")}</small>
        <label className="row" style={{ gap: 4, fontSize: 12 }}>vale fino al<input aria-label="Valido fino al" type="date" value={x.until ?? ""} onChange={(e) => set({ until: e.target.value || undefined })} style={{ width: "auto", padding: "3px 6px", fontSize: 12 }} /></label>
        {exp && <><span className="pill bad">scaduto: non viene più usato</span><button className="btn sm" onClick={() => set({ until: undefined, dt: new Date().toISOString().slice(0, 10) })}>Riconferma</button></>}
      </div>
      {!review && (
        <div className="row" style={{ gap: 6, marginTop: 6, alignItems: "center" }}>
          <span className="scopes" aria-label="Influenza">
            <small className="muted">influenza:</small>
            {(x.affects ?? []).map((z) => <button key={z} className="pill info" title="Togli" onClick={() => set({ affects: (x.affects ?? []).filter((y) => y !== z) })}>{SCOPE_L[z]} ×</button>)}
            <select aria-label="Aggiungi influenza" value="" onChange={(e) => e.target.value && set({ affects: [...(x.affects ?? []), e.target.value as Scope] })} style={{ width: "auto", padding: "3px 6px", fontSize: 12 }}>
              <option value="">+ risorsa o ambito</option>{(Object.keys(SCOPE_L) as Scope[]).filter((z) => !(x.affects ?? []).includes(z)).map((z) => <option key={z} value={z}>{SCOPE_L[z]}</option>)}
            </select>
          </span>
          <span className="scopes" aria-label="Collegamenti">
            {(x.links ?? []).map((l) => { const y = all.find((z) => z.id === l.to); return y ? <button key={l.to + l.rel} className="pill teal" title="Togli il collegamento" onClick={() => set({ links: (x.links ?? []).filter((z) => !(z.to === l.to && z.rel === l.rel)) })}>{LINK_L[l.rel]} «{y.t.slice(0, 40)}» ×</button> : null; })}
            <select aria-label="Relazione" value={lr} onChange={(e) => setLr(e.target.value as LinkRel)} style={{ width: "auto", padding: "3px 6px", fontSize: 12 }}>{(Object.keys(LINK_L) as LinkRel[]).map((r) => <option key={r} value={r}>{LINK_L[r]}</option>)}</select>
            <select aria-label="Collega a" value={lt} onChange={(e) => setLt(e.target.value)} style={{ width: "auto", maxWidth: 220, padding: "3px 6px", fontSize: 12 }}><option value="">collega a…</option>{others.map((y) => <option key={y.id} value={y.id}>{y.t.slice(0, 50)}</option>)}</select>
            <button className="btn ghost sm" disabled={!lt} onClick={() => { set({ links: [...(x.links ?? []).filter((z) => z.to !== lt), { to: lt, rel: lr }] }); setLt(""); }}>Collega</button>
          </span>
        </div>
      )}
    </div>
  );
}

export default function Contesto() {
  const ws = useWs();
  const { vault, saveVault, decisions, profile } = ws;
  const [txt, setTxt] = useState("");
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [eco, setEco] = useState(false);
  const [f, setF] = useState<CtxKind | "tutti" | "vecchi">("tutti");
  const [nt, setNt] = useState(""), [nk, setNk] = useState<CtxKind>("fatto");
  const pend = vault.filter((x) => x.st === "proposto");
  const kept = vault.filter((x) => x.st !== "proposto");
  const pic = useMemo(() => contextPicture(vault, decisions), [vault, decisions]);
  const ups = resUpdates(vault, profile.resources);
  const now = new Date().toISOString().slice(0, 10);
  const isOld = (x: CtxItem) => (!!x.until && x.until < now) || (x.layer === "fase" && !!x.dt && (Date.parse(now) - Date.parse(x.dt)) / 86400000 > 180);

  const save = (items: CtxItem[]) => saveVault(items);
  const set = (id: string, pt: Partial<CtxItem>) => save(vault.map((x) => (x.id === id ? { ...x, ...pt } : x)));
  const del = (id: string) => save(vault.filter((x) => x.id !== id).map((x) => (x.links?.some((l) => l.to === id) ? { ...x, links: x.links.filter((l) => l.to !== id) } : x)));
  const found = (add: CtxItem[], how: string) => {
    if (!add.length) { setMsg(how === "doc" ? "Non ho trovato sezioni nel formato di Decision OS. Se è un testo libero, usa «Estrai con l'Analista»." : "L'Analista non ha trovato elementi."); return; }
    const m = mergeCtx(vault, add);
    save(m.items);
    const c = countBy(add).map((x) => `${x.n} ${x.n === 1 ? CTX_ONE[x.k] : CTX_L[x.k].toLowerCase()}`).join(", ");
    setMsg(`Ho trovato ${add.length} elementi: ${c}.${m.dup ? ` ${m.dup} c'erano già.` : ""} Rivedili qui sotto: entrano nel profilo solo quando li confermi.`);
    setTxt("");
  };
  async function file(fl: File) {
    if (!/\.(txt|md|markdown|csv)$/i.test(fl.name) && !fl.type.startsWith("text/")) { setMsg("Per ora leggo file di testo (.txt, .md). Da un PDF o un Word copia e incolla il testo qui sotto."); return; }
    setTxt(await fl.text());
  }
  async function extract() {
    setBusy(true); setMsg("");
    try { const x = await ai<AiCtx>("contesto", { t: (eco ? txt : redactMoney(txt)).slice(0, 20000), ...(eco ? { eco: true } : {}) }); found(ctxFromAi(x), "ai"); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }
  function addOne() {
    if (!nt.trim()) return;
    save([...vault, { id: `c${Date.now().toString(36)}`, k: nk, t: nt.trim(), layer: ["valore", "preferenza", "persona", "fatto", "regola"].includes(nk) ? "stabile" : "fase", st: "confermato", src: "scritto da te", dt: now }]);
    setNt("");
  }
  const list = kept.filter((x) => f === "tutti" || (f === "vecchi" ? isOld(x) : x.k === f));
  const conf = vault.filter((x) => x.st === "confermato");

  return (
    <>
      <Top t="Contesto" s="Cosa sa Decision OS di te: lo usa in tutte le decisioni, solo dopo che l'hai confermato" />
      <div className="grid g2" style={{ alignItems: "start" }}>
        <div className="stack">
          <div className="card stack">
            <h3 style={{ margin: 0 }}><Upload size={18} /> Importa il tuo contesto</h3>
            <ol className="ctxsteps">
              <li><b>Chiedi il tuo profilo</b> a ChatGPT, Claude o Gemini con questo prompt: ti restituisce un documento nel formato che Decision OS legge da solo, senza AI e senza costi.
                <div><button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(CONTEXT_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setTxt(CONTEXT_PROMPT); } }}>{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiato" : "Copia il prompt"}</button></div></li>
              <li><b>Incolla qui la risposta</b> (o carica un file di testo). Funziona anche con note, CV o vecchie decisioni in testo libero.</li>
            </ol>
            <textarea aria-label="Documento di contesto" placeholder={"DECISION OS — CONTESTO PERSONALE\n## FATTI\n- [stabile] …"} value={txt} onChange={(e) => setTxt(e.target.value)} style={{ minHeight: 160 }} />
            <div className="row" style={{ gap: 8, alignItems: "center" }}>
              <button className="btn pri" disabled={!txt.trim()} onClick={() => found(parseContext(txt), "doc")}><FileText size={15} /> Leggi il documento</button>
              <label className="btn ghost sm" style={{ cursor: "pointer" }}>Carica file<input type="file" accept=".txt,.md,.markdown,text/*" hidden onChange={(e) => e.target.files?.[0] && file(e.target.files[0])} /></label>
              <button className="btn sm" disabled={!txt.trim() || busy} onClick={extract}><Sparkles size={14} /> {busy ? "L'Analista sta leggendo…" : "Estrai con l'Analista (testo libero)"}</button>
              <label className="row" style={{ gap: 6, fontSize: 13 }}><input type="checkbox" checked={eco} onChange={(e) => setEco(e.target.checked)} /> includi le cifre</label>
            </div>
            <small className="muted">Il formato di Decision OS viene letto qui, senza inviare nulla all&apos;AI. «Estrai con l&apos;Analista» invia il testo all&apos;AI: gli importi vengono oscurati (in cifre e nelle forme comuni in lettere) a meno che tu non spunti «includi le cifre».</small>
            {msg && <div className="note">{msg}</div>}
          </div>

          {pend.length > 0 && (
            <div className="card stack ctxrev">
              <div className="row between"><h3 style={{ margin: 0 }}>Da rivedere ({pend.length})</h3>
                <button className="btn sm pri" onClick={() => { save(vault.map((x) => (x.st === "proposto" ? { ...x, st: "confermato" } : x))); setMsg(""); }}><Check size={14} /> Conferma tutti</button></div>
              <small>Non prendo per vero niente in automatico: una frase detta a un assistente due anni fa non deve diventare una verità permanente. Correggi, scarta, segna come privato ciò che non vuoi mai inviare all&apos;AI.</small>
              {KINDS.filter((k) => pend.some((x) => x.k === k)).map((k) => (
                <div key={k} className="stack" style={{ gap: 6 }}>
                  <div className="cgrp">{CTX_L[k]} · {pend.filter((x) => x.k === k).length}</div>
                  {pend.filter((x) => x.k === k).map((x) => <Item key={x.id} x={x} set={(pt) => set(x.id, pt)} del={() => del(x.id)} review all={vault} />)}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stack">
          <div className="card stack">
            <h3 style={{ margin: 0 }}><Eye size={18} /> Il tuo quadro attuale</h3>
            {!conf.length ? <small>Ancora nessun elemento confermato. Importa il tuo contesto o aggiungi gli elementi a mano.</small> : (
              <>
                <div className="row" style={{ gap: 6 }}>{countBy(conf).map((x) => <span key={x.k} className="pill info">{x.n} {x.n === 1 ? CTX_ONE[x.k] : CTX_L[x.k].toLowerCase()}</span>)}</div>
                {pic.length ? <ul className="clean">{pic.map((p) => <li key={p}>{p}</li>)}</ul> : <small>Nessun conflitto tra decisioni aperte e nessun elemento da aggiornare.</small>}
              </>
            )}
            {ups.map((x) => (
              <div key={x.id} className="note row between" style={{ gap: 8 }}>
                <span>«{x.t}»: {fmt(x.n!)}{x.u ? " " + x.u : ""}. Nelle tue risorse oggi c&apos;è {fmt(profile.resources[x.res!] ?? 0)} come {RES_L[x.res!]}.</span>
                <button className="btn sm" onClick={() => ws.saveProfile({ resources: { ...profile.resources, [x.res!]: x.n! }, resources_meta: { ...profile.resources_meta, [x.res!]: { ...(profile.resources_meta[x.res!] ?? {}), dt: now, src: "contesto" } } })}>Aggiorna le risorse</button>
              </div>
            ))}
          </div>

          <div className="card stack">
            <h3 style={{ margin: 0 }}>Cosa sa Decision OS di te</h3>
            <div className="seg" role="tablist">
              {(["tutti", ...KINDS.filter((k) => kept.some((x) => x.k === k)), ...(kept.some(isOld) ? ["vecchi"] : [])] as (CtxKind | "tutti" | "vecchi")[]).map((k) => (
                <button key={k} className={f === k ? "on" : ""} onClick={() => setF(k)}>{k === "tutti" ? `Tutti (${kept.length})` : k === "vecchi" ? "Da aggiornare" : CTX_L[k]}</button>
              ))}
            </div>
            {!list.length && <small className="muted">Niente qui.</small>}
            {list.map((x) => <Item key={x.id} x={x} set={(pt) => set(x.id, pt)} del={() => del(x.id)} all={vault} />)}
            <div className="row" style={{ gap: 6 }}>
              <select aria-label="Tipo del nuovo elemento" value={nk} onChange={(e) => setNk(e.target.value as CtxKind)} style={{ width: "auto" }}>{KINDS.map((k) => <option key={k} value={k}>{CTX_ONE[k]}</option>)}</select>
              <input aria-label="Nuovo elemento" placeholder="Aggiungi a mano: es. non uso più del 30% dei risparmi per un progetto" value={nt} onChange={(e) => setNt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addOne()} style={{ flex: "1 1 220px" }} />
              <button className="btn sm" onClick={addOne}>Aggiungi</button>
            </div>
            <small className="muted">Usati nelle decisioni solo gli elementi confermati. «Privato» resta usabile da te e dal motore ma non viene mai inviato all&apos;AI. Ogni decisione mostra quali elementi ha usato. <Link href="/app/impostazioni">Risorse e limiti</Link></small>
          </div>
        </div>
      </div>
    </>
  );
}
