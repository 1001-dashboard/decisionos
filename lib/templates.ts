import { uid, type Crit, type Model, type PlanKind } from "./engine.ts";

/** Modelli di partenza: solo struttura (alternative, criteri, dubbi tipici). Nessun valore: li metti tu.
 *  Le scale in denaro restano vuote apposta: pessimo e ottimo dipendono dalla tua situazione. */
type C = Partial<Crit> & { name: string; kind: "num" | "g" };
/** alts: nome della strada, con la sua strategia (diretta, condizionata, sperimentale, rinviata, alternativa, status quo). */
export type Template = { k: string; t: string; d: string; icon: string; alts: [string, PlanKind][]; crit: C[]; doubts: string[] };

export const TEMPLATES: Template[] = [
  { k: "lavoro", t: "Offerta di lavoro", d: "Accettare, restare, negoziare", icon: "briefcase",
    alts: [["Accetto l'offerta", "base"], ["Accetto solo a condizioni migliori", "cond"], ["Resto dove sono", "sq"]],
    crit: [
      { name: "Stipendio netto", kind: "num", unit: "€/mese", imp: 4 },
      { name: "Tempo di viaggio", kind: "num", unit: "minuti/giorno", worst: 120, best: 0, imp: 3 },
      { name: "Crescita professionale", kind: "g", imp: 3 },
      { name: "Stabilità del lavoro", kind: "g", imp: 3 },
      { name: "Equilibrio vita-lavoro", kind: "g", imp: 4 },
    ],
    doubts: ["Stipendio netto reale (non lordo)", "Durata e tipo di contratto", "Benefit inclusi"] },
  { k: "casa", t: "Casa", d: "Comprare, affittare, cambiare zona", icon: "home",
    alts: [["Compro", "base"], ["Cambio casa in affitto", "cerca"], ["Resto in affitto dove sono", "sq"]],
    crit: [
      { name: "Costo mensile totale", kind: "num", unit: "€/mese", imp: 5 },
      { name: "Soldi da anticipare", kind: "num", unit: "€", imp: 4 },
      { name: "Spazio", kind: "num", unit: "m²", imp: 3 },
      { name: "Zona e servizi", kind: "g", imp: 3 },
      { name: "Flessibilità futura", kind: "g", imp: 2 },
    ],
    doubts: ["Rata mutuo e tasso reali", "Spese condominiali e manutenzione", "Tempi di vendita/uscita"] },
  { k: "auto", t: "Auto o mezzo", d: "Comprare, noleggiare, tenere", icon: "car",
    alts: [["Compro", "base"], ["Noleggio a lungo termine", "cerca"], ["Tengo quella attuale", "sq"]],
    crit: [
      { name: "Costo mensile tutto incluso", kind: "num", unit: "€/mese", imp: 5 },
      { name: "Anticipo", kind: "num", unit: "€", imp: 3 },
      { name: "Affidabilità", kind: "g", imp: 4 },
      { name: "Rischio di spese impreviste", kind: "g", imp: 3, lo: "molto alto", hi: "nullo" },
    ],
    doubts: ["Km annui reali", "Costo assicurazione", "Valore residuo"] },
  { k: "progetto", t: "Avviare un progetto", d: "Partire, testare in piccolo, rimandare", icon: "rocket",
    alts: [["Parto ora", "base"], ["Test in piccolo, con verifica", "prova"], ["Rimando", "rinvio"]],
    crit: [
      { name: "Investimento iniziale", kind: "num", unit: "€", imp: 4 },
      { name: "Tempo richiesto", kind: "num", unit: "ore/settimana", worst: 40, best: 5, imp: 4 },
      { name: "Potenziale", kind: "g", imp: 4 },
      { name: "Rischio contenuto", kind: "g", imp: 3 },
      { name: "Coerenza con i miei obiettivi", kind: "g", imp: 3 },
    ],
    doubts: ["Primi clienti disposti a pagare?", "Mesi prima di incassare", "Soci o finanziamenti"] },
  { k: "fornitore", t: "Fornitore o acquisto", d: "Scegliere tra offerte", icon: "package",
    alts: [["Offerta A", "base"], ["Offerta B", "base"], ["Pilota con il nuovo fornitore", "prova"], ["Tengo il fornitore attuale", "sq"]],
    crit: [
      { name: "Costo annuo", kind: "num", unit: "€/anno", imp: 4 },
      { name: "Qualità", kind: "g", imp: 4 },
      { name: "Tempi di consegna", kind: "num", unit: "giorni", worst: 30, best: 1, imp: 3 },
      { name: "Affidabilità", kind: "g", imp: 4 },
      { name: "Costo del cambio", kind: "num", unit: "€", imp: 2 },
    ],
    doubts: ["Penali e durata del contratto", "Referenze di altri clienti"] },
  { k: "persona", t: "Assunzione o collaborazione", d: "Scegliere tra candidati", icon: "users",
    alts: [["Candidato A", "base"], ["Candidato B", "base"], ["Periodo di prova o collaborazione", "prova"], ["Non assumo ora", "rinvio"]],
    crit: [
      { name: "Costo annuo", kind: "num", unit: "€/anno", imp: 3 },
      { name: "Competenze", kind: "g", imp: 5 },
      { name: "Affinità con il team", kind: "g", imp: 4 },
      { name: "Tempo per essere operativo", kind: "num", unit: "mesi", worst: 6, best: 0, imp: 3 },
    ],
    doubts: ["Referenze verificate", "Disponibilità effettiva"] },
  { k: "studio", t: "Formazione o corso", d: "Iscriversi, scegliere, aspettare", icon: "graduation",
    alts: [["Corso A", "base"], ["Corso B", "base"], ["Aspetto un anno", "rinvio"]],
    crit: [
      { name: "Costo", kind: "num", unit: "€", imp: 3 },
      { name: "Tempo richiesto", kind: "num", unit: "ore/settimana", worst: 20, best: 2, imp: 4 },
      { name: "Utilità per il lavoro", kind: "g", imp: 5 },
      { name: "Riconoscimento del titolo", kind: "g", imp: 3 },
    ],
    doubts: ["Sbocchi reali di chi l'ha fatto", "Possibilità di rimborso o fondi"] },
  { k: "soldi", t: "Uso dei risparmi", d: "Investire, spendere, tenere", icon: "piggy",
    alts: [["Investo", "base"], ["Uso per una spesa", "base"], ["Investo una parte, il resto da parte", "prova"], ["Tengo da parte", "sq"]],
    crit: [
      { name: "Rendimento atteso", kind: "num", unit: "€/anno", imp: 3 },
      { name: "Sicurezza", kind: "g", imp: 5 },
      { name: "Disponibilità se serve", kind: "g", imp: 4 },
      { name: "Beneficio per la mia vita", kind: "g", imp: 3 },
    ],
    doubts: ["Costi e tasse reali", "Fondo emergenze già coperto?"] },
];

