import Link from "next/link";
import { getGymCached, getPublicWorkoutsCached } from "@/lib/cache";

export const revalidate = 300;
export const metadata = {
  title: "Workouts | Fittin'",
  description: "Kant-en-klare workouts om mee te volgen — borst, schouders, rug en meer. Met demo's, sets, rusttimer en voortgang.",
};

// Inline category accents (safe regardless of Tailwind palette config).
const CAT = {
  borst: { label: "Borst", color: "#e11d48" },
  schouders: { label: "Schouders", color: "#d97706" },
  rug: { label: "Rug", color: "#0284c7" },
  benen: { label: "Benen", color: "#7c3aed" },
  core: { label: "Core", color: "#0d9488" },
  armen: { label: "Armen", color: "#db2777" },
};
const catOf = (c) => CAT[c] || { label: "Workout", color: "#33B24A" };

export default async function WorkoutsPage() {
  const gym = await getGymCached();
  const workouts = gym ? await getPublicWorkoutsCached(gym.id) : [];

  return (
    <main className="min-h-screen bg-paper">
      <section className="bg-brand px-5 pb-12 pt-14 text-white">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm font-bold uppercase tracking-[0.25em] text-accent">Train mee</p>
          <h1 className="mt-2 text-4xl font-black md:text-5xl">Workouts</h1>
          <p className="mt-3 max-w-xl text-white/75">
            Kant-en-klare workouts om meteen te volgen — met demo's, sets, rusttimer en voortgang. Kies er één en start.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-10">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {workouts.map((w) => {
            const c = catOf(w.category);
            return (
              <Link
                key={w.id}
                href={`/workouts/${w.slug}`}
                className="group flex flex-col overflow-hidden rounded-3xl border border-borderc bg-white transition hover:-translate-y-1 hover:shadow-xl hover:shadow-brand/5"
              >
                <div className="flex h-24 items-end p-5" style={{ background: `linear-gradient(135deg, ${c.color}22, #ffffff)` }}>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white/85 px-3 py-1 text-xs font-bold text-brand">
                    <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                    {c.label}
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <h2 className="text-lg font-black text-brand">{w.name}</h2>
                  <p className="mt-1 flex-1 text-sm text-brand/60">{w.subtitle}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-brand/60">
                    <span className="rounded-full bg-paper px-2.5 py-1">{w.level}</span>
                    <span className="rounded-full bg-paper px-2.5 py-1">± {w.est_minutes} min</span>
                    <span className="rounded-full bg-paper px-2.5 py-1">{w.exerciseCount} oefeningen</span>
                  </div>
                  <span className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 text-center text-sm font-bold text-brand transition group-hover:opacity-90">
                    Bekijk &amp; start →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
        {workouts.length === 0 && <p className="text-brand/50">Nog geen workouts beschikbaar.</p>}

        <div className="mt-10 rounded-3xl border border-borderc bg-white p-6">
          <h3 className="font-black text-brand">Liever je eigen plan?</h3>
          <p className="mt-1 text-sm text-brand/60">Bouw je eigen workout uit de oefeningenbibliotheek of laat AI er één voor je maken.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/plannen" className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90">Mijn plannen</Link>
            <Link href="/plannen/genereer" className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-brand transition hover:border-accent">Genereer met AI</Link>
            <Link href="/oefeningen" className="rounded-full border-2 border-borderc px-5 py-2.5 text-sm font-bold text-brand transition hover:border-accent">Oefeningen</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
