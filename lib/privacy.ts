import { redactMoney } from "./engine.ts";

/* Seconda barriera lato server: vale anche se la pagina è stata manomessa.
 * 1. Per ogni modalità passano solo i campi che l'app invia davvero (allowlist); tutto il resto si scarta.
 * 2. Senza consenso alle cifre (eco !== true):
 *    - i testi vengono ripuliti dagli importi (anche in lettere);
 *    - impatti, conti e risorse (im, mi, base) spariscono;
 *    - un numero sopravvive solo dove l'app manda punteggi, pesi, priorità o mesi (scale 0-100) e solo entro quella scala:
 *      qualunque altro numero, o un numero fuori scala, diventa null. Così un importo non può uscire travestito da campo numerico. */

const COMPACT = ["n", "t", "privacy", "c", "v", "o", "i", "k", "no", "hz", "r", "sens", "ctx", "cx", "base"];
const ALLOW: Record<string, string[]> = {
  struttura: ["t", "pr", "r", "ctx", "cx"],
  contesto: ["t"],
  strade: COMPACT, dati: COMPACT, contro: COMPACT, svolta: COMPACT,
  conti: ["t", "a", "i", "o", "r", "privacy"],
  premessa: ["t", "k", "o", "oggi", "no", "i", "x", "r", "privacy"],
  retro: ["n", "scelta", "previsto", "accaduto"],
  link: ["ds", "ctx"],
};
/** Dove l'app manda numeri che non sono soldi: pesi e punteggi (c, o, r), mesi degli orizzonti (hz), priorità 1-5 (pr). */
const NUM_OK: Record<string, string[]> = { struttura: ["pr"], strade: ["c", "o", "r", "hz"], dati: ["c", "o", "r", "hz"], contro: ["c", "o", "r", "hz"], svolta: ["c", "o", "r", "hz"] };
const NUM_MAX = 100;
const DROP = new Set(["im", "mi", "base"]);
/** campi di contesto personale: profilo (ctx), elementi del Contesto (cx), priorità generali (pr) */
const CTX_KEYS = new Set(["ctx", "cx", "pr"]);

function scrubIn(x: unknown, numOk: boolean): unknown {
  if (typeof x === "string") return redactMoney(x);
  if (typeof x === "number") return numOk && Number.isFinite(x) && Math.abs(x) <= NUM_MAX ? x : null;
  if (Array.isArray(x)) return x.map((v) => scrubIn(v, numOk));
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, scrubIn(v, numOk)]));
  return typeof x === "boolean" || x == null ? x : null;
}

/** Pulizia senza schema (compatibilità): testi ripuliti, impatti tolti, nessun numero fuori dalle scale. */
export const scrub = (x: unknown) => scrubIn(x, false);

/** Payload pulito per la modalità richiesta. eco vale solo se la richiesta corrente lo dice esplicitamente. */
export function cleanPayload(mode: string, payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const p = payload as Record<string, unknown>;
  const eco = p.eco === true;
  // contesto personale e priorità escono solo se questa richiesta lo dice esplicitamente (cxok), come per le cifre
  const cxok = p.cxok === true;
  const allow = ALLOW[mode];
  const kept = Object.fromEntries(Object.entries(p).filter(([k]) => k !== "eco" && k !== "cxok" && (!allow || allow.includes(k)) && (cxok || !CTX_KEYS.has(k))));
  if (eco) return kept;
  const ok = new Set(NUM_OK[mode] ?? []);
  return Object.fromEntries(Object.entries(kept).filter(([k]) => !DROP.has(k)).map(([k, v]) => [k, scrubIn(v, ok.has(k))]));
}
