// Prova su 10 decisioni diverse: il motore vero di Decision OS su quadri realistici.
// Per ogni caso: versione «ingenua» (come la si pensa d'istinto) e versione completa (come la compila un utente con l'Analista).
// Esegui: node --experimental-strip-types tests/scenari10.ts > /tmp/scenari10.json
import * as E from "../lib/engine.ts";
import { briefing } from "../lib/narrative.ts";
import type { Decision, Opt, Crit, Rule, Resources } from "../lib/engine.ts";

let n = 0;
const id = () => `x${++n}`;
const g = (name: string, imp: number, why?: string): Crit => ({ id: id(), name, w: 0, imp, kind: "g", why });
const num = (name: string, imp: number, unit: string, worst: number, best: number): Crit => ({ id: id(), name, w: 0, imp, kind: "num", unit, worst, best });
type O = Partial<Opt> & { name: string; v: Record<string, number | [number, E.Rel]> };
function opt(c: Crit[], o: O): Opt {
  const s: Record<string, number> = {}, raw: Record<string, number> = {}, m: NonNullable<Opt["m"]> = {};
  for (const [k, val] of Object.entries(o.v)) {
    const cr = c.find((x) => x.name === k)!;
    const [v, rel] = Array.isArray(val) ? val : [val, "D" as E.Rel];
    if (cr.kind === "num") raw[cr.id] = v; else s[cr.id] = v;
    m[cr.id] = { rel };
  }
  const { v: _v, ...rest } = o;
  return { id: id(), s, raw, m, ...rest } as Opt;
}
const dec = (name: string, descr: string, tipo: string, crit: Crit[], options: Opt[], extra: Partial<Decision["model"]> = {}, due?: string): Decision =>
  ({ id: id(), name, descr, status: "aperta", imp: 2, due: due ?? null, model: { tipo, criteria: crit, constraints: [], options, ...extra } });
const inDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
const S = "S" as E.Rel, F = "F" as E.Rel, Q = "?" as E.Rel;

type Case = { k: string; titolo: string; base: Resources; rules: Rule[]; naive: Decision; full: Decision };
const R0: Rule[] = [{ id: "l", name: "Risparmi mai sotto 5.000 €", r: "cash_end", min: 5000 }];

const cases: Case[] = [];

// 1. Assumere una persona
{
  const c = [g("Competenze", 5), g("Affinità con il team", 4), num("Costo annuo", 3, "€/anno", 70000, 35000), num("Tempo per essere operativo", 3, "mesi", 6, 0)];
  const naive = dec("Assumere Marco o Giulia", "Due candidati per il ruolo di responsabile operativo.", "persona", c, [
    opt(c, { name: "Assumo Marco", v: { Competenze: 100, "Affinità con il team": 50, "Costo annuo": 58000, "Tempo per essere operativo": 1 } }),
    opt(c, { name: "Assumo Giulia", v: { Competenze: 75, "Affinità con il team": 100, "Costo annuo": 46000, "Tempo per essere operativo": 3 } }) ]);
  const full = dec(naive.name, naive.descr!, "persona", c, [
    opt(c, { name: "Assumo Marco", kd: "base", v: { Competenze: [100, S], "Affinità con il team": [50, S], "Costo annuo": [58000, F], "Tempo per essere operativo": [1, S] },
      cond: [{ id: id(), t: "Referenze verificate dall'ultimo datore", how: "Chiama l'ultimo responsabile di Marco", gate: true, st: "?" }],
      risks: [{ id: id(), t: "Se ne va entro un anno (ha cambiato 3 lavori in 4 anni)", p: "media", c: -15000 }], rev: { in: 8000, back: 6, lock: "medio" } }),
    opt(c, { name: "Assumo Giulia", kd: "base", v: { Competenze: [75, S], "Affinità con il team": [100, D()], "Costo annuo": [46000, F], "Tempo per essere operativo": [3, S] },
      risks: [{ id: id(), t: "Ramp-up più lungo del previsto", p: "media", m: -2000, d: 2 }], rev: { in: 6000, back: 6, lock: "medio" } }),
    opt(c, { name: "Giulia in prova 6 mesi con obiettivi", kd: "prova", v: { Competenze: [75, S], "Affinità con il team": [100, D()], "Costo annuo": [46000, F], "Tempo per essere operativo": [3, S] }, rev: { in: 3000, back: 1, lock: "basso" } }),
    opt(c, { name: "Rimando e uso un consulente 3 mesi", kd: "rinvio", v: { Competenze: [75, D()], "Affinità con il team": [50, S], "Costo annuo": [65000, F], "Tempo per essere operativo": [0, F] }, rev: { in: 0, back: 0, lock: "basso" } }),
  ], { wait: { m: 3000, t: "il reparto resta scoperto, straordinari" } });
  cases.push({ k: "assunzione", titolo: "Assumere una persona", base: { cash0: 80000, cash_m: 4000 }, rules: [], naive, full });
}
function D(): E.Rel { return "D"; }

