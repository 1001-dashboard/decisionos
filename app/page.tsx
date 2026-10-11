import Link from "next/link";
import {
  LayoutDashboard, GitFork, Link2, TrendingUp, Bot, History, Split, Scale, FileSearch, Network, Target,
  ShieldAlert, Calculator, ListChecks, Lock, Download, EyeOff, ArrowRight, LogIn, Ban, Copy, Activity, Microscope,
} from "lucide-react";
import { NetworkArt } from "@/components/charts";
import LandingDemo from "@/components/LandingDemo";
import { BP } from "@/lib/bp";
import { TEMPLATES } from "@/lib/templates";
import { Briefcase, Home, Car, Rocket, Package, Users, GraduationCap, PiggyBank } from "lucide-react";

const TI: Record<string, React.ReactNode> = { briefcase: <Briefcase size={22} />, home: <Home size={22} />, car: <Car size={22} />, rocket: <Rocket size={22} />, package: <Package size={22} />, users: <Users size={22} />, graduation: <GraduationCap size={22} />, piggy: <PiggyBank size={22} /> };

const DOMANDE = [
  ["Quali alternative ho realmente?", "Anche quelle che non stai considerando: lo status quo, una via di mezzo, un rinvio con scadenza.", <Split key="1" size={20} />],
  ["Cosa guadagno, cosa perdo, cosa rischio?", "Criteri pesati secondo le tue priorità di oggi, con vincoli che nessun punteggio può aggirare.", <Scale key="2" size={20} />],
  ["Su quali fatti sto ragionando?", "Per ogni valore indichi se è certo, se te l'hanno detto o se è una stima. Il sistema ti dice quanto del risultato poggia sulle stime.", <FileSearch key="3" size={20} />],
  ["Come cambia il resto della mia vita?", "Soldi, tempo, casa e progetti sono risorse condivise: una scelta le sposta per tutte le altre.", <Network key="4" size={20} />],
  ["Cosa mi farebbe cambiare idea?", "Le soglie precise che ribaltano la scelta: lo stipendio minimo, l'affitto massimo, una garanzia.", <Target key="5" size={20} />],
] as const;

const AMBIENTI = [
  ["Panoramica", "La tua situazione", "Decisioni aperte, vincoli, scadenze, risorse.", <LayoutDashboard key="a" size={22} />],
  ["Decisioni", "Confronta le opzioni", "Una procedura guidata in 6 passi: strade, conseguenze, condizioni, poi il confronto.", <GitFork key="b" size={22} />],
  ["Connessioni", "Effetti tra le scelte", "Conflitti, requisiti e costi condivisi.", <Link2 key="c" size={22} />],
  ["Scenari", "Simula il futuro", "Da 3 mesi a 5 anni, tre scenari. Proiezioni, non previsioni.", <TrendingUp key="d" size={22} />],
  ["Analista AI", "Analisi critica", "Dal racconto al quadro: domande, pro e contro, criteri spiegati. Poi il parere contrario.", <Bot key="e" size={22} />],
  ["Registro", "Risultati nel tempo", "Analisi congelate, scelte prese, verifiche.", <History key="f" size={22} />],
] as const;

const STEPS = [
  ["Strade", "Non solo sì o no: anche «solo a condizioni», una prova con uscita, cercare altro. Se vedi un falso dilemma, Decision OS te lo dice."],
  ["Conseguenze", "Cosa succede entro 30 giorni, 3, 6 e 12 mesi su casa, famiglia, lavoro e soldi. Cosa deve essere vero perché la strada abbia senso."],
  ["Cosa conta", "Gli aspetti che ti interessano, quanto contano da 1 a 5 e i limiti che non accetti di superare."],
  ["Valuta", "Valori reali (€, ore, km) o giudizi da Pessimo a Ottimo, con la fonte di ogni dato."],
  ["Soldi e tempo", "Spese iniziali e differenze mensili: quanti mesi reggi e cosa succede se va male."],
  ["Decisione", "Pronta o non ancora pronta: a quali condizioni regge la strada in testa, cosa verificare prima e in che ordine, cosa cambia se una condizione cade."],
];

