import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Versie van de juridische documenten. Bij elke inhoudelijke wijziging OPHOGEN: zo weet je later
// welke tekst iemand precies aanvaard heeft. Dit is het verschil tussen "hij ging akkoord" en
// "hij ging akkoord met déze tekst" — enkel het tweede is bruikbaar in een geschil.
export const TERMS_VERSION = "v2 — 2026-08-05";
export const PRIVACY_VERSION = "v2 — 2026-08-05";

// Leg een aanvaarding vast. Nooit blokkerend: als het wegschrijven faalt mag een betaalde aankoop
// niet stukgaan — maar we loggen het luid, want een ontbrekend bewijs is een reëel juridisch gat.
export async function recordConsent({ gymId, userId, kind, context, docVersion = TERMS_VERSION }) {
  if (!userId || !kind) return;
  try {
    await createAdminClient().from("legal_consents").insert({
      gym_id: gymId || null, user_id: userId, kind, context: context || null, doc_version: docVersion,
    });
  } catch (e) {
    console.error("legal consent niet vastgelegd:", kind, context, e?.message);
  }
}

// Heeft dit lid een lopende (niet-ingetrokken) toestemming van dit type?
export async function hasConsent(admin, userId, kind) {
  if (!userId) return false;
  try {
    const { data } = await admin
      .from("legal_consents")
      .select("id")
      .eq("user_id", userId).eq("kind", kind).is("withdrawn_at", null)
      .limit(1);
    return !!(data && data.length);
  } catch {
    return false;
  }
}
