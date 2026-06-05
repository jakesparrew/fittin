// Dependency-free SVG charts (server-rendered). Brand: navy #22194f, lime #5fda6b.

// Vertical bar chart with labels under each bar.
export function BarChart({ data, height = 140, format = (v) => v, accentLast = true }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = 100 / data.length;
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
      <div className="mt-1 flex text-center text-[10px] font-bold text-brand/40">
        {data.map((d, i) => <div key={i} style={{ width: bw + "%" }}>{d.label}</div>)}
      </div>
      <div className="-mt-4 flex text-center text-[10px] font-black text-brand/70">
        {data.map((d, i) => <div key={i} style={{ width: bw + "%" }}>{d.value ? format(d.value) : ""}</div>)}
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
