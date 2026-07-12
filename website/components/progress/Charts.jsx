// Lightweight, dependency-free charts for the member progress panel. Server-rendered (pure SVG/CSS),
// theme colors, accessible. No chart library (project convention: no extra deps).

// Weekly volume as CSS bars — responsive, one baseline, hover shows exact figures.
export function VolumeBars({ weeks }) {
  const max = Math.max(1, ...weeks.map((w) => w.volume));
  return (
    <div className="flex items-end gap-1.5" style={{ height: 96 }} role="img" aria-label="Trainingsvolume per week">
      {weeks.map((w) => (
        <div key={w.week} className="flex flex-1 flex-col items-center justify-end gap-1"
          title={`${w.label}: ${w.volume.toLocaleString("nl-BE")} kg totaal · ${w.sessions} sessie${w.sessions === 1 ? "" : "s"}`}>
          <div className={"w-full rounded-t " + (w.volume ? "bg-accent" : "bg-borderc")}
            style={{ height: w.volume ? `${Math.max(4, (w.volume / max) * 100)}%` : "3px" }} />
          <span className="text-[8px] leading-none text-brand/40">{w.label.split(" ")[0]}</span>
        </div>
      ))}
    </div>
  );
}

// Single-series sparkline (per-exercise weight, bodyweight). points: array of numbers or {w}/{kg}.
export function Sparkline({ points, stroke = "#5fda6b" }) {
  const vals = (points || []).map((p) => (typeof p === "number" ? p : p.w ?? p.kg ?? 0));
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1;
  const W = 100, H = 32, step = W / (vals.length - 1);
  const pts = vals.map((v, i) => `${(i * step).toFixed(1)},${(H - ((v - min) / range) * (H - 4) - 2).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-8 w-full" role="img" aria-hidden>
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