// 2. Cambiare fornitore
{
  const c = [num("Costo annuo", 4, "€/anno", 60000, 40000), g("Qualità del servizio", 5), g("Affidabilità consegne", 4), num("Costo del cambio", 2, "€", 15000, 0)];
  const naive = dec("Cambiare fornitore di logistica", "Il fornitore attuale costa di più e sbaglia consegne; un nuovo fornitore costa il 15% in meno.", "fornitore", c, [
    opt(c, { name: "Passo al nuovo fornitore", v: { "Costo annuo": 44000, "Qualità del servizio": 75, "Affidabilità consegne": 75, "Costo del cambio": 9000 } }),
    opt(c, { name: "Tengo il fornitore attuale", kd: "sq", v: { "Costo annuo": 52000, "Qualità del servizio": 50, "Affidabilità consegne": 50, "Costo del cambio": 0 } }) ]);
  const full = dec(naive.name, naive.descr!, "fornitore", c, [
    opt(c, { name: "Passo al nuovo fornitore", kd: "base", v: { "Costo annuo": [44000, D()], "Qualità del servizio": [75, S], "Affidabilità consegne": [75, S], "Costo del cambio": [9000, S] },
      cond: [{ id: id(), t: "SLA scritto con penali sui ritardi", how: "Chiedi la bozza di contratto", gate: true, st: "?" }],
      rev: { in: 9000, out: 6000, back: 6, lock: "alto" }, risks: [{ id: id(), t: "Disservizio nel passaggio (3 mesi)", p: "alta", m: -2500, d: 3, x: "Passaggio graduale per area" }] }),
    opt(c, { name: "Pilota su una sola area per 3 mesi", kd: "prova", v: { "Costo annuo": [49000, S], "Qualità del servizio": [75, S], "Affidabilità consegne": [75, S], "Costo del cambio": [2000, S] }, rev: { in: 2000, out: 0, back: 1, lock: "basso" } }),
    opt(c, { name: "Rinegozio con l'attuale usando l'offerta", kd: "cond", v: { "Costo annuo": [47000, S], "Qualità del servizio": [50, D()], "Affidabilità consegne": [50, D()], "Costo del cambio": [0, F] } }),
    opt(c, { name: "Tengo il fornitore attuale", kd: "sq", v: { "Costo annuo": [52000, F], "Qualità del servizio": [50, F], "Affidabilità consegne": [50, F], "Costo del cambio": [0, F] } }),
  ]);
  cases.push({ k: "fornitore", titolo: "Cambiare fornitore", base: { cash0: 60000, cash_m: 3000 }, rules: [], naive, full });
}

