import type { Row } from "@/lib/engine";
import { fmt } from "@/lib/engine";

export const PAL = ["#15406a", "#13879a", "#e49b2f", "#7fa8c9", "#5fbccb", "#c27a1a", "#33597d", "#a9cbe3"];

/** Barre impilate: ogni segmento = contributo di un criterio (peso × valore). */
export function ScoreBars({ rows, reasons = true, provisional = false }: { rows: Row[]; reasons?: boolean; provisional?: boolean }) {
  const crit = rows[0]?.detail ?? [];
  return (
    <div className="stack">
      <div className="row" style={{ gap: 14, fontSize: 12 }}>
        {crit.map((c, i) => (
          <span key={c.crit} className="row" style={{ gap: 6 }}>
            <span className="dot" style={{ background: PAL[i % PAL.length] }} /> {c.name} <span className="muted">{c.w}%</span>
          </span>
        ))}
      </div>
      {rows.map((r) => (
        <div key={r.id} style={{ opacity: r.excluded.length ? 0.55 : 1 }}>
          <div className="row between" style={{ marginBottom: 4 }}>
            <strong>{r.name}</strong>
            <span className="row" style={{ gap: 8 }}>
              {r.excluded.length ? <span className="pill bad">esclusa</span> : null}
              {r.range ? <span className="pill warn">range {fmt(r.range[0])}–{fmt(r.range[1])}</span> : null}
              {provisional && r.range ? null : <span className="num" style={{ font: "600 18px var(--fh)", color: provisional ? "var(--muted)" : "var(--navy)" }}>{fmt(r.score)}</span>}
            </span>
          </div>
          <div style={{ display: "flex", height: 14, borderRadius: 99, overflow: "hidden", background: "var(--sky-l)" }}>
            {r.detail.map((d, i) =>
              d.contrib ? (
                <span key={d.crit} title={`${d.name}: ${d.s} × ${d.w}% = ${fmt(d.contrib)}`}
                  style={{ width: `${d.contrib}%`, background: PAL[i % PAL.length], borderRight: "2px solid #fff" }} />
              ) : null,
            )}
          </div>
          {reasons && r.excluded.length ? <div className="err" style={{ marginTop: 4 }}>{r.excluded.join(" · ")}</div> : null}
        </div>
      ))}
    </div>
  );
}

type Series = { name: string; color: string; data: number[]; dash?: boolean };

export function LineChart({ series, threshold, height = 240, xLabel = (i: number) => `${i}`, yFmt = fmt }: {
  series: Series[]; threshold?: { v: number; label: string }; height?: number; xLabel?: (i: number) => string; yFmt?: (n: number) => string;
}) {
  const W = 640, H = height, L = 64, R = 14, T = 14, B = 28;
  const all = series.flatMap((s) => s.data).concat(threshold ? [threshold.v] : [], [0]);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (lo === hi) hi = lo + 1;
  const raw = (hi - lo) / 4, mag = 10 ** Math.floor(Math.log10(raw));
  const stepY = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw)!;
  lo = Math.floor(lo / stepY) * stepY; hi = Math.ceil(hi / stepY) * stepY;
  const n = Math.max(...series.map((s) => s.data.length), 2);
  const x = (i: number) => L + (i * (W - L - R)) / (n - 1);
  const y = (val: number) => T + ((hi - val) * (H - T - B)) / (hi - lo);
  const ticks = Math.round((hi - lo) / stepY);
  const step = Math.max(1, Math.round((n - 1) / 6));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }} role="img">
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const val = lo + ((hi - lo) * i) / ticks;
        return (
          <g key={i}>
            <line x1={L} x2={W - R} y1={y(val)} y2={y(val)} stroke="#e1e8ef" />
            <text x={L - 8} y={y(val) + 4} textAnchor="end" fontSize="11" fill="#5b6d7e">{yFmt(Math.round(val))}</text>
          </g>
        );
      })}
      {lo < 0 && hi > 0 ? <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="#9fb3c4" /> : null}
      {threshold ? (
        <g>
          <line x1={L} x2={W - R} y1={y(threshold.v)} y2={y(threshold.v)} stroke="#c94040" strokeDasharray="5 4" />
          <text x={W - R} y={y(threshold.v) - 5} textAnchor="end" fontSize="11" fill="#c94040">{threshold.label}</text>
        </g>
      ) : null}
      {Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0 || i === n - 1).map((i) => (
        <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5b6d7e">{xLabel(i)}</text>
      ))}
      {series.map((s) => (
        <polyline key={s.name} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeDasharray={s.dash ? "6 5" : undefined}
          points={s.data.map((d, i) => `${x(i)},${y(d)}`).join(" ")} />
      ))}
      {series.map((s) => {
        const i = s.data.length - 1;
        return <circle key={s.name + "e"} cx={x(i)} cy={y(s.data[i])} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />;
      })}
    </svg>
  );
}

