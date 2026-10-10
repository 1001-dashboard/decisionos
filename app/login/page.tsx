"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogIn, Mail } from "lucide-react";
import { sb } from "@/lib/supabase/client";
import { BP } from "@/lib/bp";

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [mode, setMode] = useState<"pw" | "link" | "new">("pw");
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const cb = () => `${window.location.origin}${BP}/auth/callback`;

  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      const a = sb().auth;
      if (mode === "pw") {
        const { error } = await a.signInWithPassword({ email, password: pw });
        if (error) throw error;
        r.replace("/app"); r.refresh(); return;
      }
      if (mode === "link") {
        const { error } = await a.signInWithOtp({ email, options: { emailRedirectTo: cb(), shouldCreateUser: false } });
        if (error) throw error;
        setMsg({ t: "Controlla la posta: ti ho inviato il link di accesso.", ok: true });
      } else {
        const { error } = await a.signUp({ email, password: pw, options: { emailRedirectTo: cb() } });
        if (error) throw error;
        setMsg({ t: "Account creato. Conferma l'indirizzo dalla mail ricevuta.", ok: true });
      }
    } catch (err) {
      const m = (err as Error).message || "";
      setMsg({ t: /Invalid login/i.test(m) ? "Email o password non corrette." : /not allowed|disabled/i.test(m) ? "Registrazioni chiuse: piattaforma privata." : m });
    } finally { setBusy(false); }
  }

  return (
    <main className="login">
      <div className="card">
        <Link href="/" className="row muted" style={{ gap: 6, textDecoration: "none", fontSize: 13 }}><ArrowLeft size={14} /> Torna alla presentazione</Link>
        <div style={{ textAlign: "center", margin: "18px 0 22px" }}>
          <img src={`${BP}/brand/mark.png`} alt="" style={{ height: 64 }} />
          <h2 style={{ margin: "8px 0 2px" }}>Decision <span style={{ color: "var(--teal)" }}>OS</span></h2>
          <p className="muted" style={{ margin: 0 }}>{mode === "new" ? "Crea il tuo spazio decisionale" : "Accedi al tuo spazio decisionale"}</p>
        </div>
        <form onSubmit={go} className="stack">
          <div><label className="f" htmlFor="em">Email</label><input id="em" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          {mode !== "link" && <div><label className="f" htmlFor="pw">Password</label><input id="pw" type="password" required minLength={8} autoComplete={mode === "new" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} /></div>}
          <button className="btn pri" style={{ width: "100%", justifyContent: "center", padding: ".8em" }} disabled={busy}>
            {mode === "link" ? <><Mail size={16} /> Inviami il link</> : mode === "new" ? "Crea account" : <><LogIn size={16} /> Accedi</>}
          </button>
          {msg && <div className={`note ${msg.ok ? "" : "bad"}`}>{msg.t}</div>}
        </form>
        <div className="row between" style={{ marginTop: 16, fontSize: 13 }}>
          <button className="btn ghost sm" onClick={() => setMode(mode === "link" ? "pw" : "link")}>{mode === "link" ? "Usa la password" : "Accedi con link via email"}</button>
          <button className="btn ghost sm" onClick={() => setMode(mode === "new" ? "pw" : "new")}>{mode === "new" ? "Ho già un account" : "Crea account"}</button>
        </div>
      </div>
    </main>
  );
}