// 3. Comprare casa
{
  const c = [num("Costo mensile totale", 5, "€/mese", 1600, 900), g("Spazio e zona", 4), g("Flessibilità futura", 3), num("Soldi da anticipare", 4, "€", 60000, 0)];
  const naive = dec("Comprare casa o restare in affitto", "Affitto a 1.100 €/mese; potrei comprare con mutuo e anticipo.", "casa", c, [
    opt(c, { name: "Compro", v: { "Costo mensile totale": 1050, "Spazio e zona": 100, "Flessibilità futura": 25, "Soldi da anticipare": 45000 } }),
    opt(c, { name: "Resto in affitto", kd: "sq", v: { "Costo mensile totale": 1100, "Spazio e zona": 50, "Flessibilità futura": 100, "Soldi da anticipare": 0 } }) ]);
  const full = dec(naive.name, naive.descr!, "casa", c, [
    opt(c, { name: "Compro", kd: "base", v: { "Costo mensile totale": [1050, S], "Spazio e zona": [100, D()], "Flessibilità futura": [25, D()], "Soldi da anticipare": [45000, F] },
      rev: { in: 45000, out: 12000, back: 12, lock: "alto" }, impacts: [{ r: "cash0", v: -45000 }, { r: "cash_m", v: [-250, 50, 100] }],
      cond: [{ id: id(), t: "Rata sostenibile anche con tasso +1,5%", how: "Chiedi alla banca la rata a tasso variabile +1,5 punti", gate: true, st: "?" }],
      risks: [{ id: id(), t: "Spese straordinarie condominio/manutenzione", p: "media", c: -8000 }] }),
    opt(c, { name: "Resto in affitto 2 anni e accumulo", kd: "temp", v: { "Costo mensile totale": [1100, F], "Spazio e zona": [50, F], "Flessibilità futura": [100, F], "Soldi da anticipare": [0, F] },
      rev: { in: 0, out: 1100, back: 3, lock: "basso" }, impacts: [{ r: "cash_m", v: [0, 0, 0] }] }),
    opt(c, { name: "Compro più piccolo con anticipo minore", kd: "cond", v: { "Costo mensile totale": [950, S], "Spazio e zona": [50, S], "Flessibilità futura": [50, S], "Soldi da anticipare": [25000, S] },
      rev: { in: 25000, out: 8000, back: 12, lock: "alto" }, impacts: [{ r: "cash0", v: -25000 }, { r: "cash_m", v: [0, 150, 200] }] }),
  ]);
  cases.push({ k: "casa", titolo: "Comprare casa", base: { cash0: 55000, cash_m: 900 }, rules: R0, naive, full });
}

// 4. Investire 20.000 €
{
  const c = [num("Rendimento atteso", 3, "€/anno", 0, 1600), g("Sicurezza", 5), g("Disponibilità se serve", 4)];
  const naive = dec("Investire 20.000 €", "Ho 24.000 € di risparmi, ne vorrei investire 20.000 in ETF.", "soldi", c, [
    opt(c, { name: "Investo 20.000 € in ETF", v: { "Rendimento atteso": 1200, Sicurezza: 50, "Disponibilità se serve": 75 } }),
    opt(c, { name: "Lascio sul conto", kd: "sq", v: { "Rendimento atteso": 0, Sicurezza: 100, "Disponibilità se serve": 100 } }) ]);
  const full = dec(naive.name, naive.descr!, "soldi", c, [
    opt(c, { name: "Investo 20.000 € in ETF", kd: "base", v: { "Rendimento atteso": [1200, S], Sicurezza: [50, S], "Disponibilità se serve": [75, S] }, impacts: [{ r: "cash0", v: -20000 }],
      risks: [{ id: id(), t: "Calo del 25% proprio quando servono i soldi", p: "media", c: -5000, x: "Tieni 6 mesi di spese fuori dall'investimento" }], rev: { in: 0, out: 100, back: 0.25, lock: "basso" } }),
    opt(c, { name: "Fondo emergenze 12.000 €, investo 12.000 € a rate", kd: "prova", v: { "Rendimento atteso": [700, S], Sicurezza: [75, S], "Disponibilità se serve": [100, D()] }, impacts: [{ r: "cash0", v: -12000 }] }),
    opt(c, { name: "Lascio sul conto deposito", kd: "sq", v: { "Rendimento atteso": [500, F], Sicurezza: [100, F], "Disponibilità se serve": [100, F] } }),
  ]);
  cases.push({ k: "investire", titolo: "Investire 20.000 €", base: { cash0: 24000, cash_m: 300 }, rules: [{ id: "l", name: "Fondo emergenze (6 mesi di spese)", r: "cash_end", min: 10000 }], naive, full });
}

