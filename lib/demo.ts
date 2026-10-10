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

/** Esempio nel nuovo formato (valori reali e giudizi), usato da «Esempio» in Nuova decisione. */
export const exampleDecision: Decision = {
  id: "EX", name: "Lavoro a Ibiza (esempio)", status: "aperta", imp: 2,
  descr: "Proposta come Station Manager a Ibiza. Andrei prima da solo, poi con la famiglia. Gli affitti sono alti.",
  model: {
    criteria: [
      { id: "eco", name: "Soldi che restano a fine mese", w: 0, imp: 5, kind: "num", unit: "€/mese", worst: 0, best: 1500 },
      { id: "fam", name: "Famiglia", w: 0, imp: 5, kind: "g" },
      { id: "car", name: "Crescita professionale", w: 0, imp: 3, kind: "g" },
      { id: "sta", name: "Stabilità del lavoro", w: 0, imp: 3, kind: "g" },
    ],
    constraints: [{ id: "k1", name: "Almeno 300 € al mese", crit: "eco", min: 300 }],
    options: [
      { id: "E1", name: "Accetto Ibiza", s: { fam: 25, car: 100, sta: 50 }, raw: { eco: 700 },
        pro: ["Salto di ruolo", "Esperienza internazionale"], con: ["Famiglia divisa i primi mesi", "Affitto si mangia metà stipendio"],
        m: { eco: { why: "netto stimato meno affitto ~1.450 €", rel: "S" }, car: { rel: "D", why: "ruolo di responsabilità" } },
        impacts: [{ r: "cash0", v: -5000, tag: "trasloco" }, { r: "cash_m", v: [300, 700, 1000] }, { r: "hours_w", v: -45 }] },
      { id: "E2", name: "Ibiza con alloggio incluso", note: "Da negoziare: alloggio aziendale piccolo, contratto stagionale", s: { fam: 25, car: 75, sta: 25 }, raw: { eco: 1500 },
        pro: ["Quasi tutto lo stipendio resta"], con: ["Alloggio piccolo: famiglia dopo", "Contratto legato alla stagione", "Ruolo meno ampio"],
        m: { eco: { why: "se l'azienda copre l'affitto", rel: "S" }, sta: { why: "contratto legato all'alloggio, stagionale", rel: "D" }, fam: { why: "alloggio piccolo: famiglia dopo", rel: "S" } },
        impacts: [{ r: "cash0", v: -2000 }, { r: "cash_m", v: [900, 1300, 1500] }, { r: "hours_w", v: -45 }] },
      { id: "E3", name: "Resto a Roma e cerco qui", s: { fam: 100, car: 25, sta: 25 }, raw: { eco: 300 },
        pro: ["Famiglia unita", "Nessun trasloco"], con: ["Nessuna offerta concreta oggi"],
        m: { eco: { why: "dipende da quando trovo", rel: "S" } },
        impacts: [{ r: "cash_m", v: [-600, 0, 500] }, { r: "hours_w", v: -40 }] },
    ],
    assumptions: [
      { id: "x1", t: "Stipendio netto reale in Spagna", rel: "?" },
      { id: "x2", t: "L'azienda può offrire alloggio o contributo affitto?", rel: "?" },
      { id: "x3", t: "Costo asilo a Ibiza", rel: "?" },
    ],
  },
};

/** Demo della presentazione: stesso formato dell'app (valori reali, giudizi, importanza 1-5). */
export const demoProject: Decision = {
  id: "PJ", name: "Progetto personale", status: "aperta", imp: 1,
  model: {
    criteria: [
      { id: "pot", name: "Potenziale", w: 0, imp: 4, kind: "g" },
      { id: "ore", name: "Tempo richiesto", w: 0, imp: 3, kind: "num", unit: "ore/settimana", worst: 30, best: 5 },
      { id: "inv", name: "Investimento", w: 0, imp: 3, kind: "num", unit: "€", worst: 10000, best: 0 },
    ],
    constraints: [],
    options: [
      { id: "P1", name: "Full-time", s: { pot: 100 }, raw: { ore: 30, inv: 8000 }, impacts: [{ r: "cash0", v: -8000 }, { r: "cash_m", v: [-400, -200, 0] }, { r: "hours_w", v: -30 }] },
      { id: "P2", name: "Part-time", s: { pot: 50 }, raw: { ore: 10, inv: 3000 }, impacts: [{ r: "cash0", v: -3000 }, { r: "hours_w", v: -10 }] },
      { id: "P3", name: "In pausa", s: { pot: 0 }, raw: { ore: 0, inv: 0 } },
    ],
  },
};
export const landingResources: Resources = { cash0: 12000, cash_m: -200, hours_w: 55 };
export const landingRules: Rule[] = [
  { id: "l1", name: "Risparmi mai sotto", r: "cash_end", min: 3000 },
  { id: "l2", name: "Autonomia minima", r: "autonomia_mesi", min: 6 },
  { id: "l3", name: "Ore libere", r: "hours_w", min: 0 },
];
