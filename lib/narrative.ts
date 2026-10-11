// Testi del report, calcolati dal motore (nessuna AI): cosa comporta ogni scelta, sintesi, piano d'azione.
import {
  applyCombo, crossEffects, eur, fmt, levelOf, normalize, riskViews, phasesOf, snapPhase, LEVELS, SCEN, RISK_W,
  type Crit, type Decision, type DecResult, type Dep, type Opt, type Resources, type Rule, type Scen,
} from "./engine.ts";

export const HZ = [3, 12, 24] as const;

/** Valore leggibile di un'alternativa su un criterio. */
export function valueText(c: Crit, o: Opt) {
  if (c.kind === "num") return o.raw?.[c.id] == null ? "—" : `${fmt(o.raw[c.id])}${c.unit ? " " + c.unit : ""}`;
  const s = o.s?.[c.id];
  if (s == null) return "—";
  return c.kind === "g" ? LEVELS[levelOf(s)] : `${fmt(s)}/100`;
}

/** Proiezione di una singola alternativa: orizzonti × scenari. */
export function projection(o: Opt, base: Resources, rules: Rule[]) {
  const map = new Map([[o.id, o]]);
  return HZ.map((h) => ({
    h,
    s: Object.fromEntries(SCEN.map((sc, k) => [sc, applyCombo([o.id], map, [], base, rules, h, k)])) as Record<Scen, ReturnType<typeof applyCombo>>,
  }));
}

export type Consequence = { tone: "ok" | "warn" | "bad"; t: string };

/** «Cosa comporterebbe» una scelta, in frasi semplici. */
export function consequences(dec: Decision, r: DecResult, o: Opt, others: Decision[], deps: Dep[], base: Resources, rules: Rule[]): Consequence[] {
  const out: Consequence[] = [];
  const row = r.rows.find((x) => x.id === o.id)!;
  const m = normalize(dec.model);
  if (row.excluded.length) out.push({ tone: "bad", t: `È scartata: ${row.excluded.join("; ")}.` });
  else if (row.pending.length) out.push({ tone: "warn", t: `Requisito ancora da verificare: ${row.pending.join("; ")}.` });
  else if (dec.model.constraints.length) out.push({ tone: "ok", t: "Rispetta tutti i requisiti che hai fissato." });

  // dove eccelle e dove soffre rispetto alle altre
  const others_ = r.rows.filter((x) => x.id !== o.id);
  const best: string[] = [], worst: string[] = [];
  for (const c of m.criteria) {
    const mine = row.detail.find((d) => d.crit === c.id)?.s;
    const theirs = others_.map((x) => x.detail.find((d) => d.crit === c.id)?.s).filter((v): v is number => v != null);
    if (mine == null || !theirs.length) continue;
    if (mine > Math.max(...theirs)) best.push(`${c.name} (${valueText(c, o)})`);
    if (mine < Math.min(...theirs)) worst.push(`${c.name} (${valueText(c, o)})`);
  }
  if (best.length) out.push({ tone: "ok", t: `È la migliore su: ${best.join(", ")}.` });
  if (worst.length) out.push({ tone: "warn", t: `È la peggiore su: ${worst.join(", ")}.` });

  // soldi e tempo
  const imp = (k: string) => (o.impacts ?? []).find((i) => i.r === k);
  const c0 = imp("cash0"), cm = imp("cash_m"), hw = imp("hours_w");
  const ai = (o.impacts ?? []).some((x) => x.src === "ai");
  const sa = (i?: { src?: string }) => (i?.src === "ai" ? " [stima AI, da verificare]" : "");
  if (ai) out.push({ tone: "warn", t: "Gli importi su soldi e tempo di questa alternativa sono stime dell'AI, non ancora confermate: le cifre qui sotto vanno verificate." });
  if (!c0 && !cm && !hw) out.push({ tone: "warn", t: "Non hai indicato effetti su soldi e tempo: le conseguenze economiche non sono valutate." });
  else {
    if (c0) {
      const r3 = Array.isArray(c0.v) ? c0.v : [c0.v, c0.v, c0.v];
      const n = r3[1];
      const rg = r3[0] !== r3[2] ? ` (tra ${eur(Math.abs(r3[0]))} e ${eur(Math.abs(r3[2]))})` : "";
      out.push({ tone: n < 0 ? "warn" : "ok", t: n < 0 ? `Ti costa subito ${eur(-n)}${rg}${sa(c0)}.` : `Ti porta subito ${eur(n)}${rg}${sa(c0)}.` });
    }
    if (cm) {
      const v = Array.isArray(cm.v) ? cm.v : [cm.v, cm.v, cm.v];
      const sg = (n: number) => (n > 0 ? `+${eur(n)}` : eur(n));
      out.push({ tone: v[1] >= 0 ? "ok" : "warn", t: v[0] === v[2] ? `Ogni mese, rispetto a oggi: ${sg(v[1])}${sa(cm)}.` : `Ogni mese, rispetto a oggi: ${sg(v[1])} nel caso probabile (da ${sg(v[0])} se va male a ${sg(v[2])} se va bene)${sa(cm)}.` });
    }
    const p = projection(o, base, rules);
    const y1 = p.find((x) => x.h === 12)!.s, y2 = p.find((x) => x.h === 24)!.s;
    if (y1.centrale.res.cash_end != null)
      out.push({ tone: y1.sfavorevole.viol.length ? "warn" : "ok", t: `Tra 12 mesi avresti ${eur(y1.centrale.res.cash_end)} di risparmi (${eur(y1.sfavorevole.res.cash_end ?? 0)} se va male); tra 24 mesi ${eur(y2.centrale.res.cash_end ?? 0)}${ai ? " [proiezione su stime AI]" : ""}.` });
    const au = y1.sfavorevole.res.autonomia_mesi;
    if (au != null && au !== Infinity) out.push({ tone: au < 6 ? "bad" : "warn", t: `Se va male consumi risparmi: reggi circa ${fmt(au)} mesi prima di esaurirli.` });
    if (hw || base.hours_w) out.push({ tone: (y1.centrale.res.hours_w ?? 0) < 5 ? "warn" : "ok", t: `Ti restano ${fmt(y1.centrale.res.hours_w ?? 0)} ore libere a settimana${sa(hw)}.` });
    const v24 = y2.sfavorevole.viol;
    if (v24.length) out.push({ tone: "bad", t: `Se va male, entro 24 mesi superi un tuo limite di sicurezza: ${v24.join("; ")}.` });
  }

  // effetti sulle altre decisioni
  for (const cx of crossEffects(o.id, dec, others, deps, base, rules, 12)) {
    const no = cx.rows.filter((x) => !x.ok && x.why[0] !== "già scartata nella sua decisione");
    if (no.length) out.push({ tone: "bad", t: `Su «${cx.name}» rende impossibile: ${no.map((x) => `${x.name} (${x.why[0]})`).join("; ")}.` });
    else if (cx.rows.some((x) => x.ok)) out.push({ tone: "ok", t: `Su «${cx.name}» lascia possibili tutte le opzioni ancora valide.` });
  }
  return out;
}

