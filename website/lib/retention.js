import { createAdminClient } from "@/lib/supabase/admin";

// Bewaartermijnen effectief afdwingen. Het privacybeleid noemt concrete termijnen, maar er stond
// niets dat ze uitvoerde: logs bleven eeuwig staan. Eén opruimstap die meelift op de bestaande
// dagelijkse cron — geen nieuwe infrastructuur, geen scherm, geen instelling.
//
// Bewust ALLEEN loggegevens zonder identiteitswaarde:
//  • page_views  — 14 maanden. Bevat geen PII (dagelijkse, onomkeerbare bezoekershash).
//  • client_errors — 12 maanden.
//  • door_log    — 12 maanden (veiligheid van een onbemande zaal; termijn uit het beleid).
//
// Betalingen en facturen blijven ongemoeid: 7 jaar boekhoudplicht, zo staat het ook op de pagina.
// Slapende PROFIELEN worden hier bewust niet aangeraakt — een lid anonimiseren is onomkeerbaar en
// zou iemand raken die gewoon een half jaar niet kwam. We tellen ze enkel, zodat de eigenaar de
// jaarlijkse opkuis bewust kan doen (owner-regel: nooit destructieve ops op productie zonder zijn
// beslissing).
const MAAND = 30 * 86400000;

async function wis(admin, tabel, kolom, maanden) {
  const grens = new Date(Date.now() - maanden * MAAND).toISOString();
  const { error, count } = await admin
    .from(tabel)
    .delete({ count: "exact" })
    .lt(kolom, grens);
  if (error) {
    console.error(`opruimen ${tabel} mislukt:`, error.message);
    return null;
  }
  return count ?? 0;
}

export async function purgeExpiredData() {
  const admin = createAdminClient();
  const out = {
    page_views: await wis(admin, "page_views", "created_at", 14),
    client_errors: await wis(admin, "client_errors", "created_at", 12),
    door_log: await wis(admin, "door_log", "opened_at", 12),
    // 0150. Zonder deze twee regels belooft het privacybeleid een bewaartermijn die nergens wordt
    // uitgevoerd — precies de les die bovenaan dit bestand staat. 24 maanden: lang genoeg om te
    // zien of een toestel telkens opnieuw stuk gaat, kort genoeg om geen jarenlang archief van
    // klachten met foto's aan te leggen.
    problem_reports: await wis(admin, "problem_reports", "created_at", 24),
    session_feedback: await wis(admin, "session_feedback", "created_at", 24),
  };

  // Slapende leden: tellen, niet aanraken. Iemand zonder bevestigde sessie in 12 maanden én zonder
  // lopend abonnement is kandidaat voor de opkuis die het beleid belooft.
  try {
    const grens = new Date(Date.now() - 12 * MAAND).toISOString();
    const [{ data: leden }, { data: recent }, { data: abos }] = await Promise.all([
      admin.from("profiles").select("id").eq("role", "lid"),
      admin.from("bookings").select("user_id").eq("status", "bevestigd").gte("starts_at", grens),
      admin.from("memberships").select("user_id").in("status", ["actief", "past_due"]),
    ]);
    const actief = new Set([...(recent || []).map((r) => r.user_id), ...(abos || []).map((m) => m.user_id)]);
    out.slapendeLeden = (leden || []).filter((p) => !actief.has(p.id)).length;
  } catch (e) {
    console.error("slapende leden tellen mislukt:", e?.message);
  }

  return out;
}
