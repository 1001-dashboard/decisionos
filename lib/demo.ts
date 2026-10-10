import type { Decision, Dep, Resources, Rule } from "./engine.ts";

// Dati dimostrativi: valori inventati a scopo illustrativo.
export const demoResources: Resources = { cash0: 15000, cash_m: -400, hours_w: 55 };

export const demoRules: Rule[] = [
  { id: "r1", name: "Riserva a fine orizzonte", r: "cash_end", min: 3000 },
  { id: "r2", name: "Autonomia minima", r: "autonomia_mesi", min: 6 },
  { id: "r3", name: "Ore settimanali", r: "hours_w", min: 0 },
];

export const demoDecisions: Decision[] = [
  {
    id: "A", name: "Lavoro", status: "aperta", imp: 2,
    descr: "Mi hanno proposto un lavoro a Ibiza. Opportunità professionale, ma trasferimento costoso.",
    model: {
      criteria: [
        { id: "eco", name: "Margine mensile", w: 30, group: "soldi", lo: "≤ 0 €", hi: "≥ 2.000 €" },
        { id: "sic", name: "Sicurezza economica", w: 15, group: "soldi", lo: "nessuna tutela", hi: "indeterminato" },
        { id: "car", name: "Crescita professionale", w: 25, lo: "stallo", hi: "salto di ruolo" },
        { id: "fam", name: "Impatto famiglia", w: 30, lo: "molto negativo", hi: "molto positivo" },
      ],
      constraints: [{ id: "k1", name: "Famiglia sostenibile", crit: "fam", min: 40 }],
      options: [
        {
          id: "A1", name: "Ibiza", s: { eco: 70, sic: 50, car: 85, fam: 45 },
          m: {
            eco: { why: "netto 3.200 € − affitto stimato 1.600 €", rel: "S" },
            sic: { why: "contratto stagionale rinnovabile", rel: "D" },
            car: { why: "ruolo di responsabilità su più sedi", rel: "D" },
            fam: { why: "distanza dai parenti, cambio asilo", rel: "S" },
          },
          impacts: [
            { r: "cash0", v: -6000, tag: "trasloco" },
            { r: "cash_m", v: [700, 1000, 1300] },
            { r: "hours_w", v: -45 },
          ],
        },
        {
          id: "A2", name: "Dipendente a Roma", s: { eco: 55, sic: 75, car: 50, fam: 85 },
          m: { eco: { why: "offerta ricevuta, netto 2.300 €", rel: "F" } },
          impacts: [{ r: "cash_m", v: [800, 900, 1000] }, { r: "hours_w", v: -42 }],
        },
        {
          id: "A3", name: "Consulenza freelance", s: { eco: 40, sic: 30, car: 70, fam: 80 },
          m: { eco: { why: "2 clienti probabili, nessuno firmato", rel: "S" } },
          impacts: [{ r: "cash_m", v: [-200, 500, 1200] }, { r: "hours_w", v: -35 }],
        },
      ],
      assumptions: [
        { id: "a1", t: "Affitto bilocale a Ibiza ~1.600 €/mese", rel: "S", aff: "bassa", src: "annunci online" },
        { id: "a2", t: "Stipendio netto Ibiza 3.200 €", rel: "D", aff: "media", src: "colloquio" },
        { id: "a3", t: "Costo trasloco e cauzioni ~6.000 €", rel: "S", aff: "media" },
        { id: "a4", t: "Durata contratto oltre la stagione", rel: "?" },
      ],
    },
  },
  {
    id: "B", name: "FleetUnit", status: "aperta", imp: 1,
    model: {
      criteria: [
        { id: "pot", name: "Potenziale", w: 50 },
        { id: "fat", name: "Fattibilità", w: 50 },
      ],
      constraints: [],
      options: [
        { id: "B1", name: "Part-time", s: { pot: 55, fat: 70 }, impacts: [{ r: "cash_m", v: -150 }, { r: "hours_w", v: -10 }] },
        { id: "B2", name: "Full-time", s: { pot: 85, fat: 35 }, impacts: [{ r: "cash_m", v: [-600, -400, -200] }, { r: "hours_w", v: -30 }] },
        { id: "B3", name: "In pausa", s: { pot: 10, fat: 100 } },
      ],
    },
  },
];

export const demoDeps: Dep[] = [
  { id: "d1", if: "A1", excl: "B2", why: "Full-time incompatibile con il trasferimento", confirmed: true },
  { id: "d2", if: "A2", excl: "B2", why: "Full-time + lavoro dipendente: ore insufficienti", confirmed: true },
];
