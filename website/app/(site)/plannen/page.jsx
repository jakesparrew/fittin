import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createPlan, copyTemplate, setActivePlan, deletePlan } from "./actions";
import SubmitButton from "@/components/ui/SubmitButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mijn trainingsplannen | Fittin'" };

const exCount = (p) => (p.program_days || []).reduce((a, d) => a + (d.program_exercises || []).length, 0);

export default async function Plannen() {
  if (!isSupabaseConfigured) redirect("/");
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login?next=/plannen");

  const supabase = await createClient();
  const { data: plans } = await supabase
    .from("programs")
    .select("id, name, is_active, coach_id, created_at, coach:profiles!programs_coach_id_fkey(full_name), program_days(id, program_exercises(id))")
    .eq("member_id", user.id)
    .eq("is_template", false)
    .order("created_at", { ascending: false });

  let templates = [];
  if (profile?.gym_id) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("programs")
      .select("id, name, program_days(id, program_exercises(id))")
      .eq("gym_id", profile.gym_id)
      .eq("is_template", true)
      .is("member_id", null)
      .order("name");
    templates = data || [];
  }

  return (
    <main className="bg-paper min-h-screen">
      <div className="mx-auto max-w-3xl px-5 py-16">
        <Link href="/training" className="text-sm font-bold text-brand/60 hover:text-brand">← Mijn training</Link>
        <h1 className="mt-4 text-3xl font-black md:text-4xl">Mijn trainingsplannen</h1>
        <p className="mt-2 text-brand/60">Bouw je eigen plan, kies een sjabloon, of laat de AI er een opstellen. Het actieve plan verschijnt in “Mijn training”.</p>

        <div className="mt-6 flex flex-wrap gap-3">
          <form action={createPlan} className="flex gap-2">
            <input name="name" placeholder="Naam van je plan" aria-label="Naam van je plan" className="rounded-full border-2 border-borderc bg-white px-4 py-2.5 text-sm text-brand outline-none focus:border-accent" />
            <SubmitButton className="rounded-full bg-accent px-5 py-2.5 text-sm font-black text-brand">+ Nieuw plan</SubmitButton>
          </form>
          <Link href="/plannen/genereer" className="rounded-full bg-brand px-5 py-2.5 text-sm font-black text-white transition hover:opacity-90">✨ Genereer met AI</Link>
        </div>

        {/* Member's plans */}
        <div className="mt-8 space-y-3">
          {(plans || []).map((p) => (
            <div key={p.id} className={"rounded-2xl border bg-white p-5 " + (p.is_active ? "border-accent ring-1 ring-accent/40" : "border-borderc")}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-brand">{p.name}</p>
                    {p.is_active && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-black text-brand">ACTIEF</span>}
                    {p.coach && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brand/50">van {p.coach.full_name}</span>}
                  </div>
                  <p className="mt-0.5 text-xs text-brand/50">{(p.program_days || []).length} dagen · {exCount(p)} oefeningen</p>
                </div>
                <div className="flex items-center gap-2">
                  {!p.is_active && (
                    <form action={setActivePlan}><input type="hidden" name="id" value={p.id} /><button className="rounded-full border-2 border-borderc px-3.5 py-1.5 text-xs font-bold text-brand hover:border-accent">Maak actief</button></form>
                  )}
                  <Link href={`/plannen/${p.id}`} className="rounded-full bg-paper px-3.5 py-1.5 text-xs font-bold text-brand hover:bg-accent/15">Bewerk</Link>
                  <form action={deletePlan}><input type="hidden" name="id" value={p.id} /><button className="text-xs font-bold text-red-400 hover:text-red-600">verwijder</button></form>
                </div>
              </div>
            </div>
          ))}
          {(!plans || plans.length === 0) && (
            <div className="rounded-3xl border border-dashed border-borderc bg-white p-8 text-center text-sm text-brand/60">
              Nog geen plan. Maak er een, kies een sjabloon hieronder, of genereer er een met AI.
            </div>
          )}
        </div>

        {/* Templates */}
        {templates.length > 0 && (
          <>
            <h2 className="mt-10 text-sm font-bold uppercase tracking-widest text-lav">Kies een sjabloon</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {templates.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-2xl border border-borderc bg-white p-5">
                  <div>
                    <p className="font-black text-brand">{t.name}</p>
                    <p className="text-xs text-brand/50">{(t.program_days || []).length} dagen · {exCount(t)} oefeningen</p>
                  </div>
                  <form action={copyTemplate}><input type="hidden" name="templateId" value={t.id} /><SubmitButton className="rounded-full bg-accent px-4 py-2 text-xs font-black text-brand">Gebruik dit</SubmitButton></form>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
