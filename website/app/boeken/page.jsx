import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
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

  const { user, profile } = await getSessionProfile();

  return (
    <BookingClient
      gym={gym}
      services={services || []}
      takenSlots={(taken || []).map((t) => t.starts_at)}
      isLoggedIn={!!user}
      welcomeAvailable={!!(profile && !profile.welcome_code_used)}
      paymentCanceled={sp.geannuleerd === "1"}
    />
  );
}
