import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddMemberForm } from "@/components/admin/MemberControls";
import MemberDrawer from "@/components/admin/MemberDrawer";
import MembersTable from "@/components/admin/MembersTable";

export const dynamic = "force-dynamic";

export default async function Leden() {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;

  const adminDb = createAdminClient();
  const [{ data: members }, { data: ledger }, { data: links }, { data: doorRows }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, welcome_code_used, created_at").eq("gym_id", gym.id).order("created_at", { ascending: false }),
    supabase.rpc("gym_credit_balances", { p_gym: gym.id }),
    supabase.from("coach_clients").select("client_id, coach:profiles!coach_clients_coach_id_fkey(full_name, email)").eq("gym_id", gym.id).eq("status", "accepted"),
    adminDb.from("door_log").select("user_id, opened_at").eq("gym_id", gym.id).eq("result", "ok").order("opened_at", { ascending: false }).limit(5000),
  ]);

  const credits = {};
  for (const r of ledger || []) credits[r.user_id] = r.balance;
  const coachOf = {};
  for (const l of links || []) (coachOf[l.client_id] ||= []).push(l.coach?.full_name || l.coach?.email || "Coach");

  // Last gym visit per member (door_log rows are desc → first seen per user is the latest).
  const lastVisit = {};
  for (const r of doorRows || []) if (r.user_id && !lastVisit[r.user_id]) lastVisit[r.user_id] = r.opened_at;

  // Last login per member, from Supabase Auth (paged; gyms stay well under 10k accounts).
  const lastLogin = {};
  try {
    for (let page = 1; page <= 10; page++) {
      const { data: au } = await adminDb.auth.admin.listUsers({ page, perPage: 1000 });
      const us = au?.users || [];
      for (const u of us) if (u.last_sign_in_at) lastLogin[u.id] = u.last_sign_in_at;
      if (us.length < 1000) break;
    }
  } catch {}

  const isBeheerder = profile.role === "beheerder";

  return (
    <div className="px-8 py-8">
      <MemberDrawer />
      <h1 className="text-3xl font-black text-brand">Leden</h1>
      <p className="mt-1 text-sm text-brand/50">{(members || []).length} accounts · klik een naam voor het volledige overzicht.</p>

      {isBeheerder && <div className="mt-6"><AddMemberForm /></div>}

      <MembersTable members={members || []} credits={credits} coachOf={coachOf} lastLogin={lastLogin} lastVisit={lastVisit} isBeheerder={isBeheerder} />
    </div>
  );
}
