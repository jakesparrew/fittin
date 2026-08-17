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
  const [{ data: members }, { data: ledger }, { data: links }, { data: sessies }, { data: subs }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, welcome_code_used, created_at").eq("gym_id", gym.id).order("created_at", { ascending: false }),
    supabase.rpc("gym_credit_balances", { p_gym: gym.id }),
    supabase.from("coach_clients").select("client_id, coach:profiles!coach_clients_coach_id_fkey(full_name, email)").eq("gym_id", gym.id).eq("status", "accepted"),
    // "Laatste bezoek" komt uit de bevestigde boekingen, dezelfde bron als de rest van de app.
    // Het door_log was hier de verkeerde meting: wie met zijn persoonlijke keypadcode binnengaat
    // laat daar geen spoor na, en stond dus bovenaan de at-risk-lijst terwijl hij elke week traint.
    supabase.from("bookings").select("user_id, starts_at").eq("gym_id", gym.id).eq("status", "bevestigd").order("starts_at", { ascending: false }),
    supabase.from("memberships").select("user_id, status, started_at, current_period_end, cancel_at_period_end").eq("gym_id", gym.id),
  ]);

  const credits = {};
  for (const r of ledger || []) credits[r.user_id] = Number(r.balance || 0);
  // Subscription (abo) status per member — shown so the owner sees who is a subscriber at a glance.
  const subOf = {};
  for (const s of subs || []) subOf[s.user_id] = s;
  const coachOf = {};
  for (const l of links || []) (coachOf[l.client_id] ||= []).push(l.coach?.full_name || l.coach?.email || "Coach");

  // Laatste voorbije sessie per lid (rijen staan aflopend → de eerste die we zien is de recentste),
  // plus of er nog iets in de agenda staat: wie volgende week komt trainen is niet at-risk.
  const nu = Date.now();
  const lastVisit = {};
  const komtNog = new Set();
  for (const r of sessies || []) {
    if (!r.user_id) continue;
    if (new Date(r.starts_at).getTime() > nu) komtNog.add(r.user_id);
    else if (!lastVisit[r.user_id]) lastVisit[r.user_id] = r.starts_at;
  }

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

  // At-risk = een lid dat WEL al getraind heeft, al meer dan 30 dagen niet meer kwam en ook niets
  // meer in de agenda heeft staan. Oudste eerst — de outreach-lijst van de eigenaar.
  // Leden met nul sessies staan er bewust niet in: die zijn nooit begonnen en horen in de
  // onboarding-reeks, niet in een comeback-mail die naar hun "vorige bezoek" verwijst.
  const d30 = nu - 30 * 86400000;
  const isAtRisk = (m) =>
    m.role === "lid" && !!lastVisit[m.id] && !komtNog.has(m.id) && new Date(lastVisit[m.id]).getTime() < d30;
  let shown = members || [];
  if (atRiskOnly) {
    shown = shown
      .filter(isAtRisk)
      .sort((a, b) => (new Date(lastVisit[a.id] || 0).getTime()) - (new Date(lastVisit[b.id] || 0).getTime()));
  }

  return (
    <div className="px-4 py-6 md:px-8 md:py-8">
      <MemberDrawer />
      <h1 className="text-3xl font-black text-brand">Leden</h1>
      {atRiskOnly ? (
        <p className="mt-1 text-sm text-brand/50">
          {shown.length} leden die al {">"}30 dagen niet trainden en niets meer geboekt hebben — oudste eerst. <Link href="/beheer/leden" className="font-bold text-accentdark hover:underline">Toon alle leden</Link>
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
