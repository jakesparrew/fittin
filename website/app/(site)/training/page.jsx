import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { logWorkout, toggleExerciseDone } from "./actions";
import MessageThread from "@/components/MessageThread";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn training | Fittin'" };

export default async function Training() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/training");

  const supabase = await createClient();
  const [{ data: program }, { data: logs }, { data: coachLink }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, coach:profiles!programs_coach_id_fkey(full_name), program_days(id, day_no, name, program_exercises(id, position, sets, reps, rest_sec, exercises(name, muscle)))")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_logs")
      .select("id, program_exercise_id, sets_json, logged_on, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(120),
    supabase.from("coach_clients").select("coach:profiles!coach_clients_coach_id_fkey(id, full_name)").eq("client_id", user.id).maybeSingle(),
  ]);

  const myCoachId = coachLink?.coach?.id || null;
  let coachMessages = [];
  if (myCoachId) {
    const { data } = await supabase.from("coach_messages").select("id, sender_id, body, created_at").eq("coach_id", myCoachId).eq("client_id", user.id).order("created_at", { ascending: true }).limit(200);
    coachMessages = data || [];
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const loggedTodayByPe = new Set((logs || []).filter((l) => l.logged_on === today).map((l) => l.program_exercise_id));
  // Days/exercises done in the last 7 days, for a simple progress streak.
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekDays = new Set((logs || []).filter((l) => new Date(l.created_at) >= weekAgo).map((l) => l.logged_on));

  const days = program ? [...(program.program_days || [])].sort((a, b) => a.day_no - b.day_no) : [];
  const totalEx = days.reduce((a, d) => a + (d.program_exercises || []).length, 0);
  const doneToday = days.reduce((a, d) => a + (d.program_exercises || []).filter((pe) => loggedTodayByPe.has(pe.id)).length, 0);
  const pct = totalEx ? Math.round((doneToday / totalEx) * 100) : 0;
  const coachName = program?.coach?.full_name || coachLink?.coach?.full_name;

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-16">
        {/* Back + header */}
        <Link href="/account" className="inline-flex items-center gap-1.5 text-sm font-bold text-brand/60 transition hover:text-brand">← Terug naar account</Link>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-lav">Mijn training</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">{program ? program.name : "Nog geen programma"}</h1>
        {coachName && <p className="mt-2 text-sm text-brand/60">Samengesteld door {coachName}</p>}

        {myCoachId && (
          <section className="mt-6 rounded-3xl border border-borderc bg-white p-6">
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
                <Link href="/boeken" className="mt-5 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">Boek een sessie</Link>
              </>
            ) : (
              <>
                <p className="font-semibold text-brand/70">Je hebt nog geen programma. Werk samen met een coach voor een plan op maat.</p>
                <Link href="/personal-training" className="mt-5 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">Ontdek personal training</Link>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Progress summary */}
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

            <div className="mt-6 space-y-6">
              {days.map((day) => {
                const exs = [...(day.program_exercises || [])].sort((a, b) => (a.position || 0) - (b.position || 0));
                const dayDone = exs.filter((pe) => loggedTodayByPe.has(pe.id)).length;
                return (
                  <section key={day.id} className="rounded-3xl border border-borderc bg-white p-6">
                    <div className="flex items-center justify-between">
                      <h2 className="font-black text-brand">{day.name || `Dag ${day.day_no}`}</h2>
                      <span className="text-xs font-bold text-brand/40">{dayDone}/{exs.length} klaar</span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {exs.map((pe) => {
                        const done = loggedTodayByPe.has(pe.id);
                        return (
                          <div key={pe.id} className={"rounded-2xl p-4 transition " + (done ? "bg-accent/10 ring-1 ring-accent/40" : "bg-paper")}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className={"font-bold text-brand " + (done ? "line-through opacity-60" : "")}>{pe.exercises?.name}</p>
                                <p className="text-xs text-brand/50">
                                  doel: {pe.sets ?? "–"} × {pe.reps ?? "–"} · {pe.rest_sec ?? "–"}s rust{pe.exercises?.muscle ? ` · ${pe.exercises.muscle}` : ""}
                                </p>
                              </div>
                              <form action={toggleExerciseDone}>
                                <input type="hidden" name="peId" value={pe.id} />
                                <button className={"rounded-full px-5 py-2 text-sm font-bold transition " + (done ? "border-2 border-borderc text-brand hover:border-lav" : "bg-accent text-brand hover:opacity-90")}>
                                  {done ? "Ongedaan maken" : "Klaar ✓"}
                                </button>
                              </form>
                            </div>
                            {/* Optional: log exact sets/reps/weight for progress tracking */}
                            <details className="mt-3">
                              <summary className="cursor-pointer text-xs font-bold text-brand/50 hover:text-brand">Sets/gewicht loggen</summary>
                              <form action={logWorkout} className="mt-2 flex flex-wrap items-end gap-2">
                                <input type="hidden" name="peId" value={pe.id} />
                                <Mini name="sets" label="sets" defaultValue={pe.sets ?? ""} />
                                <Mini name="reps" label="reps" defaultValue={pe.reps ?? ""} />
                                <Mini name="weight" label="kg" />
                                <button className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:opacity-90">Log</button>
                              </form>
                            </details>
                          </div>
                        );
                      })}
                      {exs.length === 0 && <p className="text-xs text-brand/40">Nog geen oefeningen op deze dag.</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Mini({ name, label, defaultValue }) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-lav">{label}</span>
      <input name={name} defaultValue={defaultValue} className="w-16 rounded-lg border-2 border-borderc bg-white px-2 py-1.5 text-sm text-brand outline-none focus:border-accent" />
    </label>
  );
}