// 5. Scegliere un'auto
{
  const c = [num("Costo mensile tutto incluso", 5, "€/mese", 700, 250), g("Affidabilità", 4), num("Anticipo", 3, "€", 10000, 0)];
  const naive = dec("Scegliere l'auto", "Auto vecchia da cambiare; uso 20.000 km l'anno.", "auto", c, [
    opt(c, { name: "Compro nuova ibrida", v: { "Costo mensile tutto incluso": 480, Affidabilità: 100, Anticipo: 8000 } }),
    opt(c, { name: "Noleggio a lungo termine", kd: "cerca", v: { "Costo mensile tutto incluso": 520, Affidabilità: 100, Anticipo: 3000 } }) ]);
  const full = dec(naive.name, naive.descr!, "auto", c, [
    opt(c, { name: "Compro nuova ibrida", kd: "base", v: { "Costo mensile tutto incluso": [480, S], Affidabilità: [100, D()], Anticipo: [8000, F] }, rev: { in: 8000, out: 6000, back: 1, lock: "medio" } }),
    opt(c, { name: "Noleggio a lungo termine", kd: "cerca", v: { "Costo mensile tutto incluso": [520, F], Affidabilità: [100, F], Anticipo: [3000, F] }, rev: { in: 3000, out: 4000, back: 1, lock: "medio" } }),
    opt(c, { name: "Usato garantito 3 anni", kd: "cond", v: { "Costo mensile tutto incluso": [380, S], Affidabilità: [75, S], Anticipo: [4000, F] }, rev: { in: 4000, out: 1500, back: 1, lock: "basso" },
      risks: [{ id: id(), t: "Riparazione importante fuori garanzia", p: "bassa", c: -2500 }] }),
    opt(c, { name: "Tengo la vecchia un anno", kd: "sq", v: { "Costo mensile tutto incluso": [300, S], Affidabilità: [25, D()], Anticipo: [0, F] }, risks: [{ id: id(), t: "Guasto grave e auto da sostituire d'urgenza", p: "alta", c: -3000 }] }),
  ]);
  cases.push({ k: "auto", titolo: "Scegliere un'auto", base: { cash0: 15000, cash_m: 500 }, rules: R0, naive, full });
}

// 6. Abbandonare un progetto
{
  const c = [g("Potenziale", 4), num("Tempo richiesto", 4, "ore/settimana", 25, 0), num("Costo mensile", 3, "€/mese", 1500, 0), g("Coerenza con i miei obiettivi", 3)];
  const naive = dec("Chiudere il progetto o dargli altri 6 mesi", "Dopo 18 mesi e 30.000 € spesi, i ricavi coprono il 20% dei costi.", "progetto", c, [
    opt(c, { name: "Altri 6 mesi come ora", v: { Potenziale: 75, "Tempo richiesto": 20, "Costo mensile": 1200, "Coerenza con i miei obiettivi": 75 } }),
    opt(c, { name: "Chiudo", v: { Potenziale: 0, "Tempo richiesto": 0, "Costo mensile": 0, "Coerenza con i miei obiettivi": 25 } }) ]);
  const full = dec(naive.name, naive.descr!, "progetto", c, [
    opt(c, { name: "Altri 6 mesi come ora", kd: "temp", v: { Potenziale: [75, S], "Tempo richiesto": [20, F], "Costo mensile": [1200, F], "Coerenza con i miei obiettivi": [75, D()] },
      impacts: [{ r: "cash_m", v: [-1200, -1000, -600] }], risks: [{ id: id(), t: "Fra 6 mesi siamo allo stesso punto", p: "alta", c: -7000 }] }),
    opt(c, { name: "6 mesi con obiettivi di uscita (3 clienti paganti)", kd: "prova", v: { Potenziale: [75, S], "Tempo richiesto": [15, S], "Costo mensile": [800, S], "Coerenza con i miei obiettivi": [75, D()] },
      impacts: [{ r: "cash_m", v: [-800, -600, -200] }], cond: [{ id: id(), t: "Obiettivi misurabili scritti oggi, con data", how: "Scrivi 3 obiettivi e la data di verifica", gate: true, st: "?" }] }),
    opt(c, { name: "Chiudo e recupero ciò che si può (clienti, codice)", kd: "base", v: { Potenziale: [0, F], "Tempo richiesto": [0, F], "Costo mensile": [0, F], "Coerenza con i miei obiettivi": [25, D()] } }),
  ]);
  cases.push({ k: "progetto", titolo: "Abbandonare un progetto", base: { cash0: 18000, cash_m: 600 }, rules: R0, naive, full });
}

