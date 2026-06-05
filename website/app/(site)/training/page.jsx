import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { logWorkout } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn training | Fittin'" };

export default async function Training() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/training");

  const supabase = await createClient();
  const [{ data: program }, { data: logs }] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, program_days(id, day_no, name, program_exercises(id, sets, reps, rest_sec, exercises(name)))")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("workout_logs")
      .select("id, program_exercise_id, sets_json, logged_on, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
  ]);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const loggedTodayByPe = new Set(
    (logs || []).filter((l) => l.logged_on === today).map((l) => l.program_exercise_id)
  );
  const days = program ? [...(program.program_days || [])].sort((a, b) => a.day_no - b.day_no) : [];

  return (
    <main className="bg-paper">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <p className="text-sm font-bold uppercase tracking-[0.25em] text-lav">Mijn training</p>
        <h1 className="mt-2 text-3xl font-black md:text-4xl">
          {program ? program.name : "Nog geen programma"}
        </h1>

        {!program ? (
          <div className="mt-6 rounded-3xl border border-dashed border-borderc bg-white p-10 text-center">
            <p className="font-semibold text-brand/70">Je coach heeft je nog geen programma toegewezen.</p>
            <Link href="/personal-training" className="mt-5 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">
              Boek een coach
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            {days.map((day) => {
              const exs = day.program_exercises || [];
              return (
                <section key={day.id} className="rounded-3xl border border-borderc bg-white p-6">
                  <h2 className="font-black text-brand">{day.name || `Dag ${day.day_no}`}</h2>
                  <div className="mt-4 space-y-3">
                    {exs.map((pe) => {
                      const done = loggedTodayByPe.has(pe.id);
                      return (
                        <div key={pe.id} className="rounded-2xl bg-paper p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-bold text-brand">{pe.exercises?.name}</p>
                              <p className="text-xs text-brand/50">
                                doel: {pe.sets ?? "–"} × {pe.reps ?? "–"} · {pe.rest_sec ?? "–"}s rust
                              </p>
                            </div>
                            {done && <span className="rounded-full bg-accent/20 px-3 py-1 text-xs font-bold text-accentdark">✓ gelogd vandaag</span>}
                          </div>
                          <form action={logWorkout} className="mt-3 flex flex-wrap items-end gap-2">
                            <input type="hidden" name="peId" value={pe.id} />
                            <Mini name="sets" label="sets" defaultValue={pe.sets ?? ""} />
                            <Mini name="reps" label="reps" defaultValue={pe.reps ?? ""} />
                            <Mini name="weight" label="kg" />
                            <button className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-white transition hover:opacity-90">Log</button>
                          </form>
                        </div>
                      );
                    })}
                    {exs.length === 0 && <p className="text-xs text-brand/40">Nog geen oefeningen op deze dag.</p>}
                  </div>
                </section>
              );
            })}
          </div>
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
