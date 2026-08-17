import Link from "next/link";
import AdoptButton from "@/components/workouts/AdoptButton";
import { notFound } from "next/navigation";
import { getGymCached, getPublicWorkoutBySlug, getPublicWorkoutsCached } from "@/lib/cache";
import WorkoutFollow from "@/components/workouts/WorkoutFollow";
import ShareButton from "@/components/ShareButton";

// Was force-dynamic, puur om de sets van het ingelogde lid te kunnen voorinvullen. Elke bezoeker
// betaalde daardoor een server-render mét auth-rondrit voor een pagina die voor iedereen identiek
// is. De personalisatie zit nu in WorkoutFollow (via /api/me/workout-context), dus de pagina zelf
// kan gewoon statisch — en blijft na een publicatie hoogstens 5 minuten oud.
export const revalidate = 300;

export async function generateStaticParams() {
  try {
    const gym = await getGymCached();
    if (!gym) return [];
    const workouts = await getPublicWorkoutsCached(gym.id);
    return (workouts || []).filter((w) => w.slug).map((w) => ({ slug: w.slug }));
  } catch {
    // Databankhapering tijdens de build mag de deploy niet tegenhouden: zonder lijst rendert Next
    // de pagina's gewoon op aanvraag.
    return [];
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const gym = await getGymCached();
  const w = gym ? await getPublicWorkoutBySlug(gym.id, slug) : null;
  return w ? { title: `${w.name} | Workouts | Fittin'`, description: w.subtitle } : { title: "Workout | Fittin'" };
}

export default async function WorkoutDetail({ params }) {
  const { slug } = await params;
  const gym = await getGymCached();
  const workout = gym ? await getPublicWorkoutBySlug(gym.id, slug) : null;
  if (!workout) notFound();

  return (
    <main className="min-h-screen bg-paper">
      <section className="bg-brand px-5 pb-10 pt-12 text-white">
        <div className="mx-auto max-w-2xl">
          <Link href="/workouts" className="text-sm font-bold text-white/60 transition hover:text-white">← Alle workouts</Link>
          <h1 className="mt-3 text-3xl font-black md:text-4xl">{workout.name}</h1>
          <p className="mt-2 text-white/75">{workout.subtitle}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className="rounded-full bg-white/10 px-3 py-1">{workout.level}</span>
            <span className="rounded-full bg-white/10 px-3 py-1">± {workout.est_minutes} min</span>
            <span className="rounded-full bg-white/10 px-3 py-1">{workout.exercises.length} oefeningen</span>
            {workout.focus && <span className="rounded-full bg-accent/20 px-3 py-1 text-accent">{workout.focus}</span>}
            <ShareButton
              title={`${workout.name} · Fittin'`}
              text={workout.subtitle || "Volg deze workout mee bij Fittin'"}
              path={`/workouts/${slug}`}
              label="Deel"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold text-white transition hover:bg-white/20"
            />
          </div>
          {/* De gecureerde workout als STARTPUNT: overnemen maakt er een eigen, bewerkbaar schema
              van. Zonder deze knop is de bibliotheek een eindpunt — je kan hem volgen, maar er
              nooit iets van maken dat van jou is. */}
          <div className="mt-5">
            <AdoptButton programId={workout.id} donker label="Bewaar als mijn schema" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-2xl px-5 pt-6">
        {workout.description && <p className="leading-relaxed text-brand/75">{workout.description}</p>}
        {Array.isArray(workout.tips) && workout.tips.length > 0 && (
          <div className="mt-5 rounded-3xl border border-borderc bg-white p-5">
            <p className="text-xs font-black uppercase tracking-widest text-brand/50">Coachtips</p>
            <ul className="mt-3 space-y-2 text-sm text-brand/75">
              {workout.tips.map((t, i) => (
                <li key={i} className="flex gap-2"><span className="text-accent">✓</span> {t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* De uitnodiging voor uitgelogde bezoekers staat binnenin WorkoutFollow: die weet als enige
          of er iemand ingelogd is — de pagina zelf is voor iedereen dezelfde statische HTML. */}
      <WorkoutFollow workout={workout} signupHref={`/login?mode=signup&next=/workouts/${slug}`} />
    </main>
  );
}
