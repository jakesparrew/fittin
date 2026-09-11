import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import MessageThread from "@/components/MessageThread";
import ProgressPanel from "@/components/progress/ProgressPanel";
import WorkoutPlayer from "./WorkoutPlayer";
import VandaagKaart from "./VandaagKaart";
import { bouwDagen, kiesDagId, schatMinuten } from "@/lib/training-dagen";
import { magCoaching } from "@/lib/coaching/toegang.js";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn training | Fittin'" };

const EX_FIELDS = "id, name, slug, muscle, category, primary_muscles, secondary_muscles, equipment, difficulty, instructions, tips, image_url, animation_url, video_url, frames";

export default async function Training() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile: mijnProfiel } = await getSessionProfile();
  if (!user) redirect("/login?next=/training");
  const coachOpen = magCoaching(mijnProfiel);

  const supabase = await createClient();
  const [{ data: program }, { data: logs }, { data: coachLink }, { data: feedback }, { data: aiPlan }] = await Promise.all([
    supabase
      .from("programs")
      .select(`id, name, coach:profiles!programs_coach_id_fkey(full_name), program_days(id, day_no, name, program_exercises(id, position, sets, reps, rep_text, section, rest_sec, notes, tempo, target_weight_kg, rpe, superset_group, exercises(${EX_FIELDS})))`)
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
    supabase.from("workout_feedback").select("id, body, created_at, coach:profiles!workout_feedback_coach_id_fkey(full_name)").eq("client_id", user.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("coaching_plans").select("id, weken").eq("member_id", user.id).eq("status", "lopend").maybeSingle(),
  ]);

  // Het programma hierboven IS de week van de AI-coach voor wie er een heeft — die weken worden als
  // gewoon programma weggeschreven. Alleen: afvinken en lezen wat je coach schreef gebeurt op
  // /coaching, en zonder deze strook is dat nergens te zien vanaf hier.
  let coachWeek = null;
  if (coachOpen && aiPlan?.id) {
    const { data: w } = await supabase.from("coaching_weeks")
      .select("weeknummer, unlocked_at, completed_at").eq("plan_id", aiPlan.id).order("weeknummer");
    coachWeek = [...(w || [])].reverse().find((x) => x.unlocked_at && !x.completed_at) || null;
  }

  const myCoachId = coachLink?.coach?.id || null;
  let coachMessages = [];
  if (myCoachId) {
    const { data } = await supabase.from("coach_messages").select("id, sender_id, body, created_at").eq("coach_id", myCoachId).eq("client_id", user.id).order("created_at", { ascending: true }).limit(200);
    coachMessages = data || [];
  }

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weekDays = new Set((logs || []).filter((l) => new Date(l.created_at) >= weekAgo).map((l) => l.logged_on));

  // Dagen bouwen doet lib/training-dagen.js, zodat het sessiescherm gegarandeerd dezelfde dagen,
  // dezelfde volgorde en dezelfde "vandaag" ziet als deze pagina.
  const days = bouwDagen(program, logs, today);
  const vandaagDag = days.find((d) => d.id === kiesDagId(days, logs, today)) || days[0] || null;

  // De teller telt de dag van vandaag, niet alle dagen samen. Wie zijn volledige trainingsdag
  // afwerkte kreeg hiervoor "6/24 · 25%" te zien — feitelijk juist over het hele programma, maar
  // het las als "je bent voor driekwart niet klaar" op het moment dat je net klaar bént.
  const totalEx = vandaagDag ? vandaagDag.exercises.length : 0;
  const doneToday = vandaagDag ? vandaagDag.exercises.filter((pe) => pe.doneToday).length : 0;
  const pct = totalEx ? Math.round((doneToday / totalEx) * 100) : 0;
  const coachName = program?.coach?.full_name || coachLink?.coach?.full_name;

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-4xl px-5 py-16">
        <Link href="/account" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink/60 transition hover:text-ink">← Terug naar account</Link>
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.25em] text-lav">Mijn training</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-black md:text-4xl">{program ? program.name : "Nog geen programma"}</h1>
          <Link href="/plannen" className="rounded-full border-2 border-borderc px-4 py-2 text-sm font-bold text-ink transition hover:border-accent">Mijn plannen →</Link>
        </div>
        {coachName && <p className="mt-2 text-sm text-ink/60">Samengesteld door {coachName}</p>}

        {coachOpen && aiPlan && (
          <Link href="/coaching"
            className="anim-in mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-accent/30 bg-accent/5 px-5 py-3.5 transition hover:border-accent">
            <span className="min-w-0">
              <span className="block text-xs font-bold uppercase tracking-widest text-accentdark">Fittin&rsquo; coaching</span>
              <span className="mt-0.5 block text-sm font-bold text-ink">
                {coachWeek ? `Week ${coachWeek.weeknummer} van ${aiPlan.weken}` : `Je plan van ${aiPlan.weken} weken loopt`}
              </span>
            </span>
            <span className="shrink-0 text-sm font-bold text-accentdark">Afvinken en opvolgen &rarr;</span>
          </Link>
        )}

        {/* Bovenaan, vóór chat en grafieken: wat doe ik nu. Alles daaronder is naslag. */}
        {vandaagDag && (
          <VandaagKaart dag={vandaagDag} dagen={days} minuten={schatMinuten(vandaagDag.exercises)} klaar={doneToday} />
        )}

        {myCoachId && (
          <section id="berichten" className="mt-6 scroll-mt-24 rounded-3xl border border-borderc bg-surface p-6">
            <h2 className="font-black text-ink">Berichten met {coachName || "je coach"}</h2>
            <p className="mt-1 text-sm text-ink/60">Stel een vraag of deel je voortgang.</p>
            <div className="mt-4">
              <MessageThread coachId={myCoachId} clientId={user.id} meId={user.id} messages={coachMessages} otherName={coachName} />
            </div>
          </section>
        )}

        {/* Coach feedback (W3) */}
        {(feedback || []).length > 0 && (
          <section className="mt-6 rounded-3xl border border-accent/40 bg-accent/5 p-6">
            <h2 className="font-black text-ink">Feedback van je coach 💬</h2>
            <div className="mt-3 space-y-2">
              {feedback.map((f) => (
                <div key={f.id} className="rounded-2xl bg-surface p-3 text-sm">
                  <p className="text-ink/80">{f.body}</p>
                  <p className="mt-1 text-[11px] text-ink/40">{f.coach?.full_name || "Je coach"} · {new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }).format(new Date(f.created_at))}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Progress spans ALL logged workouts (own plans + public + coach program), not just today's plan. */}
        <ProgressPanel userId={user.id} />

        {!program ? (
          <div className="mt-6 rounded-3xl border border-dashed border-borderc bg-surface p-10 text-center">
            {coachName ? (
              <>
                <p className="font-semibold text-ink/70">{coachName} stelt binnenkort je programma samen.</p>
                <p className="mt-1 text-sm text-ink/50">Zodra je coach je trainingsschema klaarzet, verschijnt het hier.</p>
                <Link href="/oefeningen" className="mt-5 inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">Bekijk de oefeningen</Link>
              </>
            ) : (
              <>
                <p className="font-semibold text-ink/70">Je hebt nog geen programma. Werk samen met een coach voor een plan op maat — of verken zelf de oefeningen.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  <Link href="/personal-training" className="inline-block rounded-full bg-accent px-7 py-3.5 font-bold text-brand transition hover:opacity-90">Ontdek personal training</Link>
                  <Link href="/oefeningen" className="inline-block rounded-full border-2 border-borderc px-7 py-3.5 font-bold text-ink transition hover:border-lav">Oefeningenbibliotheek</Link>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Hier stond een tweede donkere kaart met exact dezelfde teller als de startkaart
                hierboven. Wat ze wél als enige toonde — hoeveel dagen je deze week actief was —
                blijft, maar dan als lichte regel in plaats van een blok dat om aandacht vraagt. */}
            <p className="mt-8 text-sm font-semibold text-ink-soft">
              {weekDays.size} actieve {weekDays.size === 1 ? "dag" : "dagen"} deze week
              {pct > 0 && pct < 100 ? ` · vandaag ${pct}% klaar` : ""}
            </p>

            {/* Het volledige schema blijft bereikbaar als naslag, maar dichtgeklapt: wie gewoon wil
                trainen gebruikt de knop bovenaan. */}
            <details className="group mt-4">
              <summary className="cursor-pointer list-none rounded-2xl border border-borderc bg-surface px-5 py-4 font-bold text-ink transition hover:border-lav">
                <span className="float-right text-ink-soft transition group-open:rotate-180">▾</span>
                Volledig schema bekijken
                <span className="ml-2 font-normal text-ink-soft">({days.length} {days.length === 1 ? "dag" : "dagen"})</span>
              </summary>
              <div className="mt-4">
                <WorkoutPlayer days={days} />
              </div>
            </details>
          </>
        )}
      </div>
    </main>
  );
}
