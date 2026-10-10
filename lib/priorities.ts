/** Priorità generali del profilo (1-5) e collegamento ai criteri tramite parole chiave. */
export const PRI: Record<string, { l: string; d: string; kw: RegExp }> = {
  soldi: { l: "Soldi", d: "guadagnare, spendere meno, risparmiare", kw: /soldi|costo|cost|stipend|prezz|guadagn|rendiment|anticip|spes|risparm|reddit|€|euro|margine|economic/i },
  stabilita: { l: "Stabilità", d: "sicurezza, continuità, pochi rischi", kw: /stabil|sicurezz|rischi|affidabil|contratt|garanzi|continuit/i },
  crescita: { l: "Crescita", d: "carriera, competenze, opportunità", kw: /cresci|carrier|potenzial|competen|svilupp|formaz|opportunit|ruolo|titolo|utilit/i },
  indipendenza: { l: "Indipendenza", d: "autonomia, libertà, flessibilità", kw: /indipend|autonom|libert|flessib/i },
  benessere: { l: "Benessere", d: "famiglia, tempo libero, serenità, salute", kw: /famigl|tempo libero|stress|seren|salut|equilibr|comodit|viaggi|relazion|team|zona|benesser/i },
};
export const PRI_DEFAULT: Record<string, number> = { soldi: 3, stabilita: 3, crescita: 3, indipendenza: 3, benessere: 3 };

/** Categoria di priorità per il nome di un criterio (la prima che corrisponde), o null. */
export function priOf(name: string): string | null {
  for (const [k, p] of Object.entries(PRI)) if (p.kw.test(name)) return k;
  return null;
}

/** Importanza iniziale per un nuovo criterio: la priorità generale corrispondente, altrimenti fallback. */
export function impFor(name: string, pr: Record<string, number> | undefined, fallback = 3): number {
  const k = priOf(name);
  return k && pr?.[k] != null ? Math.max(1, Math.min(5, pr[k])) : fallback;
}

/** Scarto tra importanza del criterio e priorità generale (≥2 punti = da segnalare). */
export function priGap(name: string, imp: number | undefined, pr: Record<string, number> | undefined) {
  const k = priOf(name);
  if (!k || imp == null || pr?.[k] == null) return null;
  const g = imp - pr[k];
  return Math.abs(g) >= 2 ? { k, label: PRI[k].l, pri: pr[k], imp, g } : null;
}
