// Collapsible step-by-step "how to set this up" guide shown at the top of create pages
// (events, challenges, …). Server component — just content.
export default function QuickStart({ title = "Snelstart", steps = [], defaultOpen = false }) {
  return (
    <details open={defaultOpen} className="mt-4 rounded-2xl border border-accent/30 bg-accent/5 p-4">
      <summary className="cursor-pointer text-sm font-black text-brand">💡 {title} — zo werkt het</summary>
      <ol className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm text-brand/70">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-xs font-black text-white">{i + 1}</span>
            <span><span className="font-bold text-brand">{s.title}</span>{s.body ? ` — ${s.body}` : ""}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
