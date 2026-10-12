"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { sb } from "@/lib/supabase/client";
import type { Decision, Dep, Resources, Rule, Pred, Act } from "@/lib/engine";
import type { CtxItem } from "@/lib/context";
import { PRI_DEFAULT } from "@/lib/priorities";

export type Profile = {
  resources: Resources;
  /** l/u: nome e unità delle risorse definite da te (chiave «x_…»): persone, budget, capacità, ferie… */
  resources_meta: Record<string, { dt?: string; src?: string; l?: string; u?: string }>;
  rules: Rule[];
  priorities: Record<string, number>;
  context: Record<string, string>;
  ai_share: { economia: boolean; contesto: boolean };
  horizon: number;
};
export type Snapshot = { id: string; label: string; input: SnapInput; result: unknown; created_at: string };
/** context: il contesto personale che Decision OS conosceva e usava in quel momento (versione e soli elementi usati) */
export type SnapInput = { decisions: Decision[]; deps: Dep[]; resources: Resources; rules: Rule[]; horizon: number; context?: { version: string; items: { k: string; t: string; n?: number; u?: string; via: string; priv?: boolean }[] } };
export type Outcome = {
  id: string; decision_id: string | null; decision_name: string; chosen: string; chosen_id?: string | null; decided_at: string;
  expected?: string | null; review_at?: string | null; observed?: string | null; cause?: string | null; snapshot_id?: string | null;
  pred?: Pred | null; act?: Act | null;   // previsione al momento della scelta e consuntivo
};
export type Dec = Decision & { updated_at?: string; created_at?: string };

const DEF_PROFILE: Profile = {
  resources: { cash0: 0, cash_m: 0, hours_w: 0 },
  resources_meta: {},
  rules: [
    { id: "r1", name: "Liquidità mai negativa", r: "cash_end", min: 0 },
    { id: "r2", name: "Autonomia minima", r: "autonomia_mesi", min: 6 },
    { id: "r3", name: "Ore libere non negative", r: "hours_w", min: 0 },
  ],
  priorities: { ...PRI_DEFAULT },
  context: {},
  ai_share: { economia: false, contesto: false },
  horizon: 24,
};

type Ctx = {
  ready: boolean; err: string | null; email: string;
  profile: Profile; decisions: Dec[]; deps: Dep[]; snapshots: Snapshot[]; outcomes: Outcome[];
  saveProfile: (p: Partial<Profile>) => Promise<void>;
  createDecision: (d: Partial<Decision>) => Promise<string | null>;
  saveDecision: (d: Decision) => Promise<void>;
  deleteDecision: (id: string) => Promise<void>;
  saveDep: (d: Dep, source?: "utente" | "ai") => Promise<void>;
  deleteDep: (id: string) => Promise<void>;
  createSnapshot: (label: string, input: SnapInput, result: unknown) => Promise<void>;
  deleteSnapshot: (id: string) => Promise<void>;
  saveOutcome: (o: Partial<Outcome>) => Promise<void>;
  /** contesto personale: elementi confermati da te, usati in tutte le decisioni */
  vault: CtxItem[];
  saveVault: (items: CtxItem[]) => Promise<boolean>;
  deleteOutcome: (id: string) => Promise<void>;
  wipe: () => Promise<void>;
  setErr: (e: string | null) => void;
};
const C = createContext<Ctx | null>(null);
export const useWs = () => useContext(C)!;

const isUuid = (s: string) => /^[0-9a-f-]{36}$/.test(s);

