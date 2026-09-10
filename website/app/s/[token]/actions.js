"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { magCoaching } from "@/lib/coaching/toegang.js";

// Afvinken vanuit de deurcodemail, zonder login.
//
// De sleutel is `bookings.report_token`: hij bestaat al per boeking, zit al in diezelfde mail (het
// meldpunt en de sterrenvraag gebruiken hem) en heeft al een levensduur die bij één sessie hoort.
// Een tweede token bijmaken zou hetzelfde risico verdubbelen zonder iets toe te voegen.
//
// Wat iemand met een gestolen link kan: één sessie van iemand anders afvinken of dat vinkje weer
// weghalen. Geen gegevens lezen, geen geld, geen deur. Daarom mag deze sleutel goedkoop zijn.
//
// Het venster is bewust smal aan beide kanten:
//   • vóór de start van de sessie werkt hij niet — een vinkje vóór de training is verkeerde data,
//     en de mail valt vijf minuten vóór aanvang in de bus;
//   • tot 96 uur na afloop, hetzelfde venster als /f/{token} en het meldpunt. Daarna is de week
//     toch al door de zondagcron verwerkt en zou een laat vinkje niets meer sturen.

const kort = (v, n) => String(v ?? "").trim().slice(0, n);
const VENSTER_NA = 96 * 3600000;

/**
 * De sessie achter deze token, of null. Doet zelf geen enkele wijziging.
 * @returns {null | {status:string, sessie?:object, boeking:object, week?:object, plan?:object}}
 */
export async function sessieVanToken(token) {
  const t = kort(token, 64);
  if (t.length < 10) return null;
  const admin = createAdminClient();

  const { data: boeking } = await admin.from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, status")
    .eq("report_token", t).maybeSingle();
  if (!boeking || boeking.status !== "bevestigd") return null;
  if (Date.now() > new Date(boeking.ends_at).getTime() + VENSTER_NA) return null;

  // Dezelfde poort als overal elders. Een lid dat buiten de proefgroep valt, hoort deze pagina niet
  // te kunnen bedienen — ook niet met een geldige link uit een oudere mail.
  const { data: lid } = await admin.from("profiles")
    .select("id, email, role, full_name").eq("id", boeking.user_id).maybeSingle();
  if (!magCoaching(lid)) return null;

  // De sessie die aan déze boeking hangt. `workoutVoorBoeking` koppelt ze op het moment dat de
  // deurcode vertrekt, dus voor elke mail met een workout erin bestaat deze rij.
  const { data: sessie } = await admin.from("coaching_sessions")
    .select("id, week_id, volgnummer, gedaan_at, oordeel, program_day_id")
    .eq("booking_id", boeking.id).maybeSingle();
  if (!sessie) return { status: "geen_sessie", boeking, lid };

  const { data: week } = await admin.from("coaching_weeks")
    .select("id, plan_id, weeknummer, program_id, completed_at").eq("id", sessie.week_id).maybeSingle();
  const { data: plan } = week
    ? await admin.from("coaching_plans").select("id, weken, status").eq("id", week.plan_id).maybeSingle()
    : { data: null };

  // Hoe ver staat de week? Dat bepaalt wat er ná de tik op het scherm komt.
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
    status: "ok",
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
export async function vinkAfViaToken(token, oordeel) {
  const d = await sessieVanToken(token);
  if (!d || d.status !== "ok") return { error: "Deze link werkt niet meer." };
  if (!d.begonnen) return { error: "Je sessie is nog niet begonnen." };
  if (!["te_licht", "goed", "te_zwaar"].includes(oordeel)) return { error: "Onbekend antwoord." };

  const admin = createAdminClient();
  const { error } = await admin.from("coaching_sessions")
    .update({ gedaan_at: d.sessie.gedaan_at || new Date().toISOString(), oordeel })
    .eq("id", d.sessie.id);
  if (error) return { error: "Bewaren lukte niet." };
  return { ok: true };
}

/** Het vinkje weghalen. Wie per ongeluk tikte, moet dat kunnen terugdraaien zonder in te loggen. */
export async function haalVinkjeWeg(token) {
  const d = await sessieVanToken(token);
  if (!d || d.status !== "ok") return { error: "Deze link werkt niet meer." };

  const admin = createAdminClient();
  const { error } = await admin.from("coaching_sessions")
    .update({ gedaan_at: null, oordeel: null }).eq("id", d.sessie.id);
  if (error) return { error: "Bewaren lukte niet." };
  return { ok: true };
}
