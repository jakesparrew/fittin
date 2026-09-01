import Link from "next/link";
import { getCoachContext } from "@/lib/coach";
import NieuwProgramma from "@/components/workouts/NieuwProgramma";

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

      {/* Aanmaken gebeurt in een wizard: één vraag per scherm, mét uitleg. De oude balk propte
          naam, "Startpunt" en "Direct toewijzen aan" naast elkaar, met "— Template (niemand) —"
          als standaardwaarde — jargon voor wie voor het eerst een schema maakt. */}
      <NieuwProgramma clients={clients.map((c) => ({ id: c.id, full_name: c.full_name, email: c.email }))} />

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
