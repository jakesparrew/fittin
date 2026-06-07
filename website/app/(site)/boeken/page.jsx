import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { getGymCached, getServicesCached, getPublicCoachesCached, getCoachAvailabilityCached } from "@/lib/cache";
import BookingClient from "@/components/booking/BookingClient";
import BookingUnavailable from "@/components/booking/BookingUnavailable";
import LeaderboardCard from "@/components/LeaderboardCard";

export const metadata = {
  title: "Online boeken | Fittin'",
  description:
    "Reserveer de privégym in Gent — alleen of met vrienden. € 15 per sessie van 1 uur. Eerste sessie gratis met FittinWelcome.",
};

export const dynamic = "force-dynamic";

export default async function BoekenPage({ searchParams }) {
  if (!isSupabaseConfigured) return <BookingUnavailable />;
  const sp = (await searchParams) || {};

  const supabase = await createClient();
  const admin = createAdminClient();
  // Cached gym (public, rarely changes) + session in parallel.
  const [gym, sess] = await Promise.all([getGymCached(), getSessionProfile()]);
  if (!gym) return <BookingUnavailable />;
  const { user, profile } = sess;

  const from = new Date(); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 8 * 86400000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const nowIso = new Date().toISOString();

  // Free abandoned unpaid slots first (so availability is correct), then fetch in one batch.
  // services/coaches/availability come from the Data Cache → no DB hit on most renders.
  await supabase.rpc("expire_unpaid_bookings", { p_gym: gym.id });
  const [
    services,
    { data: taken },
    coaches,
    availability,
    { data: boardRows },
    { data: refPts },
    { data: eventRows },
  ] = await Promise.all([
    getServicesCached(gym.id),
    supabase.rpc("gym_taken_slots", { p_gym: gym.id, p_from: from.toISOString(), p_to: to.toISOString() }),
    getPublicCoachesCached(gym.id),
    getCoachAvailabilityCached(gym.id),
    admin.from("bookings").select("user_id, member:profiles!bookings_user_id_fkey(full_name)").eq("gym_id", gym.id).eq("status", "bevestigd").gte("starts_at", monthStart.toISOString()).lt("starts_at", nowIso),
    admin.rpc("referral_points", { p_gym: gym.id, p_since: monthStart.toISOString() }),
    admin.from("events").select("id, title, description, image_url, faq, starts_at, ends_at, capacity, price_cents, event_signups(user_id, paid)").eq("gym_id", gym.id).eq("status", "approved").gte("starts_at", nowIso).order("starts_at").limit(50),
  ]);

  // Monthly leaderboard (sessions + referral bonus points).
  const lbCounts = {};
  for (const b of boardRows || []) { const k = b.user_id; (lbCounts[k] ||= { name: b.member?.full_name || "Lid", n: 0, pts: 0 }).n++; }
  for (const r of refPts || []) { if (r.referrer_id) { (lbCounts[r.referrer_id] ||= { name: "Lid", n: 0, pts: 0 }).pts = r.points; } }
  const missing = Object.keys(lbCounts).filter((id) => lbCounts[id].name === "Lid");
  if (missing.length) {
    const { data: names } = await admin.from("profiles").select("id, full_name").in("id", missing);
    for (const p of names || []) if (lbCounts[p.id]) lbCounts[p.id].name = p.full_name || "Lid";
  }
  const leaderboard = Object.entries(lbCounts).map(([id, v]) => ({ id, ...v, score: v.n + (v.pts || 0) })).sort((a, b) => b.score - a.score);

  const events = (eventRows || []).map((e) => {
    const paidCount = (e.event_signups || []).filter((s) => s.paid).length;
    const mine = user ? (e.event_signups || []).some((s) => s.user_id === user.id && s.paid) : false;
    return { id: e.id, title: e.title, description: e.description, image_url: e.image_url, faq: e.faq || [], starts_at: e.starts_at, ends_at: e.ends_at, capacity: e.capacity, price_cents: e.price_cents, taken: paidCount, mine };
  });

  let credits = 0;
  let buddies = [];
  let myBooked;
  let isMember = false;
  if (user) {
    // User-specific reads in parallel.
    const [{ data: activeMember }, { count }, { data: ledger }, { data: links }] = await Promise.all([
      supabase.rpc("has_active_membership", { p_uid: user.id }),
      admin.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "bevestigd"),
      supabase.from("credits_ledger").select("delta").eq("user_id", user.id),
      supabase.from("buddies").select("requester_id, addressee_id, requester:profiles!buddies_requester_id_fkey(id, full_name), addressee:profiles!buddies_addressee_id_fkey(id, full_name)").eq("status", "accepted"),
    ]);
    isMember = !!activeMember;
    myBooked = count || 0;
    credits = (ledger || []).reduce((a, r) => a + r.delta, 0);
    buddies = (links || []).map((l) => {
      const other = l.requester_id === user.id ? l.addressee : l.requester;
      return { id: other?.id, name: other?.full_name || "Buddy" };
    }).filter((b) => b.id);
  }

  return (
    <>
      <BookingClient
        gym={gym}
        services={(services || []).filter((s) => s.type !== "event")}
        takenSlots={(taken || []).map((t) => t.starts_at)}
        coaches={coaches || []}
        availability={availability || []}
        isLoggedIn={!!user}
        welcomeAvailable={!!(profile && profile.welcome_status === "eligible" && !profile.welcome_code_used)}
        creditBalance={credits}
        isMember={isMember}
        paymentCanceled={sp.geannuleerd === "1"}
        buddies={buddies}
        events={events}
      />
      <div className="bg-paper">
        <div className="mx-auto max-w-6xl px-5 pb-16">
          <LeaderboardCard rows={leaderboard} meId={user?.id} myBooked={myBooked} />
        </div>
      </div>
    </>
  );
}
