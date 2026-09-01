import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { createAdminClient } from "@/lib/supabase/admin";
import { coachAssignProgram, coachDeleteProgram } from "../../coaching-actions";
import Bouwer from "@/components/workouts/Bouwer";
import PublishWorkoutPanel from "@/components/workouts/PublishWorkoutPanel";
import SearchSelect from "@/components/admin/SearchSelect";
import ActionForm from "@/components/ui/ActionForm";
import ConfirmSubmit from "@/components/ui/ConfirmSubmit";

export const dynamic = "force-dynamic";

// De velden die de bouwer nodig heeft om beeld en het detailvenster te tonen. Bewust dezelfde
// lijst als /training gebruikt — wat de coach ziet, is wat het lid ziet.
const EX_FIELDS = "id, name, slug, muscle, category, primary_muscles, secondary_muscles, equipment, difficulty, instructions, tips, image_url, animation_url, video_url, frames";

// De programmabouwer. Herbouwd op 31-08-2026: de oude versie stuurde ~900 oefeningen als prop naar
// een dropdown per dag, deed één serverrit per bewerking en kon niet herordenen. De nieuwe bouwer
// (components/workouts/Bouwer.jsx) houdt alles lokaal en slaat een dag in één rit op.
// /beheer/programmas blijft op de oude editor — dat is het laptopscherm van de eigenaar.
export default async function CoachProgramBuilder({ params }) {
  const { id } = await params;
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  const [{ data: program }, { data: links }] = await Promise.all([
    supabase
      .from("programs")
      .select(
        `id, name, coach_id, is_template, member_id, is_public, slug, subtitle, level, est_minutes, focus, category, description, program_days(id, day_no, name, program_exercises(id, position, sets, reps, rep_text, rest_sec, notes, tempo, target_weight_kg, rpe, superset_group, section, exercises(${EX_FIELDS})))`
      )
      .eq("id", id)
      .single(),
    supabase.from("coach_clients").select("client:profiles!coach_clients_client_id_fkey(id, full_name, email)").eq("coach_id", userId).eq("status", "accepted"),
  ]);

  // Ownership guard: a coach can only open their own programs.
  if (!program || program.coach_id !== userId) {
    return <div className="px-4 py-6 md:px-8 md:py-8">Programma niet gevonden. <Link href="/coach/programmas" className="text-accentdark">Terug</Link></div>;
  }
  const clients = (links || []).map((l) => l.client).filter(Boolean);

  // Dagen gesorteerd, oefeningen op position (id als tweede sleutel houdt rijen van vóór de
  // position-fix stabiel) — exact zoals de ledenkant sorteert.
  const days = [...(program.program_days || [])]
    .sort((a, b) => a.day_no - b.day_no)
    .map((d) => ({
      ...d,
      program_exercises: [...(d.program_exercises || [])]
        .sort((a, b) => (a.position || 0) - (b.position || 0) || String(a.id).localeCompare(String(b.id))),
    }));

  // Voortgang van de client (alleen bij een toegewezen programma) — via de service-rol, want de
  // coach kan de logs van zijn client niet lezen onder RLS.
  let weekActive = 0;
  if (program.member_id) {
    const peIds = days.flatMap((d) => (d.program_exercises || []).map((pe) => pe.id));
    if (peIds.length) {
      const { data: mlogs } = await createAdminClient()
        .from("workout_logs")
        .select("logged_on, created_at")
        .eq("user_id", program.member_id)
        .in("program_exercise_id", peIds)
        .gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .limit(200);
      weekActive = new Set((mlogs || []).map((l) => l.logged_on)).size;
    }
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/coach/programmas" className="text-sm font-semibold text-brand/50 hover:text-brand">← Programma's</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-black text-brand">{program.name}</h1>
        <form action={coachDeleteProgram}>
          <input type="hidden" name="id" value={program.id} />
          <ConfirmSubmit message={program.member_id ? "Dit programma verwijderen? De client verliest dit schema onder 'Training'." : "Dit sjabloon verwijderen?"} className="text-xs font-bold text-red-500 hover:underline">Programma verwijderen</ConfirmSubmit>
        </form>
      </div>

      {/* Assign to one of my clients (a copy is made — the template stays reusable) */}
      <ActionForm action={coachAssignProgram} success="Programma toegewezen ✓" className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-borderc bg-white p-4">
        <input type="hidden" name="programId" value={program.id} />
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Toewijzen aan client</span>
          <SearchSelect name="memberId" defaultValue={program.member_id || ""} placeholder="— Sjabloon (niemand) —" options={[{ value: "", label: "— Sjabloon (niemand) —" }, ...clients.map((c) => ({ value: c.id, label: c.full_name || c.email }))]} />
        </label>
        <ConfirmSubmit message="Programma toewijzen? De gekozen client krijgt een kopie onder 'Training' en een melding." className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white">Opslaan</ConfirmSubmit>
        {program.member_id && (
          <span className="ml-auto text-sm font-semibold text-brand/60">Voortgang: {weekActive} actieve {weekActive === 1 ? "dag" : "dagen"} (7d)</span>
        )}
      </ActionForm>

      {/* Publish this template as a public follow-along workout on /workouts (templates only). */}
      {!program.member_id && (
        <div className="mt-4"><PublishWorkoutPanel program={program} /></div>
      )}

      <div className="mt-6">
        <Bouwer program={{ id: program.id, days }} />
      </div>
    </div>
  );
}