export function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="row" style={{ gap: 14, fontSize: 13 }}>
      {items.map((s) => (
        <span key={s.name} className="row" style={{ gap: 6 }}>
          <span style={{ width: 14, height: 3, background: s.color, borderRadius: 2, display: "inline-block" }} /> {s.name}
        </span>
      ))}
    </div>
  );
}

/** Illustrazione: le decisioni sono collegate da risorse condivise. */
export function NetworkArt() {
  const nodes = [
    { x: 300, y: 205, r: 46, c: "#0d2c4a", t: "Decisione", sub: "A o B?" },
    { x: 110, y: 90, r: 34, c: "#13879a", t: "Lavoro" },
    { x: 490, y: 92, r: 34, c: "#15406a", t: "Progetti" },
    { x: 92, y: 300, r: 32, c: "#7fa8c9", t: "Casa" },
    { x: 505, y: 305, r: 32, c: "#e49b2f", t: "Famiglia" },
    { x: 300, y: 50, r: 26, c: "#5fbccb", t: "Tempo" },
    { x: 300, y: 365, r: 26, c: "#c27a1a", t: "Liquidità" },
  ];
  return (
    <svg viewBox="0 0 600 410" style={{ width: "100%", height: "auto" }} aria-label="Decisioni collegate">
      <defs>
        <radialGradient id="gl" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e2f2f4" />
          <stop offset="100%" stopColor="#fbfcfd" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="300" cy="205" r="200" fill="url(#gl)" />
      {nodes.slice(1).map((n, i) => (
        <path key={i} d={`M300 205 Q ${(300 + n.x) / 2 + (i % 2 ? 30 : -30)} ${(205 + n.y) / 2} ${n.x} ${n.y}`}
          fill="none" stroke="#a9cbe3" strokeWidth="2.5" strokeDasharray={i > 3 ? "6 6" : undefined} />
      ))}
      <path d="M110 90 Q 300 120 490 92" fill="none" stroke="#e49b2f" strokeWidth="2" strokeDasharray="4 6" opacity=".7" />
      <path d="M92 300 Q 300 280 505 305" fill="none" stroke="#e49b2f" strokeWidth="2" strokeDasharray="4 6" opacity=".7" />
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r + 6} fill="#fff" opacity=".9" />
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.c} />
          <text x={n.x} y={n.y + (n.sub ? -2 : 4)} textAnchor="middle" fill="#fff" fontFamily="Outfit, sans-serif" fontWeight="600" fontSize={i ? 13 : 15}>{n.t}</text>
          {n.sub ? <text x={n.x} y={n.y + 16} textAnchor="middle" fill="#e49b2f" fontFamily="Outfit, sans-serif" fontWeight="600" fontSize="13">{n.sub}</text> : null}
        </g>
      ))}
      <g transform="translate(372 150)">
        <rect width="138" height="40" rx="10" fill="#fff" stroke="#e1e8ef" />
        <circle cx="18" cy="20" r="6" fill="#c94040" />
        <text x="32" y="17" fontSize="11" fill="#5b6d7e">Conflitto</text>
        <text x="32" y="31" fontSize="12" fontWeight="600" fill="#0d2c4a">ore: −20/settimana</text>
      </g>
      <g transform="translate(78 175)">
        <rect width="132" height="40" rx="10" fill="#fff" stroke="#e1e8ef" />
        <circle cx="18" cy="20" r="6" fill="#23906a" />
        <text x="32" y="17" fontSize="11" fill="#5b6d7e">Costo condiviso</text>
        <text x="32" y="31" fontSize="12" fontWeight="600" fill="#0d2c4a">contato 1 volta</text>
      </g>
    </svg>
  );
}
