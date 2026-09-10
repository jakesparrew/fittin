"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { maakPlan, openVolgendeWeek } from "@/lib/coaching/plan.js";
import { coachAan } from "@/lib/coaching/model.js";
import { zorgVoorMenu, maakWeekmenu, maaltijdenAan, VOEDINGSVOORKEUREN } from "@/lib/coaching/maaltijd.js";
import { magCoaching } from "@/lib/coaching/toegang.js";
import { keurGeboortedatum } from "@/lib/aanmelding-velden";

const MODULES = ["workouts", "mealplan", "motivatie"];

// Alle schrijfwegen van de AI-coach. Elke actie haalt zelf de gebruiker op — nooit een id uit het
// formulier vertrouwen, want dat is de makkelijkste manier om in andermans dossier te schrijven.
//
// Schrijven gebeurt met de service-role: 0157 geeft `authenticated` alleen SELECT op de
// coaching-tabellen. Dat is bewust — een lid mag zijn eigen dossier lezen, maar niet zelf een week
// openzetten of een sessie van iemand anders afvinken.

async function ik() {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) return null;
  // Één poort voor alle acties. Hem per actie herhalen is hem ooit vergeten.
  if (!magCoaching(profile)) return null;
  return { user, profile, admin: createAdminClient() };
}

/** De intake. Eén keer per lid; nadien aanpasbaar op /coaching. */
export async function bewaarIntake(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };

  const doel = String(formData.get("doel") || "").trim();
  const ervaring = String(formData.get("ervaring") || "").trim();
  const dagen = parseInt(formData.get("dagen"), 10);
  const weken = parseInt(formData.get("weken"), 10);
  const toon = String(formData.get("toon") || "rustig").trim();
  const geboorte = keurGeboortedatum(formData.get("geboortedatum"), new Date());
  const gewicht = parseFloat(String(formData.get("gewicht") || "").replace(",", "."));
  const lengte = parseInt(formData.get("lengte"), 10);
  const beperkingen = String(formData.get("beperkingen") || "").trim().slice(0, 500);
  // De toestemming is een aparte, bewuste handeling — geen bijvangst van het formulier.
  const toestemming = String(formData.get("toestemming") || "") === "ja";

  if (!["sterker", "conditie", "afvallen", "spiermassa", "bewegen"].includes(doel)) return { error: "Kies een doel." };
  if (!["nooit", "soms", "vaak"].includes(ervaring)) return { error: "Kies hoe vaak je al traint." };
  if (!(dagen >= 1 && dagen <= 7)) return { error: "Kies hoeveel keer per week je wil trainen." };
  if (![6, 8, 12].includes(weken)) return { error: "Kies de lengte van je plan." };

  // Workouts is de ruggengraat en staat altijd aan; het weekritme komt uit het trainingsplan.
  // Meal plan en Motivatie zijn keuzes daarbovenop.
  const modules = ["workouts", ...formData.getAll("modules").map(String).filter((m) => m !== "workouts" && MODULES.includes(m))];

  const velden = {
    coaching_doel: doel,
    coaching_ervaring: ervaring,
    coaching_dagen: dagen,
    coaching_toon: toon === "scherp" ? "scherp" : "rustig",
    coaching_modules: modules,
  };

  if (modules.includes("mealplan")) {
    const geldig = VOEDINGSVOORKEUREN.map((v) => v.v);
    velden.coaching_voeding = formData.getAll("voeding").map(String).filter((v) => geldig.includes(v));
    velden.coaching_voeding_vrij = String(formData.get("voeding_vrij") || "").trim().slice(0, 300) || null;
  }

  if (toestemming) {
    velden.coaching_toestemming_at = new Date().toISOString();
    if (geboorte.datum) velden.geboortedatum = geboorte.datum;
    if (Number.isFinite(gewicht) && gewicht > 25 && gewicht < 400) velden.gewicht_kg = Math.round(gewicht * 10) / 10;
    if (Number.isFinite(lengte) && lengte > 100 && lengte < 250) velden.height_cm = lengte;
    if (beperkingen) velden.coaching_beperkingen = beperkingen;
  } else {
    // Geen toestemming = de eerder gegeven toestemming intrekken en de gezondheidsvelden laten staan
    // waar ze stonden (ze blijven van het lid), maar ze gaan niet meer naar het model.
    velden.coaching_toestemming_at = null;
    velden.coaching_beperkingen = null;
  }
  if (geboorte.error) return { error: geboorte.error };

  const { error } = await mij.admin.from("profiles").update(velden).eq("id", mij.user.id);
  if (error) return { error: `Je antwoorden konden niet bewaard worden: ${error.message}` };

  revalidatePath("/coaching");
  return { ok: true, weken };
}

/** Welke modules staan aan. Workouts kan niet uit — daar hangt het weekritme aan. */
export async function zetModules(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  const gekozen = ["workouts", ...formData.getAll("modules").map(String).filter((m) => m !== "workouts" && MODULES.includes(m))];
  const { error } = await mij.admin.from("profiles").update({ coaching_modules: gekozen }).eq("id", mij.user.id);
  if (error) return { error: "Kon je keuze niet bewaren." };
  revalidatePath("/coaching");
  return { ok: true, message: "Bewaard ✓" };
}

