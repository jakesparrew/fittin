import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { AddMemberForm } from "@/components/admin/MemberControls";
import MemberDrawer from "@/components/admin/MemberDrawer";
import MembersTable from "@/components/admin/MembersTable";

export const dynamic = "force-dynamic";

export default async function Leden() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;

  const [{ data: members }, { data: ledger }, { data: links }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, welcome_code_used, created_at").eq("gym_id", gym.id).order("created_at", { ascending: false }),
    supabase.from("credits_ledger").select("user_id, delta").eq("gym_id", gym.id).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    supabase.from("coach_clients").select("client_id, coach:profiles!coach_clients_coach_id_fkey(full_name, email)").eq("gym_id", gym.id).eq("status", "accepted"),
  ]);

  const credits = {};
  for (const r of ledger || []) credits[r.user_id] = (credits[r.user_id] || 0) + r.delta;
  const coachOf = {};
  for (const l of links || []) (coachOf[l.client_id] ||= []).push(l.coach?.full_name || l.coach?.email || "Coach");
  const isBeheerder = profile.role === "beheerder";

  return (
    <div className="px-8 py-8">
      <MemberDrawer />
      <h1 className="text-3xl font-black text-brand">Leden</h1>
      <p className="mt-1 text-sm text-brand/50">{(members || []).length} accounts · klik een naam voor het volledige overzicht.</p>

      {isBeheerder && <div className="mt-6"><AddMemberForm /></div>}

      <MembersTable members={members || []} credits={credits} coachOf={coachOf} isBeheerder={isBeheerder} />
    </div>
  );
}
