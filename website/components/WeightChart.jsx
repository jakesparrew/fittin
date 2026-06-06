// Simple SVG line chart of weight over time. Pure server component (no client JS).
// points: [{ logged_on: "YYYY-MM-DD", weight_kg: number }] ascending by date.
export default function WeightChart({ points = [], goal = null }) {
  if (points.length < 2) {
    return <p className="text-sm text-brand/50">Log je gewicht op minstens twee dagen om je grafiek te zien.</p>;
  }
  const W = 640, H = 200, padL = 36, padR = 12, padT = 14, padB = 24;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => Number(p.weight_kg));
  const allY = goal != null ? [...ys, goal] : ys;
  let min = Math.min(...allY), max = Math.max(...allY);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12 || 1;
  min -= pad; max += pad;
  const x = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(ys[i]).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(H - padB).toFixed(1)} L${x(0).toFixed(1)},${(H - padB).toFixed(1)} Z`;
  const fmtD = (d) => new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(d));
  const first = ys[0], last = ys[ys.length - 1];
  const delta = +(last - first).toFixed(1);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div><p className="text-3xl font-black text-brand">{last} <span className="text-base font-bold text-brand/40">kg</span></p><p className="text-xs text-brand/50">huidig</p></div>
        <div className={"rounded-full px-3 py-1 text-sm font-bold " + (delta < 0 ? "bg-accent/15 text-accentdark" : delta > 0 ? "bg-paper text-brand/60" : "bg-paper text-brand/50")}>
          {delta > 0 ? "+" : ""}{delta} kg <span className="font-normal text-brand/40">sinds {fmtD(points[0].logged_on)}</span>
        </div>
        {goal != null && <div className="text-sm text-brand/50">doel: <span className="font-bold text-brand">{goal} kg</span></div>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" preserveAspectRatio="none" role="img" aria-label="Gewichtsgrafiek">
        <defs>
          <linearGradient id="wf" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5fda6b" stopOpacity="0.25" /><stop offset="100%" stopColor="#5fda6b" stopOpacity="0" /></linearGradient>
        </defs>
        {[0, 0.5, 1].map((t) => { const v = max - t * (max - min); return (
          <g key={t}><line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="#e6e4f0" strokeWidth="1" /><text x="2" y={y(v) + 3} fontSize="10" fill="#b2adc2">{v.toFixed(0)}</text></g>
        ); })}
        {goal != null && <line x1={padL} y1={y(goal)} x2={W - padR} y2={y(goal)} stroke="#33b24a" strokeWidth="1.5" strokeDasharray="5 4" />}
        <path d={area} fill="url(#wf)" />
        <path d={line} fill="none" stroke="#22194f" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(ys[i])} r="3" fill="#5fda6b" stroke="#22194f" strokeWidth="1.5" />)}
        <text x={padL} y={H - 6} fontSize="10" fill="#b2adc2">{fmtD(points[0].logged_on)}</text>
        <text x={W - padR} y={H - 6} fontSize="10" fill="#b2adc2" textAnchor="end">{fmtD(points[points.length - 1].logged_on)}</text>
      </svg>
    </div>
  );
}
