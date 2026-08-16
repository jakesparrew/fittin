import Link from "next/link";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AddMemberForm } from "@/components/admin/MemberControls";
import MemberDrawer from "@/components/admin/MemberDrawer";
import MembersTable from "@/components/admin/MembersTable";
import ActionForm from "@/components/ui/ActionForm";
import { enrollAllAtRiskInComeback } from "../insight-actions";

export const dynamic = "force-dynamic";

export default async function Leden({ searchParams }) {
  const ctx = await getAdminContext();
  if (!ctx) return null;
  const { supabase, gym, profile } = ctx;
  const sp = (await searchParams) || {};
  const atRiskOnly = sp.filter === "atrisk";

  const adminDb = createAdminClient();
  const [{ data: members }, { data: ledger }, { data: links }, { data: doorRows }, { data: subs }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, welcome_code_used, created_at").eq("gym_id", gym.id).order("created_at", { ascending: false }),
    supabase.rpc("gym_credit_balances", { p_gym: gym.id }),
    supabase.from("coach_clients").select("client_id, coach:profiles!coach_clients_coach_id_fkey(full_name, email)").eq("gym_id", gym.id).eq("status", "accepted"),
    adminDb.from("door_log").select("user_id, opened_at").eq("gym_id", gym.id).eq("result", "ok").order("opened_at", { ascending: false }).limit(5000),
    supabase.from("memberships").select("user_id, status, started_at, current_period_end, cancel_at_period_end").eq("gym_id", gym.id),
  ]);

  const credits = {};
  for (const r of ledger || []) credits[r.user_id] = Number(r.balance || 0);
  // Subscription (abo) status per member — shown so the owner sees who is a subscriber at a glance.
  const subOf = {};
  for (const s of subs || []) subOf[s.user_id] = s;
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

  // At-risk filter (Batch 6.4): members (lid) who never visited or whose last visit is > 30 days ago,
  // sorted oldest-visit first — the owner's one-tap outreach list.
  const d30 = Date.now() - 30 * 86400000;
  let shown = members || [];
  if (atRiskOnly) {
    shown = shown
      .filter((m) => m.role === "lid" && (!lastVisit[m.id] || new Date(lastVisit[m.id]).getTime() < d30))
      .sort((a, b) => (new Date(lastVisit[a.id] || 0).getTime()) - (new Date(lastVisit[b.id] || 0).getTime()));
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <MemberDrawer />
      <h1 className="text-3xl font-black text-brand">Leden</h1>
      {atRiskOnly ? (
        <p className="mt-1 text-sm text-brand/50">
          {shown.length} leden die al {">"}30 dagen niet kwamen — oudste eerst. <Link href="/beheer/leden" className="font-bold text-accentdark hover:underline">Toon alle leden</Link>
        </p>
      ) : (
        <p className="mt-1 text-sm text-brand/50">{(members || []).length} accounts · klik een naam voor het volledige overzicht.</p>
      )}

      {isBeheerder && !atRiskOnly && <div className="mt-6"><AddMemberForm /></div>}

      {/* Eén knop voor de hele lijst: wie individueel mailen te veel werk vindt, doet het in bulk.
          De reeks is idempotent (wie er al in zit of zich uitschreef, wordt overgeslagen) — de knop
          twee keer indrukken kan dus geen tweede mailgolf veroorzaken. */}
      {isBeheerder && atRiskOnly && shown.length > 0 && (
        <div className="mt-4 rounded-2xl border-2 border-accent/50 bg-accent/5 p-4">
          <p className="text-sm font-bold text-brand">Alle {shown.length} in één keer terughalen?</p>
          <p className="mt-0.5 text-xs text-brand/55">Start de comeback-reeks (2 mails over 5 dagen) voor iedereen hieronder. Wie er al in zit of zich uitschreef, wordt automatisch overgeslagen.</p>
          <ActionForm action={enrollAllAtRiskInComeback} className="mt-2">
            <button className="rounded-full bg-accent px-5 py-2 text-sm font-black text-brand transition hover:opacity-90">📬 Start comeback-reeks voor iedereen</button>
          </ActionForm>
        </div>
      )}

      <MembersTable members={shown} credits={credits} coachOf={coachOf} lastLogin={lastLogin} lastVisit={lastVisit} subOf={subOf} isBeheerder={isBeheerder} winback={atRiskOnly} />
    </div>
  );
}