/** Piano d'azione: cosa fare prima di decidere, in ordine di utilità. */
export function actionPlan(dec: Decision, r: DecResult, turns: { text: string }[], due?: string | null): string[] {
  const out: string[] = [];
  const top = r.rows.find((x) => !x.excluded.length);
  const m = normalize(dec.model);
  for (const a of (dec.model.assumptions ?? []).filter((x) => x.rel === "?")) out.push(`Chiarisci: ${a.t}`);
  if (top) {
    const est = top.detail.filter((d) => d.meta?.rel === "S" && d.s != null).sort((a, b) => b.w - a.w);
    for (const d of est.slice(0, 3)) {
      const c = m.criteria.find((x) => x.id === d.crit)!;
      const o = dec.model.options.find((x) => x.id === top.id)!;
      out.push(`Trasforma in dato certo la stima «${c.name}» di ${top.name} (oggi ${valueText(c, o)})`);
    }
    for (const p of top.pending) out.push(`Verifica il requisito: ${p}`);
    const noSrc = top.detail.filter((d) => d.s != null && !d.meta?.rel).length;
    if (noSrc) out.push(`Indica la fonte di ${noSrc} valori di ${top.name}: oggi non sai se sono certi o stimati`);
  }
  for (const o of dec.model.options.filter((x) => (x.impacts ?? []).some((i) => i.src === "ai")))
    out.push(`Verifica gli importi stimati dall'AI per «${o.name}» (spesa iniziale, differenza mensile, ore) prima di fidarti degli scenari`);
  if (turns[0]) out.push(`Usa la soglia di svolta come limite di trattativa: ${turns[0].text}`);
  out.push(due ? `Decidi entro il ${new Date(due).toLocaleDateString("it-IT")}: congela l'analisi e registra la scelta` : "Fissa una data entro cui decidere, poi congela l'analisi e registra la scelta");
  out.push("Fissa una data di revisione (es. a 3 mesi) per confrontare previsioni e realtà");
  return out;
}

/* ---------- «Se scegli questa strada»: tieni conto di… però hai anche… ---------- */
export type Brief = { watch: string[]; plus: string[]; seq: string[]; next: string[] };
const PL: Record<string, string> = { bassa: "basso", media: "medio", alta: "alto" };