/** De voedingsvoorkeuren. Apart van de intake omdat ze bijgesteld worden, niet één keer ingevuld. */
export async function zetVoeding(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  const geldig = VOEDINGSVOORKEUREN.map((v) => v.v);
  const { error } = await mij.admin.from("profiles").update({
    coaching_voeding: formData.getAll("voeding").map(String).filter((v) => geldig.includes(v)),
    coaching_voeding_vrij: String(formData.get("voeding_vrij") || "").trim().slice(0, 300) || null,
  }).eq("id", mij.user.id);
  if (error) return { error: "Kon je voorkeuren niet bewaren." };
  revalidatePath("/coaching");
  return { ok: true, message: "Bewaard ✓ — je volgende menu houdt er rekening mee." };
}

/**
 * Het weekmenu van deze week. Het lid kan het zelf vragen; de zondagcron doet hetzelfde wanneer
 * een nieuwe week opengaat. Beide wegen komen uit op dezelfde rij (uniek op lid + weeknummer).
 */
export async function maakMenu(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  if (!coachAan()) return { error: "De AI-coach staat momenteel uit." };
  if (!maaltijdenAan(mij.profile)) return { error: "Zet eerst de maaltijdmodule aan." };

  const { data: plan } = await mij.admin.from("coaching_plans")
    .select("id, gym_id").eq("member_id", mij.user.id).eq("status", "lopend").maybeSingle();
  if (!plan) return { error: "Je hebt geen lopend plan." };

  const { data: weken } = await mij.admin.from("coaching_weeks")
    .select("id, weeknummer, unlocked_at").eq("plan_id", plan.id).order("weeknummer");
  const open = [...(weken || [])].reverse().find((w) => w.unlocked_at);
  if (!open) return { error: "Er staat nog geen week open." };

  // Opnieuw vragen mag, maar dan ook echt opnieuw: de knop "ander menu" hoort een ander menu te
  // geven en niet stilletjes hetzelfde terug te zetten.
  const opnieuw = String(formData?.get?.("opnieuw") || "") === "ja";
  const { data: checkin } = await mij.admin.from("coaching_checkins")
    .select("menu_gevolgd, honger").eq("week_id", open.id).maybeSingle();

  const argumenten = {
    gymId: plan.gym_id, memberId: mij.user.id, profiel: mij.profile,
    weeknummer: open.weeknummer, planId: plan.id, checkin,
  };
  const uit = opnieuw
    ? await maakWeekmenu(mij.admin, argumenten)
    : await zorgVoorMenu(mij.admin, argumenten);
  if (uit.error) return { error: uit.error };

  revalidatePath("/coaching");
  return { ok: true, message: uit.hergebruikt ? "Je menu van vorige week loopt door ✓" : "Je weekmenu staat klaar ✓" };
}

/** Het plan aanmaken. De enige plek waar het slimme model werk doet. */
export async function startPlan(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  if (!coachAan()) return { error: "De AI-coach staat momenteel uit." };

  const weken = parseInt(formData.get("weken"), 10) || 8;
  const p = mij.profile;
  if (!p.coaching_doel || !p.coaching_ervaring || !p.coaching_dagen) {
    return { error: "Vul eerst de vragen in." };
  }

  const { data: bestaat } = await mij.admin.from("coaching_plans")
    .select("id").eq("member_id", mij.user.id).eq("status", "lopend").maybeSingle();
  if (bestaat) return { error: "Je hebt al een lopend plan." };

  const uit = await maakPlan(mij.admin, {
    gymId: p.gym_id,
    memberId: mij.user.id,
    profiel: p,
    weken: [6, 8, 12].includes(weken) ? weken : 8,
    sessiesPerWeek: p.coaching_dagen,
  });
  if (uit.error) return { error: uit.error };

  revalidatePath("/coaching");
  revalidatePath("/training");
  return { ok: true, message: "Je plan staat klaar ✓" };
}

/** Eén sessie afvinken. De enige handeling die het lid elke week doet. */
export async function vinkSessieAf(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  const sessieId = String(formData.get("sessieId") || "");
  const oordeel = String(formData.get("oordeel") || "");
  if (!sessieId) return { error: "Onbekende sessie." };

  // Controleren dat deze sessie van dit lid is. Zonder deze stap kan iemand met een gegokt id de
  // sessie van een ander afvinken — de service-role kent geen RLS.
  const { data: s } = await mij.admin.from("coaching_sessions")
    .select("id, week_id, gedaan_at, coaching_weeks!inner(plan_id, coaching_plans!inner(member_id))")
    .eq("id", sessieId).maybeSingle();
  if (!s || s.coaching_weeks?.coaching_plans?.member_id !== mij.user.id) return { error: "Deze sessie is niet van jou." };

  const velden = { gedaan_at: s.gedaan_at ? null : new Date().toISOString() };
  if (["te_licht", "goed", "te_zwaar"].includes(oordeel)) velden.oordeel = oordeel;
  const { error } = await mij.admin.from("coaching_sessions").update(velden).eq("id", sessieId);
  if (error) return { error: "Kon niet afvinken." };

  revalidatePath("/coaching");
  return { ok: true, message: velden.gedaan_at ? "Afgevinkt ✓" : "Vinkje weg" };
}

