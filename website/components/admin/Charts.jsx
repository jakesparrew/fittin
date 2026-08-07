// Dependency-free SVG charts (server-rendered). Brand: navy #22194f, lime #5fda6b.

// Vertical bar chart with labels under each bar. Sparse charts (≤14 bars, e.g. monthly) show a
// value + label per bar; dense charts (daily, 30+ bars) skip per-bar values and thin the labels —
// the old version overlaid the value row on the label row with a negative margin, which turned
// 30-day charts into unreadable mush.
export function BarChart({ data, height = 140, format = (v) => v, accentLast = true }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = 100 / data.length;
  const dense = data.length > 14;
  const step = dense ? Math.ceil(data.length / 7) : 1; // dense: ~7 evenly spaced date labels
  return (
    <div>
      <svg viewBox={`0 0 100 ${100}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {data.map((d, i) => {
          const h = (d.value / max) * 92;
          const last = i === data.length - 1;
          return (
            <g key={i}>
              <rect x={i * bw + bw * 0.18} y={100 - h} width={bw * 0.64} height={h} rx="1.2"
                fill={accentLast && last ? "#5fda6b" : "#d9d6ea"} />
            </g>
          );
        })}
      </svg>
      {!dense && (
        <div className="mt-1 flex text-center text-[10px] font-black text-brand/70">
          {data.map((d, i) => <div key={i} style={{ width: bw + "%" }}>{d.value ? format(d.value) : ""}</div>)}
        </div>
      )}
      <div className="mt-0.5 flex text-[10px] font-bold text-brand/40">
        {data.map((d, i) => (
          <div key={i} style={{ width: bw + "%" }} className="overflow-visible whitespace-nowrap text-center">
            {dense ? (i % step === 0 ? d.label : "") : d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// Lijn met vlak eronder, voor een verloop in de tijd (abonnees, boekingen per week, omzet per maand).
// Een staafdiagram vergelijkt losse periodes; een lijn toont de RICHTING — en dat is wat je wil
// weten bij een trend. Bewust zonder as-labels links: de waarde van het laatste punt staat groot
// naast de grafiek, en tussenwaarden aflezen is hier zelden de vraag.
//
// vector-effect houdt de lijndikte gelijk ondanks preserveAspectRatio="none" (zonder dat wordt de
// lijn horizontaal uitgerekt tot een wig).
export function TrendLine({ data, height = 120, format = (v) => v, label = "" }) {
  if (!data || data.length < 2) {
    return <p className="py-6 text-center text-xs text-brand/40">Nog te weinig historiek voor een grafiek.</p>;
  }
  const vals = data.map((d) => d.value);
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const x = (i) => (i / (data.length - 1)) * 100;
  const y = (v) => 38 - ((v - min) / span) * 34; // 2..38 binnen een viewBox van 40 hoog
  const punten = data.map((d, i) => `${x(i).toFixed(2)},${y(d.value).toFixed(2)}`);
  const lijn = "M" + punten.join(" L");
  const vlak = `${lijn} L100,40 L0,40 Z`;
  const laatste = data[data.length - 1];

  return (
    <div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-black text-brand">{format(laatste.value)}</p>
          <p className="text-xs font-bold text-brand/40">{label || laatste.label}</p>
        </div>
      </div>
      <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="mt-2 w-full" style={{ height }}>
        <defs>
          <linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5fda6b" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#5fda6b" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={vlak} fill="url(#trendfill)" />
        <path d={lijn} fill="none" stroke="#33B24A" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(data.length - 1)} cy={y(laatste.value)} r="1.6" fill="#22194F" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-bold text-brand/40">
        <span>{data[0].label}</span>
        <span>{laatste.label}</span>
      </div>
    </div>
  );
}

// Donut gauge for a single percentage.
export function Donut({ value, label, sub }) {
  const r = 42, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-24 w-24 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#eceaf5" strokeWidth="11" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#5fda6b" strokeWidth="11" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`} />
      </svg>
      <div>
        <p className="text-3xl font-black text-brand">{pct}%</p>
        <p className="text-sm font-bold text-brand/60">{label}</p>
        {sub && <p className="text-xs text-brand/40">{sub}</p>}
      </div>
    </div>
  );
}

// Horizontal funnel (each step a shrinking bar with conversion %).
export function Funnel({ steps }) {
  const top = Math.max(1, steps[0]?.value || 1);
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const w = Math.max(4, (s.value / top) * 100);
        const conv = i === 0 ? 100 : Math.round((s.value / (steps[i - 1].value || 1)) * 100);
        return (
          <div key={i}>
            <div className="flex items-center justify-between text-xs font-bold text-brand/60">
              <span>{s.label}</span>
              <span>{s.value}{i > 0 && <span className="ml-2 text-brand/40">{conv}%</span>}</span>
            </div>
            <div className="mt-1 h-7 overflow-hidden rounded-lg bg-paper">
              <div className="flex h-full items-center rounded-lg bg-gradient-to-r from-brand to-[#3a2f73] px-2 text-[10px] font-black text-white transition-all" style={{ width: w + "%" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
