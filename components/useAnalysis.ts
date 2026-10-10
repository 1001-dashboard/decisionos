"use client";
import { useMemo } from "react";
import { analyzeDecision, combos } from "@/lib/engine";
import { buildReport } from "@/lib/report";
import { useWs, type Dec } from "./Workspace";

/** Analisi condivisa: decisioni aperte (max 3 per le combinazioni, per importanza). */
export function useAnalysis(selected?: string[]) {
  const { decisions, deps, profile } = useWs();
  return useMemo(() => {
    const open = decisions.filter((d) => d.status === "aperta");
    const pool: Dec[] = selected?.length
      ? open.filter((d) => selected.includes(d.id))
      : [...open].sort((a, b) => b.imp - a.imp).slice(0, 3);
    const valid = pool.filter((d) => d.model.options.length && d.model.criteria.length);
    const res = valid.map(analyzeDecision);
    const all = new Map(open.map((d) => [d.id, analyzeDecision(d)]));
    const cmb = valid.length ? combos(valid, res, deps, profile.resources, profile.rules, profile.horizon) : [];
    const rep = valid.length ? buildReport(valid, res, cmb, profile.rules, profile.horizon) : [];
    return { open, pool: valid, res, all, cmb, rep };
  }, [decisions, deps, profile, selected]);
}
