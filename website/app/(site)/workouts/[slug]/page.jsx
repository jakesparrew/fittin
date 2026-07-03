import Link from "next/link";
import { notFound } from "next/navigation";
import { getGymCached, getPublicWorkoutBySlug } from "@/lib/cache";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import WorkoutFollow from "@/components/workouts/WorkoutFollow";
import ShareButton from "@/components/ShareButton";

export const dynamic = "force-dynamic";

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

  const { user } = await getSessionProfile();

  // For logged-in members: prefill last sets + today's done-state per exercise.
  const lastByPe = {};
  const doneToday = {};
  if (user) {
    const peIds = workout.exercises.map((e) => e.id);
    const supabase = await createClient();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
    const { data: logs } = await supabase
      .from("workout_logs")
      .select("program_exercise_id, sets_json, logged_on")
      .eq("user_id", user.id)
      .in("program_exercise_id", peIds)
      .order("logged_on", { ascending: false });
    const seen = new Set();
    for (const l of logs || []) {
      const arr = Array.isArray(l.sets_json) ? l.sets_json : null;
      if (l.logged_on === today && (arr || l.sets_json?.done)) doneToday[l.program_exercise_id] = true;
      if (arr && !seen.has(l.program_exercise_id)) { seen.add(l.program_exercise_id); lastByPe[l.program_exercise_id] = arr; }
    }
  }

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
        {!user && (
          <div className="mt-5 rounded-3xl border-2 border-accent/40 bg-accent/5 p-5">
            <p className="font-bold text-brand">Log in om je sets bij te houden 💪</p>
            <p className="mt-1 text-sm text-brand/60">Je kan de workout vrij bekijken. Maak een gratis account om je gewichten, PR's en voortgang te loggen.</p>
            <Link href={`/login?mode=signup&next=/workouts/${slug}`} className="mt-3 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90">Maak gratis account</Link>
          </div>
        )}
      </div>

      <WorkoutFollow workout={workout} lastByPe={lastByPe} doneToday={doneToday} isLoggedIn={!!user} />
    </main>
  );
}