export default function Workspace({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<Profile>(DEF_PROFILE);
  const [decisions, setDecisions] = useState<Dec[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [vault, setVault] = useState<CtxItem[]>([]);

  const chk = useCallback(<T,>(r: { error: { message: string } | null; data?: T }) => {
    if (r.error) { setErr(r.error.message); throw new Error(r.error.message); }
    return r.data as T;
  }, []);

  useEffect(() => {
    (async () => {
      const s = sb();
      const { data: { user } } = await s.auth.getUser();
      if (!user) { setErr("Sessione scaduta"); return; }
      setUid(user.id); setEmail(user.email ?? "");
      const [p, d, dp, sn, oc] = await Promise.all([
        s.from("profiles").select("*").eq("id", user.id).maybeSingle(),
        s.from("decisions").select("*").order("updated_at", { ascending: false }),
        s.from("dependencies").select("*").order("created_at"),
        s.from("snapshots").select("*").order("created_at", { ascending: false }).limit(100),
        s.from("outcomes").select("*").order("decided_at", { ascending: false }),
      ]);
      const e = [p, d, dp, sn, oc].find((x) => x.error);
      if (e?.error) { setErr(`${e.error.message}. Hai eseguito supabase/schema.sql?`); setReady(true); return; }
      // il contesto ha una colonna sua: resta fuori dal profilo, così il profilo si salva anche se la colonna non esiste ancora
      if (p.data) { const { vault: vt, ...pd } = p.data as Profile & { vault?: CtxItem[] }; setVault(Array.isArray(vt) ? vt : []); setProfile({ ...DEF_PROFILE, ...pd, priorities: { ...PRI_DEFAULT, ...(pd.priorities ?? {}) } }); }
      else await s.from("profiles").insert({ id: user.id, ...DEF_PROFILE });
      setDecisions((d.data ?? []).map((x: Dec) => ({ ...x, model: { ...({ criteria: [], constraints: [], options: [], assumptions: [] } as Dec["model"]), ...(x.model as Partial<Dec["model"]>) } })));
      setDeps((dp.data ?? []).map((x: { id: string; rule: Dep; confirmed: boolean }) => ({ ...x.rule, id: x.id, confirmed: x.confirmed })));
      setSnapshots(sn.data ?? []);
      setOutcomes(oc.data ?? []);
      setReady(true);
    })().catch((e) => { setErr(String(e)); setReady(true); });
  }, []);

  const v = useMemo<Ctx>(() => ({
    ready, err, email, profile, decisions, deps, snapshots, outcomes, vault, setErr,
    async saveProfile(pt) {
      const n = { ...profile, ...pt };
      setProfile(n);
      chk(await sb().from("profiles").upsert({ id: uid, ...n, updated_at: new Date().toISOString() }));
    },
    async createDecision(d) {
      const row = { name: d.name ?? "Nuova decisione", descr: d.descr ?? "", status: "aperta", imp: d.imp ?? 1,
        model: d.model ?? { criteria: [], constraints: [], options: [], assumptions: [] } };
      const r = await sb().from("decisions").insert(row).select().single();
      if (r.error) { setErr(r.error.message); return null; }
      setDecisions((x) => [r.data as Dec, ...x]);
      return r.data.id as string;
    },
    async saveDecision(d) {
      const up = { name: d.name, descr: d.descr ?? "", status: d.status, imp: d.imp, due: d.due || null, model: d.model, updated_at: new Date().toISOString() };
      setDecisions((x) => x.map((y) => (y.id === d.id ? { ...y, ...up } : y)));
      chk(await sb().from("decisions").update(up).eq("id", d.id));
    },
    async deleteDecision(id) {
      setDecisions((x) => x.filter((y) => y.id !== id));
      chk(await sb().from("decisions").delete().eq("id", id));
    },
    async saveDep(d, source = "utente") {
      const { id, confirmed, ...rule } = d;
      if (id && isUuid(id)) {
        setDeps((x) => x.map((y) => (y.id === id ? d : y)));
        chk(await sb().from("dependencies").update({ rule, confirmed }).eq("id", id));
      } else {
        const r = await sb().from("dependencies").insert({ rule, confirmed, source }).select().single();
        if (r.error) { setErr(r.error.message); return; }
        setDeps((x) => [...x, { ...d, id: r.data.id }]);
      }
    },
    async deleteDep(id) {
      setDeps((x) => x.filter((y) => y.id !== id));
      chk(await sb().from("dependencies").delete().eq("id", id));
    },
    async createSnapshot(label, input, result) {
      const r = await sb().from("snapshots").insert({ label, input, result }).select().single();
      if (r.error) { setErr(r.error.message); return; }
      setSnapshots((x) => [r.data as Snapshot, ...x]);
    },
    async deleteSnapshot(id) {
      setSnapshots((x) => x.filter((y) => y.id !== id));
      chk(await sb().from("snapshots").delete().eq("id", id));
    },
    async saveOutcome(o) {
      if (o.id) {
        const { id, ...rest } = o;
        setOutcomes((x) => x.map((y) => (y.id === id ? { ...y, ...rest } : y)));
        chk(await sb().from("outcomes").update(rest).eq("id", id));
      } else {
        let r = await sb().from("outcomes").insert(o).select().single();
        // database non ancora aggiornato (manca chosen_id): salva comunque, l'id resta nello stato della strada e nell'analisi congelata
        // database non ancora aggiornato: salva comunque la decisione, senza i campi nuovi
        if (r.error && /chosen_id|pred|act/.test(r.error.message)) {
          const { chosen_id: _x, pred: _p, act: _a, ...rest } = o as Outcome;
          r = await sb().from("outcomes").insert(rest).select().single();
          if (!r.error) setErr("Decisione registrata, ma senza la previsione: esegui supabase/migrate_v2_9.sql in Supabase per attivare il confronto previsto/accaduto.");
        }
        if (r.error) { setErr(r.error.message); return; }
        setOutcomes((x) => [r.data as Outcome, ...x]);
      }
    },
    async saveVault(items) {
      setVault(items);
      const r = await sb().from("profiles").update({ vault: items }).eq("id", uid);
      if (r.error) { setErr(/vault/.test(r.error.message) ? "Per salvare il contesto esegui supabase/migrate_v2_12.sql in Supabase (una volta)." : r.error.message); return false; }
      return true;
    },
    async deleteOutcome(id) {
      setOutcomes((x) => x.filter((y) => y.id !== id));
      chk(await sb().from("outcomes").delete().eq("id", id));
    },
    async wipe() {
      const s = sb();
      for (const t of ["outcomes", "snapshots", "dependencies", "decisions", "ai_usage"]) chk(await s.from(t).delete().eq("user_id", uid));
      chk(await s.from("profiles").delete().eq("id", uid));
      setDecisions([]); setDeps([]); setSnapshots([]); setOutcomes([]); setProfile(DEF_PROFILE); setVault([]);
    },
  }), [ready, err, email, profile, decisions, deps, snapshots, outcomes, vault, uid, chk]);

  return <C.Provider value={v}>{children}</C.Provider>;
}