/** Promemoria per strada, composto dai dati inseriti (nessuna AI): condizioni, rischi, tappe critiche, punti deboli; poi i punti a favore. */
export function briefing(dec: Decision, r: DecResult, o: Opt, base: Resources = {}, rules: Rule[] = []): Brief {
  const nm = normalize(dec.model);
  const row = r.rows.find((x) => x.id === o.id);
  const watch: string[] = [], plus: string[] = [];
  if (row?.excluded.length) watch.push(`Oggi è scartata: ${row.excluded.join("; ")}.`);
  // condizioni: prima quelle vincolanti
  const cs = [...(o.cond ?? [])].filter((c) => c.st !== "si").sort((a, b) => Number(!!b.gate) - Number(!!a.gate));
  for (const c of cs.slice(0, 3)) watch.push(c.st === "no" ? `Non soddisfatta: ${c.t}.` : `Deve essere vero: ${c.t}${c.gate ? " (senza, la strada cade)" : ""}.`);
  for (const p of row?.pending ?? []) watch.push(`Requisito da verificare: ${p}.`);
  // rischi più pesanti
  const rv = riskViews(o, base, rules).sort((a, b) => RISK_W[b.p] * -b.tot - RISK_W[a.p] * -a.tot || (b.p === "alta" ? 1 : 0) - (a.p === "alta" ? 1 : 0));
  for (const k of rv.filter((x) => x.p !== "bassa").slice(0, 2))
    watch.push(`Rischio ${PL[k.p]}: ${k.t}${k.tot ? ` (se succede ${eur(k.tot)}${k.breaks.length ? ", oltre i tuoi limiti" : ""})` : ""}${k.x ? `. Puoi ridurlo: ${k.x}` : ""}.`);
  // cosa succede nel tempo: elenco a parte, in ordine (le tappe non sono sempre negative)
  const phs = phasesOf(dec.model);
  const seq = [...(o.tl ?? [])].sort((a, b) => a.h - b.h).slice(0, 6).map((x) => `${snapPhase(phs, x.h).l}: ${x.t}`);
  // dove è debole rispetto alle altre
  const others = r.rows.filter((x) => x.id !== o.id && !x.excluded.length);
  if (row && others.length) {
    for (const c of nm.criteria) {
      const mine = row.detail.find((d) => d.crit === c.id)?.s;
      const th = others.map((x) => x.detail.find((d) => d.crit === c.id)?.s).filter((v): v is number => v != null);
      if (mine == null || !th.length) continue;
      if (mine < Math.min(...th)) watch.push(`È la più debole su «${c.name}» (${valueText(c, o)}).`);
      if (mine > Math.max(...th)) plus.push(`È la migliore su «${c.name}» (${valueText(c, o)}).`);
    }
  }
  for (const x of (o.con ?? []).slice(0, 2)) if (!watch.some((w) => w.includes(x))) watch.push(`${x}.`);
  // a favore
  for (const x of (o.pro ?? []).slice(0, 3)) plus.push(`${x}.`);
  const cm = (o.impacts ?? []).find((i) => i.r === "cash_m");
  if (cm) {
    const v = Array.isArray(cm.v) ? cm.v : [cm.v, cm.v, cm.v];
    if (v[1] > 0) plus.push(`Nel caso probabile ti restano ${eur(v[1])} al mese in più rispetto a oggi${v[2] > v[1] ? ` (fino a ${eur(v[2])} se va bene)` : ""}${cm.src === "ai" ? ", stima dell'AI da verificare" : ""}.`);
    else if (v[1] < 0) watch.push(`Nel caso probabile hai ${eur(v[1])} al mese rispetto a oggi.`);
  }
  if ((o.kd === "prova" || o.kd === "temp") && !plus.some((x) => /tornare/i.test(x))) plus.push(o.kd === "prova" ? "Puoi tornare indietro: è una prova con una data di verifica." : "È limitata nel tempo: a scadenza la rivedi.");
  if (o.kd === "rinvio") plus.push("Rimandi a quando avrai più informazioni: decidi con meno incertezza.");
  if (o.kd === "cond") plus.push("Dici sì solo se le condizioni chiave sono garantite: limiti il rischio prima di partire.");
  const mit = rv.filter((x) => x.x && x.p !== "bassa").length;
  if (mit) plus.push(`${mit === 1 ? "Un rischio ha" : `${mit} rischi hanno`} una contromisura concreta.`);
  return { watch: watch.slice(0, 7), plus: plus.slice(0, 5), seq, next: (o.next ?? []).slice(0, 4) };
}
