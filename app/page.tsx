import Link from "next/link";
import {
  LayoutDashboard, GitFork, Link2, TrendingUp, Bot, History, Split, Scale, FileSearch, Network, Target,
  ShieldAlert, Calculator, ListChecks, Lock, Download, EyeOff, ArrowRight, LogIn, Ban, Copy, Activity, Microscope,
} from "lucide-react";
import { NetworkArt } from "@/components/charts";
import LandingDemo from "@/components/LandingDemo";
import { BP } from "@/lib/bp";

const DOMANDE = [
  ["Quali alternative ho realmente?", "Anche quelle che non stai considerando: lo status quo, una via di mezzo, un rinvio con scadenza.", <Split key="1" size={20} />],
  ["Cosa guadagno, cosa perdo, cosa rischio?", "Criteri pesati secondo le tue priorità di oggi, con vincoli che nessun punteggio può aggirare.", <Scale key="2" size={20} />],
  ["Su quali fatti sto ragionando?", "Ogni dato è marcato: verificato, dichiarato, stimato o mancante. Con fonte e data.", <FileSearch key="3" size={20} />],
  ["Come cambia il resto della mia vita?", "Soldi, tempo, casa e progetti sono risorse condivise: una scelta le sposta per tutte le altre.", <Network key="4" size={20} />],
  ["Cosa mi farebbe cambiare idea?", "Le soglie precise che ribaltano la scelta: lo stipendio minimo, l'affitto massimo, una garanzia.", <Target key="5" size={20} />],
] as const;

const AMBIENTI = [
  ["Panoramica", "La tua situazione", "Decisioni aperte, vincoli, scadenze, risorse.", <LayoutDashboard key="a" size={22} />],
  ["Decisioni", "Confronta le opzioni", "Alternative, criteri, pesi, dati e ipotesi.", <GitFork key="b" size={22} />],
  ["Connessioni", "Effetti tra le scelte", "Conflitti, requisiti e costi condivisi.", <Link2 key="c" size={22} />],
  ["Scenari", "Simula il futuro", "Da 3 mesi a 5 anni: favorevole, centrale, sfavorevole.", <TrendingUp key="d" size={22} />],
  ["Analista AI", "Analisi critica", "Struttura, contraddittorio, punto di svolta.", <Bot key="e" size={22} />],
  ["Registro", "Risultati nel tempo", "Analisi congelate, scelte prese, verifiche.", <History key="f" size={22} />],
] as const;

const STEPS = [
  ["Racconti", "Descrivi la situazione con parole tue, come la diresti a un amico."],
  ["Struttura", "L'AI propone alternative, obiettivi, limiti e chiede solo i dati indispensabili."],
  ["Calcolo", "Pesi, vincoli, sensibilità e scenari: matematica deterministica, ripetibile."],
  ["Conseguenze", "Impatto su soldi, tempo e sulle altre decisioni aperte."],
  ["Report", "Conclusione motivata, condizioni da verificare, prossimo passo."],
];

const REGOLE = [
  ["Vincoli non negoziabili", "Un'opzione che viola una condizione obbligatoria non diventa consigliabile per un punteggio alto.", <Ban key="1" size={20} />],
  ["Criteri non duplicati", "Reddito, risparmio e sicurezza economica spesso misurano la stessa cosa. Il sistema lo segnala.", <Copy key="2" size={20} />],
  ["Sensibilità sempre visibile", "Se basta spostare di poco un peso per cambiare classifica, lo vedi subito.", <Activity key="3" size={20} />],
  ["Tutto ricostruibile", "Ogni punteggio si apre: valore, peso, contributo, motivazione. Nessun numero inventato dall'AI.", <Microscope key="4" size={20} />],
] as const;

