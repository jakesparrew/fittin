import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import BookingClient from "@/components/booking/BookingClient";
import BookingUnavailable from "@/components/booking/BookingUnavailable";

export const metadata = {
  title: "Online boeken | Fittin'",
  description:
    "Reserveer de privégym in Gent — alleen of met vrienden. €11 per sessie van 1u15. Eerste sessie gratis met FittinWelcome.",
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

  let credits = 0;
  if (user) {
    const { data: ledger } = await supabase.from("credits_ledger").select("delta").eq("user_id", user.id);
    credits = (ledger || []).reduce((a, r) => a + r.delta, 0);
  }

  return (
    <BookingClient
      gym={gym}
      services={services || []}
      takenSlots={(taken || []).map((t) => t.starts_at)}
      coaches={coaches || []}
      availability={availability || []}
      isLoggedIn={!!user}
      welcomeAvailable={!!(profile && profile.welcome_status === "eligible" && !profile.welcome_code_used)}
      creditBalance={credits}
      paymentCanceled={sp.geannuleerd === "1"}
    />
  );
}