/** Libreria di criteri, raggruppata, per i suggerimenti nel passo «Cosa conta». */
export const CRIT_LIB: { g: string; items: C[] }[] = [
  { g: "Soldi", items: [
    { name: "Soldi che restano a fine mese", kind: "num", unit: "€/mese", worst: 0, best: 1500 },
    { name: "Costo mensile", kind: "num", unit: "€/mese" },
    { name: "Spesa iniziale", kind: "num", unit: "€" },
    { name: "Guadagno annuo", kind: "num", unit: "€/anno" },
  ] },
  { g: "Tempo", items: [
    { name: "Tempo richiesto", kind: "num", unit: "ore/settimana" },
    { name: "Tempo di viaggio", kind: "num", unit: "minuti/giorno", worst: 120, best: 0 },
    { name: "Tempo libero", kind: "num", unit: "ore/settimana", worst: 0, best: 20 },
  ] },
  { g: "Persone", items: [{ name: "Famiglia", kind: "g" }, { name: "Relazioni e team", kind: "g" }] },
  { g: "Qualità", items: [{ name: "Qualità", kind: "g" }, { name: "Affidabilità", kind: "g" }, { name: "Comodità", kind: "g" }] },
  { g: "Futuro", items: [{ name: "Crescita", kind: "g" }, { name: "Flessibilità futura", kind: "g" }, { name: "Stabilità", kind: "g" }] },
  { g: "Rischio e benessere", items: [{ name: "Rischio contenuto", kind: "g" }, { name: "Serenità (poco stress)", kind: "g" }, { name: "Salute", kind: "g" }] },
];

export function fromTemplate(t: Template): { name: string; model: Model } {
  const criteria: Crit[] = t.crit.map((c) => ({ id: uid(), w: 0, imp: 3, worst: null, best: null, ...c }));
  return {
    name: t.t,
    model: {
      criteria,
      constraints: [],
      options: t.alts.map(([n, kd]) => ({ id: uid(), name: n, kd, s: {} })),
      tipo: t.k,
      assumptions: t.doubts.map((x) => ({ id: uid(), t: x, rel: "?" as const })),
    },
  };
}
