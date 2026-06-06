import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
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
  const { data: gym } = await supabase.from("gyms").select("*").eq("slug", "fittin").single();
  if (!gym) return <BookingUnavailable />;

  const { data: services } = await supabase
    .from("services")
    .select("*")
    .eq("gym_id", gym.id)
    .eq("active", true)
    .order("price_cents", { ascending: true });

  // Confirmed slots for the next 8 days (generous window; client filters per day).
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + 8 * 86400000);
  // Release abandoned unpaid slots before showing availability, so they're bookable again.
  await supabase.rpc("expire_unpaid_bookings", { p_gym: gym.id });
  const { data: taken } = await supabase.rpc("gym_taken_slots", {
    p_gym: gym.id,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });

  // Coaches + their weekly availability (for PT booking). Admin client: members can't
  // read other profiles via RLS, but coach name/availability is public-facing info.
  const admin = createAdminClient();
  const [{ data: coaches }, { data: availability }] = await Promise.all([
    admin.from("profiles").select("id, full_name").eq("gym_id", gym.id).eq("role", "coach").order("full_name"),
    supabase.from("coach_availability").select("coach_id, weekday, from_hour, to_hour").eq("gym_id", gym.id),
  ]);

  const { user, profile } = await getSessionProfile();

  // Monthly leaderboard (this gym) + my lifetime booked count — a scoreboard shown on the booking page.
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const { data: boardRows } = await admin
    .from("bookings")
    .select("user_id, member:profiles!bookings_user_id_fkey(full_name)")
    .eq("gym_id", gym.id)
    .eq("status", "bevestigd")
    .gte("starts_at", monthStart.toISOString())
    .lt("starts_at", new Date().toISOString());
  const lbCounts = {};
  for (const b of boardRows || []) { const k = b.user_id; (lbCounts[k] ||= { name: b.member?.full_name || "Lid", n: 0 }).n++; }
  const leaderboard = Object.entries(lbCounts).map(([id, v]) => ({ id, ...v })).sort((a, b) => b.n - a.n);

  // Approved, upcoming events (always paid; shown in the "Events" tab of the booking page).
  const nowIso = new Date().toISOString();
  const { data: eventRows } = await admin
    .from("events")
    .select("id, title, description, image_url, faq, starts_at, ends_at, capacity, price_cents, event_signups(user_id, paid)")
    .eq("gym_id", gym.id)
    .eq("status", "approved")
    .gte("starts_at", nowIso)
    .order("starts_at")
    .limit(50);
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
    const { data: activeMember } = await supabase.rpc("has_active_membership", { p_uid: user.id });
    isMember = !!activeMember;
    const { count } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("status", "bevestigd");
    myBooked = count || 0;
    const { data: ledger } = await supabase.from("credits_ledger").select("delta").eq("user_id", user.id);
    credits = (ledger || []).reduce((a, r) => a + r.delta, 0);
    // Accepted buddies (either direction) — to bring along to a session.
    const { data: links } = await supabase
      .from("buddies")
      .select("requester_id, addressee_id, requester:profiles!buddies_requester_id_fkey(id, full_name), addressee:profiles!buddies_addressee_id_fkey(id, full_name)")
      .eq("status", "accepted");
    buddies = (links || []).map((l) => {
      const other = l.requester_id === user.id ? l.addressee : l.requester;
      return { id: other?.id, name: other?.full_name || "Buddy" };
    }).filter((b) => b.id);
  }

  return (
    <>
      <BookingClient
        gym={gym}
        services={services || []}
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
