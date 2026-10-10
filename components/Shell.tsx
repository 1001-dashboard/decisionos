"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, GitFork, Link2, TrendingUp, Bot, History, Settings, LogOut, X } from "lucide-react";
import { useWs } from "./Workspace";
import { sb } from "@/lib/supabase/client";
import { BP } from "@/lib/bp";

export const NAV = [
  { h: "/app", l: "Panoramica", s: "La tua situazione", i: LayoutDashboard },
  { h: "/app/decisioni", l: "Decisioni", s: "Confronta le opzioni", i: GitFork },
  { h: "/app/connessioni", l: "Connessioni", s: "Effetti tra le scelte", i: Link2 },
  { h: "/app/scenari", l: "Scenari", s: "Simula il futuro", i: TrendingUp },
  { h: "/app/analista", l: "Analista AI", s: "Analisi critica", i: Bot },
  { h: "/app/registro", l: "Registro", s: "Risultati nel tempo", i: History },
  { h: "/app/impostazioni", l: "Impostazioni", s: "Profilo e risorse", i: Settings },
];

export default function Shell({ children }: { children: React.ReactNode }) {
  const p = usePathname();
  const r = useRouter();
  const { ready, err, setErr, email } = useWs();
  const on = (h: string) => (h === "/app" ? p === "/app" : p.startsWith(h));
  const out = async () => { await sb().auth.signOut(); r.replace("/login"); r.refresh(); };
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/app" className="brand"><img src={`${BP}/brand/icon-512.png`} alt="" /> Decision OS</Link>
        {NAV.map(({ h, l, s, i: I }) => (
          <Link key={h} href={h} className={`nav ${on(h) ? "on" : ""}`}><I size={18} /><span>{l}<small>{s}</small></span></Link>
        ))}
        <div style={{ marginTop: "auto", fontSize: 12, padding: "0 12px", color: "#8fb0c9", wordBreak: "break-all" }}>{email}</div>
        <button className="nav btn ghost" style={{ color: "#cfe0ee", justifyContent: "flex-start" }} onClick={out}><LogOut size={16} /> Esci</button>
      </aside>
      <div>
        <div className="mtop"><span><img src={`${BP}/brand/icon-512.png`} alt="" />Decision OS</span><button className="iconbtn" style={{ color: "#fff" }} onClick={out} aria-label="Esci"><LogOut size={18} /></button></div>
        <main className="main">
          {err && <div className="note bad row between" style={{ marginBottom: 16 }}><span>{err}</span><button className="iconbtn" onClick={() => setErr(null)}><X size={16} /></button></div>}
          {ready ? children : <div className="empty">Caricamento…</div>}
        </main>
      </div>
      <nav className="bottomnav">
        {NAV.map(({ h, l, i: I }) => <Link key={h} href={h} className={on(h) ? "on" : ""}><I size={20} />{l.replace("Analista AI", "Analista").replace("Impostazioni", "Profilo")}</Link>)}
      </nav>
    </div>
  );
}

export function Top({ t, s, children }: { t: string; s?: string; children?: React.ReactNode }) {
  return (
    <div className="top">
      <div><h1>{t}</h1>{s ? <p className="muted" style={{ margin: "4px 0 0" }}>{s}</p> : null}</div>
      {children ? <div className="row">{children}</div> : null}
    </div>
  );
}
