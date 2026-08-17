import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { getGymCached, getServicesCached, getPublicCoachesCached, getCoachAvailabilityCached } from "@/lib/cache";
import BookingClient from "@/components/booking/BookingClient";
import BookingUnavailable from "@/components/booking/BookingUnavailable";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

export const metadata = {
  title: "Online boeken | Fittin'",
  description:
    "Reserveer de privégym in Gent — alleen of met vrienden. € 15 per sessie van 1 uur, en je eerste uur is gratis.",
  // Deze pagina leest ?personen en ?duur (en client-side ?d=&h=&p=&u= uit gedeelde links).
  // Zonder canonical indexeert elke variant als een aparte pagina.
  alternates: { canonical: `${SITE}/boeken` },
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
  // Cover the full member booking horizon (8 weeks) so availability stays accurate that far out.
  const to = new Date(from.getTime() + 63 * 86400000);

  // Verlaten, onbetaalde reserveringen eerst vrijgeven, anders staan net vervallen uren nog als
  // "vol" in het rooster. De RPC is enkel aan authenticated/service_role toegekend: met de
  // ingelogde client faalde hij voor uitgelogde bezoekers stil, en die zien de gym dus voller
  // dan ze is. Vandaar de admin-client én een expliciete foutafhandeling.
  const expiring = admin.rpc("expire_unpaid_bookings", { p_gym: gym.id });
  const [services, coaches, availability, { data: taken }] = await Promise.all([
    getServicesCached(gym.id),
    getPublicCoachesCached(gym.id),
    getCoachAvailabilityCached(gym.id),
    // Enkel deze query moet wachten op het vrijgeven; de rest is er onafhankelijk van.
    (async () => {
      // Een falend vrijgeven mag de boekingspagina nooit neerhalen: het rooster is dan hoogstens
      // te vol, en dat is oneindig veel beter dan geen rooster.
      try {
        const { error: expireError } = await expiring;
        if (expireError) console.error("[boeken] expire_unpaid_bookings:", expireError.message);
      } catch (e) {
        console.error("[boeken] expire_unpaid_bookings:", e?.message || e);
      }
      return supabase.rpc("gym_taken_slots", { p_gym: gym.id, p_from: from.toISOString(), p_to: to.toISOString() });
    })(),
  ]);

  let credits = 0;
  let buddies = [];
  let isMember = false;
  if (user) {
    // User-specific reads in parallel.
    const [{ data: activeMember }, { data: ledger }, { data: links }] = await Promise.all([
      supabase.rpc("has_active_membership", { p_uid: user.id }),
      supabase.rpc("credits_balance", { p_user: user.id }),
      supabase.from("buddies").select("requester_id, addressee_id, requester:profiles!buddies_requester_id_fkey(id, full_name), addressee:profiles!buddies_addressee_id_fkey(id, full_name)").eq("status", "accepted"),
    ]);
    isMember = !!activeMember;
    // Staff-tarief (0114): coaches/beheerders krijgen op de publieke boekingspagina hetzelfde
    // € 12-tarief als members — de UI moet tonen wat create_booking effectief aanrekent.
    if (profile?.role === "coach" || profile?.role === "beheerder") isMember = true;
    credits = Number(ledger) || 0; // numeric (0117) kan als string binnenkomen
    buddies = (links || []).map((l) => {
      const other = l.requester_id === user.id ? l.addressee : l.requester;
      return { id: other?.id, name: other?.full_name || "Buddy" };
    }).filter((b) => b.id);
  }

  return (
    <BookingClient
      gym={gym}
      services={(services || []).filter((s) => s.type !== "event" && s.type !== "pt")}
      takenSlots={(taken || []).map((t) => t.starts_at)}
      coaches={coaches || []}
      availability={availability || []}
      isLoggedIn={!!user}
      welcomeAvailable={!!(profile && profile.welcome_status === "eligible" && !profile.welcome_code_used)}
      creditBalance={credits}
      isMember={isMember}
      buddies={buddies}
      referralCode={profile?.referral_code || ""}
      prefill={{ persons: sp.personen, duration: sp.duur }}
    />
  );
}