// 7. Master sì/no
{
  const c = [num("Costo", 3, "€", 15000, 0), num("Tempo richiesto", 4, "ore/settimana", 20, 0), g("Utilità per la carriera", 5), g("Vita privata", 4)];
  const naive = dec("Master serale mentre lavoro", "Master da 12.000 €, 15 ore a settimana per 2 anni.", "studio", c, [
    opt(c, { name: "Mi iscrivo", v: { Costo: 12000, "Tempo richiesto": 15, "Utilità per la carriera": 100, "Vita privata": 25 } }),
    opt(c, { name: "Non mi iscrivo", kd: "sq", v: { Costo: 0, "Tempo richiesto": 0, "Utilità per la carriera": 25, "Vita privata": 100 } }) ]);
  const full = dec(naive.name, naive.descr!, "studio", c, [
    opt(c, { name: "Mi iscrivo", kd: "base", v: { Costo: [12000, F], "Tempo richiesto": [15, D()], "Utilità per la carriera": [100, S], "Vita privata": [25, S] }, rev: { in: 4000, out: 8000, back: 0.5, lock: "medio" } }),
    opt(c, { name: "Corso breve certificato prima (3 mesi)", kd: "prova", v: { Costo: [1500, F], "Tempo richiesto": [6, F], "Utilità per la carriera": [75, S], "Vita privata": [75, S] }, rev: { in: 1500, back: 0, lock: "basso" } }),
    opt(c, { name: "Mi iscrivo solo se l'azienda paga il 50%", kd: "cond", v: { Costo: [6000, S], "Tempo richiesto": [15, D()], "Utilità per la carriera": [100, S], "Vita privata": [25, S] },
      cond: [{ id: id(), t: "Azienda conferma il 50% per iscritto", how: "Chiedi all'HR la policy formazione", gate: true, st: "?" }] }),
    opt(c, { name: "Non mi iscrivo", kd: "sq", v: { Costo: [0, F], "Tempo richiesto": [0, F], "Utilità per la carriera": [25, S], "Vita privata": [100, F] } }),
  ], {}, inDays(20));
  full.model.options[0].exp = inDays(20);
  cases.push({ k: "master", titolo: "Master sì/no", base: { cash0: 20000, cash_m: 600 }, rules: R0, naive, full });
}

// 8. Trasferire un'attività
{
  const c = [num("Margine mensile", 5, "€/mese", 0, 6000), g("Clientela", 4), num("Costo del trasloco", 3, "€", 40000, 0), g("Qualità della vita", 3)];
  const naive = dec("Spostare il negozio in centro", "Negozio in periferia; un locale in centro costa il doppio di affitto.", "progetto", c, [
    opt(c, { name: "Mi sposto in centro", v: { "Margine mensile": 4500, Clientela: 100, "Costo del trasloco": 30000, "Qualità della vita": 50 } }),
    opt(c, { name: "Resto dove sono", kd: "sq", v: { "Margine mensile": 2500, Clientela: 50, "Costo del trasloco": 0, "Qualità della vita": 75 } }) ]);
  const full = dec(naive.name, naive.descr!, "progetto", c, [
    opt(c, { name: "Mi sposto in centro", kd: "base", v: { "Margine mensile": [4500, S], Clientela: [100, S], "Costo del trasloco": [30000, S], "Qualità della vita": [50, D()] },
      rev: { in: 30000, out: 10000, back: 12, lock: "alto" }, impacts: [{ r: "cash0", v: -30000 }, { r: "cash_m", v: [-1500, 2000, 3000] }],
      risks: [{ id: id(), t: "Clientela del centro più lenta ad arrivare (6 mesi)", p: "alta", m: -2000, d: 6, x: "Pop-up in centro prima di firmare" }] }),
    opt(c, { name: "Pop-up in centro 3 mesi, poi decido", kd: "prova", v: { "Margine mensile": [3000, S], Clientela: [75, S], "Costo del trasloco": [6000, S], "Qualità della vita": [50, D()] },
      rev: { in: 6000, back: 0, lock: "basso" }, impacts: [{ r: "cash0", v: -6000 }, { r: "cash_m", v: [-500, 300, 800] }] }),
    opt(c, { name: "Resto e investo in vendita online", kd: "cerca", v: { "Margine mensile": [3200, S], Clientela: [75, S], "Costo del trasloco": [8000, S], "Qualità della vita": [75, D()] }, impacts: [{ r: "cash0", v: -8000 }, { r: "cash_m", v: [0, 500, 900] }] }),
    opt(c, { name: "Resto dove sono", kd: "sq", v: { "Margine mensile": [2500, F], Clientela: [50, F], "Costo del trasloco": [0, F], "Qualità della vita": [75, F] } }),
  ]);
  cases.push({ k: "trasferimento", titolo: "Trasferire un'attività", base: { cash0: 38000, cash_m: 2500 }, rules: [{ id: "l", name: "Cassa mai sotto 10.000 €", r: "cash_end", min: 10000 }], naive, full });
}

