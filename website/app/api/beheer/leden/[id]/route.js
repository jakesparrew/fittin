import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Aggregated 360° view of one member for the admin side-drawer.
export async function GET(_req, { params }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Geen toegang." }, { status: 403 });
  const { gym } = ctx;
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("id, full_name, email, phone, role, created_at, welcome_status, welcome_code_used, referral_code, coach_public, height_cm, goal_weight_kg")
    .eq("id", id).eq("gym_id", gym.id).maybeSingle();
  if (!profile) return NextResponse.json({ error: "Lid niet gevonden." }, { status: 404 });
  const { data: lastWeight } = await admin.from("body_metrics").select("weight_kg, logged_on").eq("user_id", id).order("logged_on", { ascending: false }).limit(1).maybeSingle();

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const [ledger, membership, bookings, payments, events, coachLink, payReqs, buddies, refs] = await Promise.all([
    admin.from("credits_ledger").select("delta").eq("user_id", id).or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    admin.from("memberships").select("status, current_period_end, cancel_at_period_end").eq("user_id", id).eq("status", "actief").maybeSingle(),
    admin.from("bookings").select("id, starts_at, status, paid, price_cents, persons, services(name), coach:profiles!bookings_coach_id_fkey(full_name)").eq("user_id", id).order("starts_at", { ascending: false }).limit(20),
    admin.from("payments").select("amount_cents, kind, description, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("event_signups").select("paid, created_at, event:events(title, starts_at)").eq("user_id", id).order("created_at", { ascending: false }).limit(20),
    admin.from("coach_clients").select("coach:profiles!coach_clients_coach_id_fkey(id, full_name)").eq("client_id", id).eq("status", "accepted").limit(1).maybeSingle(),
    admin.from("coach_payment_requests").select("amount_cents, status, description, created_at").eq("client_id", id).order("created_at", { ascending: false }).limit(10),
    admin.from("buddies").select("id").eq("status", "accepted").or(`requester_id.eq.${id},addressee_id.eq.${id}`),
    admin.from("referrals").select("id").eq("referrer_id", id),
  ]);

  const credits = (ledger.data || []).reduce((a, r) => a + r.delta, 0);
  const confirmed = (bookings.data || []).filter((b) => b.status === "bevestigd");
  const sessionsThisMonth = confirmed.filter((b) => b.starts_at >= monthStart).length;
  const totalSpent = (payments.data || []).reduce((a, p) => a + (p.amount_cents || 0), 0);

  const { data: coaches } = await admin.from("profiles").select("id, full_name, email").eq("gym_id", gym.id).eq("role", "coach").order("full_name");

  return NextResponse.json({
    profile,
    body: { height_cm: profile.height_cm || null, goal_weight_kg: profile.goal_weight_kg || null, latestWeight: lastWeight?.weight_kg || null },
    credits,
    membership: membership.data || null,
    coach: coachLink.data?.coach || null,
    stats: { totalBooked: confirmed.length, sessionsThisMonth, totalSpentCents: totalSpent, buddies: (buddies.data || []).length, referrals: (refs.data || []).length },
    bookings: bookings.data || [],
    payments: payments.data || [],
    events: (events.data || []).map((e) => ({ title: e.event?.title || "Event", startsAt: e.event?.starts_at, paid: e.paid, created_at: e.created_at })),
    paymentRequests: payReqs.data || [],
    coaches: coaches || [],
  }, { headers: { "Cache-Control": "no-store" } });
}
