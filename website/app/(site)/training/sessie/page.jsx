import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { bouwDagen, kiesDagId, schatMinuten, sessieResultaat } from "@/lib/training-dagen";
import SessieScherm from "../SessieScherm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sessie | Fittin'", robots: { index: false } };

const EX_FIELDS = "id, name, slug, muscle, category, primary_muscles, secondary_muscles, equipment, difficulty, instructions, tips, image_url, animation_url, video_url, frames";

// Eén trainingsdag, kaal. Alles wat /training aan context toont (chat, grafieken, andere dagen)
// blijft hier bewust weg — dit scherm dient één moment: de set die je nu doet.
export default async function Sessie({ searchParams }) {
  if (!isSupabaseConfigured) redirect("/");
  const { user } = await getSessionProfile();
  if (!user) redirect("/login?next=/training");

  const supabase = await createClient();
  const [{ data: program }, { data: logs }] = await Promise.all([
    supabase
      .from("programs")
      .select(`id, name, program_days(id, day_no, name, program_exercises(id, position, sets, reps, rep_text, section, rest_sec, notes, tempo, target_weight_kg, rpe, superset_group, exercises(${EX_FIELDS})))`)
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
  ]);

  // Geen programma (meer) → terug naar de hub, die legt uit wat je dan wél kan doen.
  if (!program) redirect("/training");

  const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
  const dagen = bouwDagen(program, logs, vandaag);
  if (!dagen.length) redirect("/training");

  // ?dag= mag alleen een dag van je EIGEN programma openen. Een onbekend of vreemd id valt stil
  // terug op de dag die vandaag aan de beurt is, in plaats van een leeg scherm te tonen.
  const gevraagd = String((await searchParams)?.dag || "");
  const dag = dagen.find((d) => d.id === gevraagd) || dagen.find((d) => d.id === kiesDagId(dagen, logs, vandaag)) || dagen[0];

  return (
    <SessieScherm
      dag={dag}
      minuten={schatMinuten(dag.exercises)}
      resultaat={sessieResultaat(dag, logs, vandaag)}
    />
  );
}