export default function Landing() {
  return (
    <div className="lp">
      <nav className="lnav">
        <div className="wrap">
          <Link href="/" className="logo"><img src={`${BP}/brand/mark.png`} alt="" /> Decision <b>OS</b></Link>
          <div className="links"><a href="#come">Come funziona</a><a href="#demo">Demo</a><a href="#metodo">Metodo</a><a href="#privacy">Privacy</a></div>
          <Link href="/login" className="btn pri"><LogIn size={16} /> Accedi</Link>
        </div>
      </nav>

      <header className="wrap hero">
        <div>
          <span className="eyebrow">Il tuo spazio decisionale personale</span>
          <h1>Decidi guardando tutto il quadro, non un voto a caso.</h1>
          <p className="lead">Decision OS mette a confronto le alternative, separa i fatti dalle supposizioni e mostra come ogni scelta cambia le altre: soldi, tempo, casa, progetti.</p>
          <div className="row" style={{ marginTop: 22 }}>
            <Link href="/login" className="btn pri" style={{ padding: ".8em 1.3em" }}>Entra nella piattaforma <ArrowRight size={16} /></Link>
            <a href="#demo" className="btn" style={{ padding: ".8em 1.3em" }}>Prova la demo</a>
          </div>
          <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>Non ti dice «scegli A». Ti dice perché A prevale, a quali condizioni e cosa la farebbe cadere.</p>
        </div>
        <div><NetworkArt /></div>
      </header>

      <section className="sec alt">
        <div className="wrap">
          <div className="head"><h2>Cinque domande, ogni volta</h2><p>Ogni analisi deve rispondere a queste. Se una resta senza risposta, il sistema te lo dice.</p></div>
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {DOMANDE.map(([t, d, ic], i) => (
              <div key={t} className="card">
                <div className="row between"><span className="iconwrap t">{ic}</span><span className="q"><span className="n">{i + 1}</span></span></div>
                <h3 style={{ margin: "12px 0 4px" }}>{t}</h3><p className="muted" style={{ margin: 0, fontSize: 14 }}>{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="come">
        <div className="wrap">
          <div className="head"><h2>Sei ambienti, un solo motore</h2><p>Ogni decisione è collegata alle altre attraverso un registro centrale delle risorse. Niente problemi trattati come isole.</p></div>
          <div className="grid g3">
            {AMBIENTI.map(([t, s, d, ic]) => (
              <div key={t} className="card row" style={{ alignItems: "flex-start", flexWrap: "nowrap", gap: 14 }}>
                <span className="iconwrap n">{ic}</span>
                <div><h3 style={{ margin: 0 }}>{t}</h3><div style={{ color: "var(--teal-d)", fontWeight: 600, fontSize: 13 }}>{s}</div><p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>{d}</p></div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40 }}>
            <h3>Dal racconto al piano d&apos;azione</h3>
            <div className="steps" style={{ marginTop: 12 }}>
              {STEPS.map(([t, d]) => <div key={t} className="card"><h3 style={{ marginBottom: 4 }}>{t}</h3><p className="muted" style={{ margin: 0, fontSize: 14 }}>{d}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="sec alt" id="demo">
        <div className="wrap">
          <div className="head">
            <h2>Demo: lavorare a Ibiza o restare in Italia?</h2>
            <p>Tre alternative di lavoro, una seconda decisione collegata (un progetto imprenditoriale), risorse condivise e vincoli. Cambia i pesi e guarda cosa succede.</p>
          </div>
          <LandingDemo />
        </div>
      </section>

      <section className="sec" id="metodo">
        <div className="wrap">
          <div className="grid g2" style={{ alignItems: "center" }}>
            <div>
              <h2>Un punteggio onesto</h2>
              <p className="muted">Valutazione multicriterio ponderata, l&apos;approccio usato nelle analisi di opzioni pubbliche e organizzative. Ogni alternativa riceve un valore da 0 a 100 per criterio, su scale dichiarate.</p>
              <div className="formula">S(A) = Σ w<sub>i</sub> · s<sub>i</sub>(A) / 100</div>
              <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>w<sub>i</sub> è il peso del criterio, s<sub>i</sub>(A) il valore dell&apos;alternativa. Il risultato misura quanto un&apos;opzione aderisce alle tue preferenze, <strong>non la probabilità che sia giusta</strong>. Per questo non vedrai mai un «92% di sicurezza».</p>
            </div>
            <div className="grid" style={{ gap: 12 }}>
              {REGOLE.map(([t, d, ic]) => (
                <div key={t} className="card row" style={{ flexWrap: "nowrap", alignItems: "flex-start", gap: 14, padding: 14 }}>
                  <span className="iconwrap o">{ic}</span>
                  <div><h3 style={{ margin: 0 }}>{t}</h3><p className="muted" style={{ margin: 0, fontSize: 14 }}>{d}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="sec dark">
        <div className="wrap">
          <div className="head"><h2>Un analista che non ti dà ragione</h2><p>L&apos;AI interpreta e critica. I numeri li calcola il motore, separato dal modello linguistico.</p></div>
          <div className="grid g4">
            {[
              ["Analisi dei dati", "Separa fatti, dichiarazioni, stime e dati mancanti. Trova contraddizioni.", <ListChecks key="1" />],
              ["Contraddittorio", "Il miglior argomento contro l'opzione che preferisci.", <ShieldAlert key="2" />],
              ["Punto di svolta", "Le soglie concrete che ribaltano la scelta.", <Calculator key="3" />],
              ["Retrospettiva", "Errore di ragionamento, dato sbagliato o evento imprevedibile?", <History key="4" />],
            ].map(([t, d, ic]) => (
              <div key={t as string} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 18 }}>
                <span className="iconwrap" style={{ background: "rgba(228,155,47,.16)", color: "#f0b65c" }}>{ic}</span>
                <h3 style={{ marginTop: 12 }}>{t}</h3><p style={{ margin: 0, fontSize: 14 }}>{d}</p>
              </div>
            ))}
          </div>
          <blockquote style={{ margin: "30px 0 0", padding: "18px 22px", borderLeft: "3px solid var(--orange)", background: "rgba(255,255,255,.05)", borderRadius: "0 14px 14px 0", fontSize: 16, color: "#e4eef6" }}>
            «Secondo i criteri attuali Ibiza offre più prospettive professionali, ma la sostenibilità economica non è verificata. Prima di impegnarti accerta il costo annuo dell&apos;alloggio e la durata del contratto. La preferenza cade se il margine mensile scende sotto la soglia che hai fissato.»
          </blockquote>
        </div>
      </section>

      <section className="sec" id="privacy">
        <div className="wrap">
          <div className="head"><h2>I tuoi dati restano tuoi</h2><p>Informazioni personali, economiche e lavorative: protezione fin dalla progettazione.</p></div>
          <div className="grid g4">
            {[
              ["Privati per default", "Accesso con autenticazione, ogni riga visibile solo a te.", <Lock key="1" />],
              ["Controllo sull'AI", "Scegli tu cosa inviare al modello: le cifre economiche restano fuori finché non le abiliti.", <EyeOff key="2" />],
              ["Esporta e cancella", "Scarichi tutto in un file, cancelli tutto con un clic.", <Download key="3" />],
              ["Nessun collegamento automatico", "Niente accesso a conti, email o calendari.", <Ban key="4" />],
            ].map(([t, d, ic]) => (
              <div key={t as string} className="card"><span className="iconwrap t">{ic}</span><h3 style={{ marginTop: 12 }}>{t}</h3><p className="muted" style={{ margin: 0, fontSize: 14 }}>{d}</p></div>
            ))}
          </div>
          <div className="card row between" style={{ marginTop: 40, padding: 26, background: "var(--navy)", border: 0 }}>
            <div><h2 style={{ color: "#fff", margin: 0 }}>Pronto a mettere alla prova la prossima scelta?</h2><p style={{ color: "#a9c3d8", margin: "6px 0 0" }}>Entra, descrivi la situazione, ottieni la scheda strutturata.</p></div>
            <Link href="/login" className="btn" style={{ padding: ".85em 1.4em" }}><LogIn size={16} /> Accedi a Decision OS</Link>
          </div>
        </div>
      </section>

      <footer className="lf">
        <div className="wrap row between">
          <span className="row" style={{ gap: 10 }}><img src={`${BP}/brand/icon-512.png`} alt="" width={30} height={30} style={{ borderRadius: 8 }} /> Decision OS · V1</span>
          <span>Un progetto di <a href="https://danilorusciano.it">Danilo Rusciano</a></span>
        </div>
      </footer>
    </div>
  );
}
