import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import MessageThread from "@/components/MessageThread";
import WorkoutPlayer from "./WorkoutPlayer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn training | Fittin'" };

const asArray = (sj) =>
  Array.isArray(sj) ? sj : sj && typeof sj === "object" && (sj.reps != null || sj.weight_kg != null) ? [sj] : [];
const topW = (sj) => asArray(sj).reduce((m, s) => Math.max(m, s?.weight_kg || 0), 0);

const EX_FIELDS = "id, name, slug, muscle, category, primary_muscles, secondary_muscles, equipment, difficulty, instructions, tips, image_url, animation_url, video_url, frames";

export default async function Training() {
  if (!isSupabaseConfigured) redirect("/");
  const { user } = await getSessionProfile();
  if (!user) redirect("/login?next=/training");

  const supabase = await createClient();
  const [{ data: program }, { data: logs }, { data: coachLink }] = await Promise.all([
    supabase
      .from("programs")
      .select(`id, name, coach:profiles!programs_coach_id_fkey(full_name), program_days(id, day_no, name, program_exercises(id, position, sets, reps, rest_sec, exercises(${EX_FIELDS})))`)
      .eq("member_id", user.id)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_logs")
      .select("id, program_exercise_id, sets_json, logged_on, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("coach_clients").select("coach:profiles!coach_clients_coach_id_fkey(id, full_name)").eq("client_id", user.id).eq("status", "accepted").limit(1).maybeSingle(),
  ]);

  const myCoachId = coachLink?.coach?.id || null;
  let coachMessages = [];
  if (myCoachId) {
    const { data } = await supabase.from("coach_messages").select("id, sender_id, body, created_at").eq("coach_id", myCoachId).eq("client_id", user.id).order("created_at", { ascending: true }).limit(200);
    coachMessages = data || [];
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekDays = new Set((logs || []).filter((l) => new Date(l.created_at) >= weekAgo).map((l) => l.logged_on));

  // Index logs per program-exercise for done-today / last-session / PR.
  const byPe = {};
  for (const l of logs || []) (byPe[l.program_exercise_id] ||= []).push(l);

  const rawDays = program ? [...(program.program_days || [])].sort((a, b) => a.day_no - b.day_no) : [];
  const days = rawDays.map((d) => ({
    id: d.id,
    name: d.name,
    day_no: d.day_no,
    exercises: [...(d.program_exercises || [])]
      .sort((a, b) => (a.position || 0) - (b.position || 0))
      .map((pe) => {
        const peLogs = byPe[pe.id] || [];
        const doneToday = peLogs.some((l) => l.logged_on === today);
        // Prefer the most recent prior session that actually logged sets (not a bare done-toggle).
        const lastLog = peLogs.find((l) => l.logged_on !== today && asArray(l.sets_json).length) || peLogs.find((l) => l.logged_on !== today);
        const pr = peLogs.reduce((m, l) => Math.max(m, topW(l.sets_json)), 0);
        return {
          peId: pe.id,
          sets: pe.sets,
          reps: pe.reps,
          rest_sec: pe.rest_sec,
          exercise: pe.exercises,
          doneToday,
          lastSets: lastLog ? asArray(lastLog.sets_json) : [],
          pr,
        };
      }),
  }));

  const totalEx = days.reduce((a, d) => a + d.exercises.length, 0);
  const doneToday = days.reduce((a, d) => a + d.exercises.filter((pe) => pe.doneToday).length, 0);
  const pct = totalEx ? Math.round((doneToday / totalEx) * 100) : 0;
  const coachName = program?.coach?.full_name || coachLink?.coach?.full_name;

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <Link href="/account" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand/60 transition hover:text-brand">← Terug naar account</Link>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-lav">Mijn training</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-black md:text-4xl">{program ? program.name : "Nog geen programma"}</h1>
          <Link href="/plannen" className="rounded-full border-2 border-borderc px-4 py-2 text-sm font-bold text-brand transition hover:border-accent">Mijn plannen →</Link>
        </div>
        {coachName && <p className="mt-2 text-sm text-brand/60">Samengesteld door {coachName}</p>}

        {myCoachId && (
          <section id="berichten" className="mt-6 scroll-mt-24 rounded-3xl border border-borderc bg-white p-6">
            <h2 className="font-black text-brand">Berichten met {coachName || "je coach"}</h2>
            <p className="mt-1 text-sm text-brand/60">Stel een vraag of deel je voortgang.</p>
            <div className="mt-4">
              <MessageThread coachId={myCoachId} clientId={user.id} meId={user.id} messages={coachMessages} otherName={coachName} />
            </div>
          </section>
        )}

        {!program ? (
          <div className="mt-6 rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
            {coachName ? (
              <>
                <p className="font-semibold text-brand/70">{coachName} stelt binnenkort je programma samen.</p>
                <p className="mt-1 text-sm text-brand/50">Zodra je coach je trainingsschema klaarzet, verschijnt het hier.</p>
                <Link href="/oefeningen" className="mt-5 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">Bekijk de oefeningen</Link>
              </>
            ) : (
              <>
                <p className="font-semibold text-brand/70">Je hebt nog geen programma. Werk samen met een coach voor een plan op maat — of verken zelf de oefeningen.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link href="/personal-training" className="inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">Ontdek personal training</Link>
                  <Link href="/oefeningen" className="inline-block rounded-full border-2 border-borderc px-7 py-3.5 font-bold text-brand transition hover:border-lav">Oefeningenbibliotheek</Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="mt-8 rounded-3xl bg-brand p-6 text-white">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-lav">Vandaag</p>
                  <p className="mt-1 text-2xl font-black">{doneToday}/{totalEx} oefeningen</p>
                </div>
                <p className="text-sm text-lav">{weekDays.size} actieve {weekDays.size === 1 ? "dag" : "dagen"} deze week</p>
              </div>
              <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>

            <div className="mt-6">
              <WorkoutPlayer days={days} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