// 9. Due offerte commerciali
{
  const c = [num("Margine annuo", 5, "€/anno", 10000, 60000), g("Rischio di pagamento", 4), g("Valore strategico", 3), num("Ore richieste", 3, "ore/settimana", 30, 5)];
  const naive = dec("Offerta A (grande cliente) o B (cliente medio)", "Posso seguire un solo cliente nuovo quest'anno.", "acquisto", c, [
    opt(c, { name: "Prendo il cliente A", v: { "Margine annuo": 48000, "Rischio di pagamento": 50, "Valore strategico": 100, "Ore richieste": 25 } }),
    opt(c, { name: "Prendo il cliente B", v: { "Margine annuo": 30000, "Rischio di pagamento": 100, "Valore strategico": 50, "Ore richieste": 12 } }) ]);
  const full = dec(naive.name, naive.descr!, "acquisto", c, [
    opt(c, { name: "Prendo il cliente A", kd: "base", v: { "Margine annuo": [48000, D()], "Rischio di pagamento": [50, S], "Valore strategico": [100, S], "Ore richieste": [25, S] },
      exp: inDays(10), cond: [{ id: id(), t: "Pagamento a 60 giorni, non 120", how: "Negozia i termini prima di firmare", gate: true, st: "?" }],
      risks: [{ id: id(), t: "Paga a 120 giorni: buco di cassa", p: "alta", c: -16000, x: "Anticipo del 30% alla firma" }] }),
    opt(c, { name: "Prendo il cliente B", kd: "base", v: { "Margine annuo": [30000, D()], "Rischio di pagamento": [100, F], "Valore strategico": [50, S], "Ore richieste": [12, D()] } }),
    opt(c, { name: "Prendo B e A solo con anticipo del 30%", kd: "cond", v: { "Margine annuo": [60000, S], "Rischio di pagamento": [75, S], "Valore strategico": [100, S], "Ore richieste": [30, S] } }),
  ], { wait: { m: 0, t: "l'offerta A scade" } });
  cases.push({ k: "offerte", titolo: "Due offerte commerciali", base: { cash0: 25000, cash_m: 2000, hours_w: 30 }, rules: [{ id: "h", name: "Ore libere non negative", r: "hours_w", min: 0 }], naive, full });
}

