"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { magCoaching } from "@/lib/coaching/toegang.js";

// Afvinken vanuit de deurcodemail, zonder login.
//
// DE SLEUTEL IS `coaching_sessions.afvink_token`, niet `bookings.report_token`.
// De eerste versie leende het meldtoken van de boeking. Dat leek zuinig, en de veiligheid ervan
// leunde op de bewering "de coach krijgt geen workoutblok, dus hij heeft de links niet". Een
// adversariële audit draaide dat om: bij een coach-sessie krijgt de coach dezelfde mail met
// dezelfde token in de meldpuntlink `/m/{token}`, en `/m/` vervangen door `/s/` volstond om de
// sessie van zijn client af te vinken — inclusief het oordeel dat diens progressie stuurt.
// Eén sleutel mag één bevoegdheid dragen. Zie migratie 0160.
//
// SCHRIJVEN GEBEURT ALLEEN VIA POST. Ook dat is een correctie. De mail bevatte eerst drie links
// `?v=goed|te_licht|te_zwaar` die tijdens het renderen schreven, verdedigd met "de mail vertrekt
// vijf minuten vóór de sessie en we weigeren alles vóór starts_at, dus een linkscanner botst
// altijd op die grens". Dat klopt niet: `sendDueAccessCodes` verstuurt in een venster dat tot
// zestien minuten NA de start loopt, en bij een verplaatste boeking gaat de mail opnieuw uit.
// Bovendien bleef `?v=` in de adresbalk staan, zodat "vinkje weghalen" zichzelf bij de eerstvolgende
// render meteen weer terugzette.
//
// Het venster blijft aan beide kanten smal:
//   • niets vóór de start van de sessie — een vinkje vóór de training is verkeerde data;
//   • tot 96 uur na afloop, hetzelfde venster als /f/{token} en het meldpunt.

const kort = (v, n) => String(v ?? "").trim().slice(0, n);
const VENSTER_NA = 96 * 3600000;

/**
 * De sessie achter dit afvinktoken, of null. Doet zelf geen enkele wijziging.
 */
export async function sessieVanToken(token) {
  const t = kort(token, 64);
  if (t.length < 10) return null;
  const admin = createAdminClient();

  const { data: sessie } = await admin.from("coaching_sessions")
    .select("id, week_id, volgnummer, gedaan_at, oordeel, program_day_id, booking_id")
    .eq("afvink_token", t).maybeSingle();
  if (!sessie) return null;

  // De boeking geeft het tijdvenster. Ze bestaat altijd: de token wordt gemunt op hetzelfde moment
  // dat de sessie aan de boeking gekoppeld wordt (lib/coaching/levering.js).
  const { data: boeking } = sessie.booking_id
    ? await admin.from("bookings").select("id, user_id, starts_at, ends_at, status").eq("id", sessie.booking_id).maybeSingle()
    : { data: null };
  if (!boeking || boeking.status !== "bevestigd") return null;
  if (Date.now() > new Date(boeking.ends_at).getTime() + VENSTER_NA) return null;

  const { data: lid } = await admin.from("profiles")
    .select("id, email, role, full_name").eq("id", boeking.user_id).maybeSingle();
  if (!magCoaching(lid)) return null;

  const { data: week } = await admin.from("coaching_weeks")
    .select("id, plan_id, weeknummer").eq("id", sessie.week_id).maybeSingle();
  const { data: plan } = week
    ? await admin.from("coaching_plans").select("id, weken, status").eq("id", week.plan_id).maybeSingle()
    : { data: null };

  const { data: alle } = week
    ? await admin.from("coaching_sessions").select("id, gedaan_at").eq("week_id", week.id)
    : { data: [] };
  const { data: dag } = sessie.program_day_id
    ? await admin.from("program_days").select("name").eq("id", sessie.program_day_id).maybeSingle()
    : { data: null };
  const { data: checkin } = week
    ? await admin.from("coaching_checkins").select("id").eq("week_id", week.id).maybeSingle()
    : { data: null };

  return {
    boeking, lid, sessie, week, plan,
    naam: dag?.name || `Sessie ${sessie.volgnummer}`,
    gepland: (alle || []).length,
    gedaan: (alle || []).filter((s) => s.gedaan_at).length,
    checkinIngevuld: !!checkin,
    begonnen: Date.now() >= new Date(boeking.starts_at).getTime(),
  };
}

/**
 * Het vinkje zetten of het oordeel bijstellen. Idempotent: nog eens op een andere knop tikken
 * corrigeert het oordeel en maakt geen tweede rij — net als de sterren op /f/{token}.
 */
export async function vinkAfViaToken(formData) {
  const token = String(formData?.get?.("token") || "");
  const oordeel = String(formData?.get?.("oordeel") || "");
  const d = await sessieVanToken(token);
  if (!d) return { error: "Deze link werkt niet meer." };
  if (!d.begonnen) return { error: "Je sessie is nog niet begonnen." };
  if (!["te_licht", "goed", "te_zwaar"].includes(oordeel)) return { error: "Onbekend antwoord." };

  const admin = createAdminClient();
  const { error } = await admin.from("coaching_sessions")
    .update({ gedaan_at: d.sessie.gedaan_at || new Date().toISOString(), oordeel })
    .eq("id", d.sessie.id);
  if (error) return { error: "Bewaren lukte niet." };
  revalidatePath(`/s/${token}`);
  revalidatePath("/coaching");
  return { ok: true };
}

/** Het vinkje weghalen. Wie per ongeluk tikte, moet dat kunnen terugdraaien zonder in te loggen. */
export async function haalVinkjeWeg(formData) {
  const token = String(formData?.get?.("token") || "");
  const d = await sessieVanToken(token);
  if (!d) return { error: "Deze link werkt niet meer." };

  const admin = createAdminClient();
  const { error } = await admin.from("coaching_sessions")
    .update({ gedaan_at: null, oordeel: null }).eq("id", d.sessie.id);
  if (error) return { error: "Bewaren lukte niet." };
  revalidatePath(`/s/${token}`);
  revalidatePath("/coaching");
  return { ok: true };
}
