import { getMemberProgress } from "@/lib/progress";
import { VolumeBars, Sparkline } from "./Charts";

const fmtDay = (iso) => new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(iso + "T12:00:00Z"));

// Member's training progress: sessions, PR's, streak, weekly volume, per-exercise weight trend,
// PR timeline and bodyweight. Reads via getMemberProgress (service-role, scoped to userId).
export default async function ProgressPanel({ userId }) {
  const p = await getMemberProgress(userId);

  if (!p.hasData) {
    return (
      <section id="voortgang" className="mt-6 scroll-mt-24 rounded-3xl border border-borderc bg-white p-6">
        <h2 className="font-black text-brand">Mijn voortgang 📈</h2>
        <p className="mt-2 text-sm text-brand/55">Log je sets in een workout en je vooruitgang verschijnt hier — volume, PR's en gewicht per oefening.</p>
      </section>
    );
  }

  return (
    <section id="voortgang" className="mt-6 scroll-mt-24 rounded-3xl border border-borderc bg-white p-6">
      <h2 className="font-black text-brand">Mijn voortgang 📈</h2>

      {/* Stat tiles */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <Tile label="Sessies" value={p.totals.sessions} hint="laatste 6 maanden" />
        <Tile label="Persoonlijke records" value={p.totals.prs} hint="🔥 PR's" accent />
        <Tile label="Reeks" value={`${p.streak} wk`} hint="weken op rij actief" />
      </div>

      {/* Weekly volume */}
      <div className="mt-6">
        <p className="text-xs font-bold uppercase tracking-wide text-lav">Volume per week <span className="normal-case text-brand/40">(sets × reps × kg)</span></p>
        <div className="mt-3"><VolumeBars weeks={p.weeks} /></div>
      </div>

      {/* Per-exercise weight trend */}
      {p.topExercises.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-bold uppercase tracking-wide text-lav">Gewicht per oefening</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {p.topExercises.map((e) => (
              <div key={e.name} className="rounded-2xl border border-borderc p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-bold text-brand">{e.name}</p>
                  <span className="shrink-0 text-xs font-black text-accentdark">{e.best} kg</span>
                </div>
                <div className="mt-2"><Sparkline points={e.points} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {/* PR timeline */}
        {p.prs.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-lav">Recente PR's 🔥</p>
            <div className="mt-3 space-y-1.5">
              {p.prs.map((pr, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-paper px-3 py-2 text-sm">
                  <span className="truncate font-semibold text-brand">{pr.name}</span>
                  <span className="shrink-0 text-xs text-brand/50">{pr.weight} kg · {fmtDay(pr.date)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bodyweight */}
        {p.bodyweight.length >= 2 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-lav">Lichaamsgewicht</p>
            <div className="mt-3 rounded-2xl border border-borderc p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-bold text-brand">{p.bodyweight[p.bodyweight.length - 1].kg.toFixed(1)} kg</span>
                <span className="text-xs text-brand/40">{fmtDay(p.bodyweight[0].date)} → nu</span>
              </div>
              <div className="mt-2"><Sparkline points={p.bodyweight} stroke="#22194f" /></div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Tile({ label, value, hint, accent }) {
  return (
    <div className="rounded-2xl border border-borderc bg-paper/40 p-4 text-center">
      <p className={"text-2xl font-black " + (accent ? "text-accentdark" : "text-brand")}>{value}</p>
      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-lav">{label}</p>
      {hint && <p className="text-[10px] text-brand/40">{hint}</p>}
    </div>
  );
}