/** De wekelijkse check-in. Vier knoppen en één vrij veld. */
export async function bewaarCheckin(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  const weekId = String(formData.get("weekId") || "");
  if (!weekId) return { error: "Onbekende week." };

  const { data: w } = await mij.admin.from("coaching_weeks")
    .select("id, gym_id, coaching_plans!inner(member_id)").eq("id", weekId).maybeSingle();
  if (!w || w.coaching_plans?.member_id !== mij.user.id) return { error: "Deze week is niet van jou." };

  const een = (naam, toegestaan) => {
    const v = String(formData.get(naam) || "").trim();
    return toegestaan.includes(v) ? v : null;
  };
  const rij = {
    gym_id: w.gym_id,
    week_id: weekId,
    zwaarte: een("zwaarte", ["te_licht", "goed", "te_zwaar"]),
    verloop: een("verloop", ["vlot", "wisselend", "moeilijk"]),
    energie: een("energie", ["goed", "ok", "laag"]),
    pijn: String(formData.get("pijn") || "") === "ja",
    pijn_waar: String(formData.get("pijn_waar") || "").trim().slice(0, 200) || null,
    vrij: String(formData.get("vrij") || "").trim().slice(0, 1000) || null,
    // Twee vragen voor wie een menu volgt. Ze sturen of het menu van volgende week hetzelfde blijft
    // of opnieuw geschreven wordt — zie `moetVernieuwen`.
    menu_gevolgd: een("menu_gevolgd", ["vlot", "deels", "niet"]),
    honger: een("honger", ["nee", "soms", "vaak"]),
  };

  const { error } = await mij.admin.from("coaching_checkins").upsert(rij, { onConflict: "week_id" });
  if (error) return { error: `Kon je antwoorden niet bewaren: ${error.message}` };

  revalidatePath("/coaching");
  return { ok: true, message: "Bedankt — je coach kijkt ernaar ✓" };
}

/** De volgende week openen. Kan het lid zelf doen zodra de poort open is; de zondagcron doet het ook. */
export async function openWeek() {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  const { data: plan } = await mij.admin.from("coaching_plans")
    .select("id, gym_id").eq("member_id", mij.user.id).eq("status", "lopend").maybeSingle();
  if (!plan) return { error: "Je hebt geen lopend plan." };

  const uit = await openVolgendeWeek(mij.admin, { gymId: plan.gym_id, planId: plan.id });
  if (uit.error) return { error: uit.error };
  revalidatePath("/coaching");
  if (uit.klaar) return { ok: true, message: "Je plan is uitgespeeld 🎉" };
  if (uit.besluit === "doorverwijzen") return { ok: true, message: "Je coach stelt voor om eens met een echte coach te praten." };
  return { ok: true, message: "Je nieuwe week staat klaar ✓" };
}

/** Pauzeren of hervatten. Een plan moet kunnen stilliggen zonder dat je het weggooit. */
export async function zetPlanStatus(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  const naar = String(formData.get("status") || "");
  if (!["lopend", "gepauzeerd", "gestopt"].includes(naar)) return { error: "Onbekende status." };

  const { data: plan } = await mij.admin.from("coaching_plans")
    .select("id").eq("member_id", mij.user.id).in("status", ["lopend", "gepauzeerd"]).maybeSingle();
  if (!plan) return { error: "Je hebt geen plan." };

  const { error } = await mij.admin.from("coaching_plans").update({ status: naar }).eq("id", plan.id);
  if (error) return { error: "Kon de status niet aanpassen." };
  revalidatePath("/coaching");
  return { ok: true, message: naar === "gepauzeerd" ? "Je plan staat op pauze." : naar === "gestopt" ? "Je plan is gestopt." : "Je plan loopt weer." };
}

/** Het gewicht bijwerken — één veld, want gewicht wordt gevraagd, niet gemeten. */
export async function zetGewicht(formData) {
  const mij = await ik();
  if (!mij) return { error: "Je moet ingelogd zijn." };
  if (!mij.profile.coaching_toestemming_at) return { error: "Zet eerst de toestemming aan bij je gegevens." };
  const kg = parseFloat(String(formData.get("gewicht") || "").replace(",", "."));
  if (!Number.isFinite(kg) || kg <= 25 || kg >= 400) return { error: "Vul een gewicht in kilogram in." };
  const { error } = await mij.admin.from("profiles").update({ gewicht_kg: Math.round(kg * 10) / 10 }).eq("id", mij.user.id);
  if (error) return { error: "Kon je gewicht niet bewaren." };
  revalidatePath("/coaching");
  return { ok: true, message: "Bewaard ✓" };
}
