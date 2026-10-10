import { type Combo, type DecResult, type Decision, type Rule, eur, fmt, cashBreakpoint, normalize } from "./engine.ts";

export type Section = { k: string; title: string; lines: string[]; tone?: "ok" | "warn" | "bad" };

const REL: Record<string, string> = { F: "verificato", D: "dichiarato", S: "stima", "?": "mancante" };

/** Report deterministico in 6 sezioni. Nessun indicatore unico "scelta migliore". */
export function buildReport(decs: Decision[], res: DecResult[], cmb: Combo[], rules: Rule[], horizon: number): Section[] {
  const S: Section[] = [];
  const top = res.map((r) => r.rows.find((x) => !x.excluded.length));
  const best = cmb.find((c) => !c.excluded.length);

  // 1. Preferibile
  const l1: string[] = [];
  res.forEach((r, i) => {
    const t = top[i];
    if (!t) { l1.push(`${r.name}: nessuna alternativa rispetta i vincoli obbligatori.`); return; }
    const second = r.rows.filter((x) => !x.excluded.length)[1];
    const strong = t.detail.filter((d) => d.contrib != null).sort((a, b) => (b.contrib ?? 0) - (a.contrib ?? 0)).slice(0, 2).map((d) => d.name.toLowerCase());
    l1.push(`${r.name}: prevale **${t.name}** (${fmt(t.score)})${second ? `, ${fmt(r.margin ?? 0)} punti su ${second.name}` : ""}. Spinta soprattutto da ${strong.join(" e ")}.`);
    if (t.pending.length) l1.push(`Condizione ancora da verificare per ${t.name}: ${t.pending.join("; ")}.`);
  });
  if (best && decs.length > 1) l1.push(`Piano combinato con punteggio più alto: **${best.names.join(" + ")}** (${fmt(best.score)}).`);
  S.push({ k: "pref", title: "Alternativa preferibile secondo i criteri attuali", lines: l1 });

  // 2. Sostenibilità
  const l2: string[] = [];
  let t2: Section["tone"] = "ok";
  const plan = best ?? cmb[0];
  if (plan) {
    const c = plan.scen.centrale.res, f = plan.scen.sfavorevole;
    if (c.cash_end != null) l2.push(`Scenario centrale, ${horizon} mesi: liquidità finale ${eur(c.cash_end)}, flusso ${eur(c.cash_m)}/mese, autonomia ${c.autonomia_mesi === Infinity ? "illimitata (flusso positivo)" : fmt(c.autonomia_mesi) + " mesi"}.`);
    if (c.hours_w != null) l2.push(`Ore libere residue: ${fmt(c.hours_w)}/settimana.`);
    if (f.viol.length) { t2 = "warn"; l2.push(`In scenario sfavorevole viola: ${f.viol.join("; ")}.`); }
    else l2.push("Anche in scenario sfavorevole i vincoli sulle risorse sono rispettati.");
    const bp = cashBreakpoint({ cash0: c.cash0 }, rules, horizon);
    if (bp != null) l2.push(`Il piano regge finché il flusso netto resta sopra ${eur(bp)}/mese.`);
  } else if (!res.some((r) => r.feasible.length)) { t2 = "bad"; l2.push("Nessuna combinazione ammissibile."); }
  if (!best && cmb.length) { t2 = "bad"; l2.push("Tutti i piani combinati violano un vincolo o un collegamento."); }
  if (!l2.length) l2.push("Aggiungi impatti sulle risorse (€, ore) alle alternative per valutare la sostenibilità.");
  S.push({ k: "sost", title: "Sostenibilità", lines: l2, tone: t2 });

  // 3. Robustezza
  const l3: string[] = [];
  let t3: Section["tone"] = "ok";
  res.forEach((r) => {
    if (r.tie) { t3 = "bad"; l3.push(`${r.name}: parità. Il modello non discrimina, servono criteri o dati migliori.`); return; }
    if (r.fragile.length) {
      t3 = "warn";
      const nm = (id: string | null) => r.rows.find((x) => x.id === id)?.name ?? id;
      l3.push(`${r.name}: classifica fragile. ${r.fragile.map((s) => `${s.name} ${s.delta! > 0 ? "+" : ""}${s.delta} pt → vince ${nm(s.newTop)}`).join("; ")}.`);
    } else if (r.sens.length) l3.push(`${r.name}: robusta. Nessun singolo peso ribalta la prima scelta entro ±10 punti.`);
    if (r.warn.some((w) => w.includes("doppio"))) l3.push(`${r.name}: possibile doppio conteggio tra criteri economici.`);
  });
  S.push({ k: "rob", title: "Robustezza", lines: l3.length ? l3 : ["Servono almeno due alternative ammissibili."], tone: t3 });

  // 4. Affidabilità
  const l4: string[] = [];
  let t4: Section["tone"] = "ok";
  decs.forEach((d, i) => {
    const t = top[i];
    if (!t) return;
    const nm = normalize(d.model);
    const o = nm.options.find((x) => x.id === t.id)!;
    const cnt: Record<string, number> = { F: 0, D: 0, S: 0, "?": 0 };
    nm.criteria.forEach((c) => { cnt[o.s?.[c.id] == null ? "?" : o.m?.[c.id]?.rel ?? "D"]++; });
    l4.push(`${d.name} / ${t.name}: ${Object.entries(cnt).filter(([, n]) => n).map(([k, n]) => `${n} ${REL[k]}`).join(", ")}.`);
    if (cnt.S + cnt["?"] > cnt.F + cnt.D) t4 = "warn";
    const weak = (d.model.assumptions ?? []).filter((a) => a.rel === "?" || a.aff === "bassa");
    if (weak.length) { t4 = "warn"; l4.push(`Da verificare: ${weak.map((a) => a.t).join("; ")}.`); }
  });
  S.push({ k: "aff", title: "Affidabilità delle informazioni", lines: l4, tone: t4 });

  // 5. Effetti
  const l5: string[] = [];
  if (decs.length > 1) {
    const ex = cmb.filter((c) => c.excluded.length);
    if (ex.length) l5.push(`${ex.length} piani su ${cmb.length} esclusi: ${[...new Set(ex.flatMap((c) => c.excluded))].slice(0, 3).join("; ")}.`);
    const okc = cmb.filter((c) => !c.excluded.length);
    if (okc.length > 1) {
      const by = [...okc].sort((a, b) => (b.scen.centrale.res.cash_end ?? 0) - (a.scen.centrale.res.cash_end ?? 0));
      l5.push(`Più liquidità a fine orizzonte: ${by[0].names.join(" + ")} (${eur(by[0].scen.centrale.res.cash_end ?? 0)}). Meno: ${by.at(-1)!.names.join(" + ")} (${eur(by.at(-1)!.scen.centrale.res.cash_end ?? 0)}).`);
    }
  } else l5.push("Collega altre decisioni aperte per vedere conflitti e costi condivisi.");
  S.push({ k: "eff", title: "Effetti sulle altre decisioni", lines: l5 });

  // 6. Prossima azione
  const l6: string[] = [];
  const allA = decs.flatMap((d) => d.model.assumptions ?? []);
  const miss = allA.find((a) => a.rel === "?") ?? allA.find((a) => a.aff === "bassa");
  const frag = res.flatMap((r) => r.fragile)[0];
  const missScore = res.flatMap((r) => r.rows.filter((x) => x.missing.length))[0];
  if (missScore) l6.push(`Completa il dato "${missScore.missing[0]}" per ${missScore.name}: oggi il punteggio è solo un intervallo.`);
  else if (miss) l6.push(`Verifica: ${miss.t}. È l'ipotesi più debole che regge la conclusione.`);
  else if (frag) l6.push(`Rivedi il peso di "${frag.name}": è la leva che decide la classifica.`);
  else l6.push("Fissa una data di revisione e registra la decisione nel Registro.");
  S.push({ k: "next", title: "Prossima azione utile", lines: l6 });
  return S;
}

export const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((p, i) => (i % 2 ? { b: p } : { t: p }));
