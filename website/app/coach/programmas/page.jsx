import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import { coachCreateProgram } from "../coaching-actions";
import SearchSelect from "@/components/admin/SearchSelect";
import ActionForm from "@/components/ui/ActionForm";

export const dynamic = "force-dynamic";

export default async function CoachProgrammas() {
  const ctx = await getCoachContext();
  if (!ctx) return null;
  const { supabase, userId } = ctx;

  const [{ data: programs }, { data: links }] = await Promise.all([
    supabase.from("programs").select("id, name, is_template, member_id, program_days(id)").eq("coach_id", userId).order("created_at", { ascending: false }),
    supabase.from("coach_clients").select("client:profiles!coach_clients_client_id_fkey(id, full_name, email)").eq("coach_id", userId).eq("status", "accepted"),
  ]);
  const clients = (links || []).map((l) => l.client).filter(Boolean);
  const memberName = {};
  for (const c of clients) memberName[c.id] = c.full_name || c.email;

  const templates = (programs || []).filter((p) => !p.member_id);
  const assigned = (programs || []).filter((p) => p.member_id);

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <Link href="/coach" className="text-sm font-semibold text-brand/50 hover:text-brand">← Dashboard</Link>
      <h1 className="mt-2 text-3xl font-black text-brand">Programma's</h1>
      <p className="mt-1 text-sm text-brand/50">Bouw trainingsschema's en wijs ze toe aan je clienten. Zij volgen ze mee onder “Training”.</p>

      {/* Create */}
      <ActionForm action={coachCreateProgram} success="Programma aangemaakt ✓" className="mt-6 flex flex-wrap items-end gap-3 rounded-3xl border-2 border-accent bg-white p-6 shadow-sm shadow-accent/10">
        <label className="block flex-1 min-w-[16rem]">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Naam</span>
          <input name="name" required placeholder="bv. Full body — 3x/week" className="w-full rounded-lg border-2 border-borderc px-3 py-2 text-sm" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Startpunt</span>
          <select name="preset" defaultValue="" className="rounded-lg border-2 border-borderc px-3 py-2 text-sm">
            <option value="">Leeg (1 dag)</option>
            <option value="full_body_3">Full body — 3 dagen</option>
            <option value="upper_lower_4">Upper/Lower — 4 dagen</option>
            <option value="ppl_3">Push/Pull/Benen — 3 dagen</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-lav">Direct toewijzen aan (optioneel)</span>
          <SearchSelect name="memberId" placeholder="— Template (niemand) —" options={[{ value: "", label: "— Template (niemand) —" }, ...clients.map((c) => ({ value: c.id, label: c.full_name || c.email }))]} />
        </label>
        <button className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-brand transition hover:opacity-90">+ Programma aanmaken</button>
      </ActionForm>

      {/* Templates */}
      <h2 className="mt-8 text-xl font-black text-brand">Sjablonen</h2>
      {templates.length === 0 ? (
        <p className="mt-2 text-sm text-brand/50">Nog geen sjablonen. Maak er een aan en wijs het later toe aan een client.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((p) => (
            <Link key={p.id} href={`/coach/programmas/${p.id}`} className="rounded-2xl border border-borderc bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md">
              <p className="font-black text-brand">{p.name}</p>
              <p className="mt-1 text-xs text-brand/45">{(p.program_days || []).length} {(p.program_days || []).length === 1 ? "dag" : "dagen"} · sjabloon</p>
            </Link>
          ))}
        </div>
      )}

      {/* Assigned */}
      {assigned.length > 0 && (
        <>
          <h2 className="mt-8 text-xl font-black text-brand">Toegewezen aan clienten</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {assigned.map((p) => (
              <Link key={p.id} href={`/coach/programmas/${p.id}`} className="rounded-2xl border border-borderc bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-md">
                <p className="font-black text-brand">{p.name}</p>
                <p className="mt-1 text-xs text-accentdark">→ {memberName[p.member_id] || "client"}</p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