// 10. Internalizzare o esternalizzare
{
  const c = [num("Costo annuo", 4, "€/anno", 120000, 70000), g("Controllo sulla qualità", 4), g("Flessibilità", 3), g("Rischio operativo", 4)];
  const naive = dec("Internalizzare il customer care", "Oggi esternalizzato a 95.000 €/anno; internamente servirebbero 3 persone.", "fornitore", c, [
    opt(c, { name: "Internalizzo (3 persone)", v: { "Costo annuo": 90000, "Controllo sulla qualità": 100, Flessibilità: 25, "Rischio operativo": 50 } }),
    opt(c, { name: "Resto esternalizzato", kd: "sq", v: { "Costo annuo": 95000, "Controllo sulla qualità": 50, Flessibilità: 100, "Rischio operativo": 75 } }) ]);
  const full = dec(naive.name, naive.descr!, "fornitore", c, [
    opt(c, { name: "Internalizzo (3 persone)", kd: "base", v: { "Costo annuo": [90000, S], "Controllo sulla qualità": [100, S], Flessibilità: [25, D()], "Rischio operativo": [50, S] },
      impacts: [{ r: "x_pers", v: -1 }], rev: { in: 20000, out: 25000, back: 9, lock: "alto" }, risks: [{ id: id(), t: "Turnover: una persona su tre se ne va", p: "media", c: -12000 }] }),
    opt(c, { name: "Modello ibrido: 1 interno + fornitore per i picchi", kd: "prova", v: { "Costo annuo": [93000, S], "Controllo sulla qualità": [75, S], Flessibilità: [75, S], "Rischio operativo": [75, S] }, rev: { in: 6000, out: 3000, back: 2, lock: "basso" } }),
    opt(c, { name: "Resto esternalizzato e rinegozio gli SLA", kd: "cond", v: { "Costo annuo": [92000, S], "Controllo sulla qualità": [75, S], Flessibilità: [100, F], "Rischio operativo": [75, D()] } }),
    opt(c, { name: "Resto esternalizzato", kd: "sq", v: { "Costo annuo": [95000, F], "Controllo sulla qualità": [50, D()], Flessibilità: [100, F], "Rischio operativo": [75, D()] } }),
  ]);
  cases.push({ k: "internalizzare", titolo: "Internalizzare o esternalizzare", base: { cash0: 150000, cash_m: 8000, x_pers: 4 }, rules: [{ id: "p", name: "Persone libere per l'onboarding (≥ 4)", r: "x_pers", min: 4 }], naive, full });
}

// ---------- esecuzione ----------
const out = cases.map((cs) => {
  const run = (d: Decision) => {
    const r = E.analyzeDecision(d);
    const info = E.infoValue(d);
    const rd = E.readiness(d, r, cs.base, cs.rules, info);
    const fo = E.focus(d, r, E.turningPoints(d, r), info);
    const lead = rd.lead ? d.model.options.find((o) => o.id === rd.lead!.id)! : undefined;
    return {
      top: r.rows.filter((x) => !x.excluded.length).map((x) => `${x.name} ${x.score}`).slice(0, 4),
      excluded: r.rows.filter((x) => x.excluded.length).map((x) => `${x.name}: ${x.excluded.join("; ")}`),
      state: rd.state, lead: rd.lead?.name, fallback: rd.fallback ? `${rd.fallback.name}${rd.fallback.open.length ? " (richiede: " + rd.fallback.open.join("; ") + ")" : ""}` : null,
      dilemma: rd.dilemma?.msg ?? null,
      cond: rd.open.filter((c) => c.grp === "cond").map((c) => c.t), chiarire: rd.open.filter((c) => c.grp === "chiarire").map((c) => c.t),
      piano: rd.open.map((c) => c.how).slice(0, 5),
      trade: fo?.trade, decide: fo?.decide, calm: fo?.calm.map((x) => `${x.critName} di ${x.optName}`),
      wait: rd.wait && (rd.wait.m || rd.wait.exp.length) ? rd.wait : null,
      rischi: E.riskSummary(d, cs.base, cs.rules).filter((x) => x.n).map((x) => `${x.name}: peggiore ${x.worst?.t} ${x.worst?.tot ?? 0} €, pesato ${x.pesato} €${x.rompe ? `, oltre i limiti ${x.rompe}` : ""}`),
      rev: d.model.options.map((o) => ({ o: o.name, r: E.revOf(o, cs.base)?.label })).filter((x) => x.r),
      bias: E.biasChecks(d, r).map((b) => b.t),
      brief: lead ? briefing(d, r, lead, cs.base, cs.rules) : null,
    };
  };
  return { k: cs.k, titolo: cs.titolo, naive: run(cs.naive), full: run(cs.full) };
});
console.log(JSON.stringify(out, null, 1));