const REGOLE = [
  ["Vincoli non negoziabili", "Un'opzione che viola una condizione obbligatoria non diventa consigliabile per un punteggio alto.", <Ban key="1" size={20} />],
  ["Stime messe alla prova", "Il motore peggiora del 20% le tue stime e verifica se la prima scelta regge ancora.", <Activity key="2" size={20} />],
  ["Soglie di svolta", "Ti dice la cifra esatta oltre la quale cambieresti idea: lo stipendio minimo, il costo massimo.", <Calculator key="3" size={20} />],
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
            <h3>Ogni decisione in 6 passi</h3>
            <div className="steps" style={{ marginTop: 12 }}>
              {STEPS.map(([t, d]) => <div key={t} className="card"><h3 style={{ marginBottom: 4 }}>{t}</h3><p className="muted" style={{ margin: 0, fontSize: 14 }}>{d}</p></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="sec alt">
        <div className="wrap">
          <div className="head"><h2>Per ogni tipo di scelta</h2><p>Vita privata o lavoro: parti da un modello già impostato oppure racconta la situazione e l&apos;Analista prepara la scheda.</p></div>
          <div className="grid g4">
            {TEMPLATES.map((t) => (
              <div key={t.k} className="card row" style={{ flexWrap: "nowrap", gap: 12, padding: 14 }}>
                <span className="iconwrap t">{TI[t.icon]}</span>
                <div><h3 style={{ margin: 0, fontSize: "1rem" }}>{t.t}</h3><small>{t.d}</small></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="demo">
        <div className="wrap">
          <div className="head">
            <h2>Prova la demo: un&apos;offerta di lavoro all&apos;estero</h2>
            <p>È la parte di confronto del passo «Decisione», con dati dimostrativi: tre alternative di lavoro e un progetto personale che compete per tempo e soldi. Cambia l&apos;importanza dei criteri e guarda verdetto, soglie ed effetti ricalcolarsi. Lo stesso metodo vale per una casa, un fornitore, un investimento.</p>
          </div>
          <LandingDemo />
        </div>
      </section>

      <section className="sec alt" id="metodo">
        <div className="wrap">
          <div className="grid g2" style={{ alignItems: "center" }}>
            <div>
              <h2>Un punteggio onesto</h2>
              <p className="muted">Valutazione multicriterio ponderata, l&apos;approccio usato nelle analisi di opzioni pubbliche e organizzative. Inserisci valori reali o giudizi: il motore li porta su una scala comune, da ciò che per te è pessimo a ciò che è ottimo.</p>
              <div className="formula">S(A) = Σ w<sub>i</sub> · s<sub>i</sub>(A) / 100</div>
              <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>w<sub>i</sub> è il peso del criterio (deriva dall&apos;importanza 1-5 che gli dai), s<sub>i</sub>(A) il valore dell&apos;alternativa sulla tua scala. Il risultato misura quanto un&apos;opzione aderisce alle tue preferenze, <strong>non la probabilità che sia giusta</strong>. Per questo non vedrai mai un «92% di sicurezza».</p>
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
              ["Prepara il quadro", "Riconosce il tipo di scelta, ti fa le domande che servono, propone pro, contro e criteri spiegati.", <ListChecks key="1" />],
              ["Contraddittorio", "Il miglior argomento contro l'opzione che preferisci.", <ShieldAlert key="2" />],
              ["Punto di svolta", "Le soglie concrete che ribaltano la scelta.", <Calculator key="3" />],
              ["Testa o pancia?", "Ti avvisa quando il risultato sembra costruito per confermare quello che volevi già.", <History key="4" />],
            ].map(([t, d, ic]) => (
              <div key={t as string} style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 18 }}>
                <span className="iconwrap" style={{ background: "rgba(228,155,47,.16)", color: "#f0b65c" }}>{ic}</span>
                <h3 style={{ marginTop: 12 }}>{t}</h3><p style={{ margin: 0, fontSize: 14 }}>{d}</p>
              </div>
            ))}
          </div>
          <blockquote style={{ margin: "30px 0 0", padding: "18px 22px", borderLeft: "3px solid var(--orange)", background: "rgba(255,255,255,.05)", borderRadius: "0 14px 14px 0", fontSize: 16, color: "#e4eef6" }}>
            «Secondo i tuoi criteri l&apos;alternativa A offre più prospettive, ma la sostenibilità economica non è verificata. Prima di impegnarti accerta il costo reale e le condizioni del contratto. La preferenza per A cade se ciò che ti resta a fine mese scende sotto 600 €.»
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
          <span className="row" style={{ gap: 10 }}><img src={`${BP}/brand/icon-512.png`} alt="" width={30} height={30} style={{ borderRadius: 8 }} /> Decision OS</span>
          <span>Un progetto di <a href="https://danilorusciano.it">Danilo Rusciano</a></span>
        </div>
      </footer>
    </div>
  );
}
