import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getGymCached, getServicesCached } from "@/lib/cache";

// Eén bron voor de prijzen in de publieke copy.
//
// Waarom: de beheerder kan de prijs en de zaalcapaciteit live wijzigen op /beheer/diensten
// (app/beheer/actions.js → upsertService) en create_booking rekent met diezelfde rijen. Elk bedrag
// dat in een pagina getypt staat, kan die rij dus stilzwijgend tegenspreken — en dan liegt de
// marketing over wat de kassa aanrekent. /lidmaatschap las al uit de databank; de homepage en
// /degym stonden vol literals.

const euro = (c) => "€ " + (c / 100).toFixed(2).replace(".", ",");
// Ronde bedragen zonder ",00", maar zodra er centen zijn tonen we ze wél: een afgerond bedrag naast
// een betaalknop is een prijsvermelding die niet klopt met wat Stripe aanrekent (art. VI.46 §2 WER).
const price = (c) => (c % 100 === 0 ? "€ " + Math.round(c / 100) : euro(c));

// Pakketten wijzigen zelden en de homepage is de drukste pagina: houd ze in de Data Cache, net als
// gym en services. Tag "packages" zodat een toekomstige revalidateTag ze meteen kan verversen.
const getPackagesCached = unstable_cache(
  async (gymId) => {
    const admin = createAdminClient();
    const { data } = await admin
      .from("packages")
      .select("kind, name, price_cents, credits, period")
      .eq("gym_id", gymId)
      .eq("active", true)
      .order("sort");
    return data || [];
  },
  ["public-packages"],
  { revalidate: 300, tags: ["packages"] }
);

/**
 * Publieke prijsfeiten, of null als ze niet op te halen zijn. Null betekent: noem géén bedrag.
 * Liever een pagina zonder prijs dan een pagina met een verouderde prijs.
 */
export async function getPublicPricing() {
  try {
    const gym = await getGymCached();
    if (!gym?.id) return null;
    const [services, packages] = await Promise.all([getServicesCached(gym.id), getPackagesCached(gym.id)]);
    const svc = (services || []).find((s) => s.type === "fit60");
    if (!svc?.price_cents) return null;
    const card = (packages || []).find((p) => p.kind === "beurtenkaart") || null;
    const abo = (packages || []).find((p) => p.kind === "abonnement") || null;
    const cardPerSessionCents = card?.credits ? Math.round(card.price_cents / card.credits) : null;
    return {
      singleCents: svc.price_cents,
      memberCents: svc.member_price_cents ?? null,
      capacity: svc.capacity ?? null,
      card: card && { name: card.name, cents: card.price_cents, credits: card.credits, perSessionCents: cardPerSessionCents },
      abo: abo && { name: abo.name, cents: abo.price_cents, credits: abo.credits },
      // "Beste prijs per sessie" is een claim, geen sierstrik: enkel tonen zolang het rekenwerk ze
      // waarmaakt. Zelfde regel als op /lidmaatschap.
      aboIsCheapest:
        svc.member_price_cents != null &&
        svc.member_price_cents < svc.price_cents &&
        (cardPerSessionCents == null || svc.member_price_cents < cardPerSessionCents),
    };
  } catch {
    // Een prijsuitlezing mag een marketingpagina nooit doen crashen.
    return null;
  }
}

export { euro, price };
