import { maakPlan } from "./plan.js";
import { coachAan } from "./model.js";
import { zorgVoorMenu, maakWeekmenu, maaltijdenAan } from "./maaltijd.js";

// De twee dingen die een lid zelf kan laten maken, elk als één functie.
//
// WAAROM DIT EEN APART BESTAND IS. Deze twee opdrachten hebben sinds kort twee ingangen: de gewone
// serveractie, en de stroomroute die meekijkt terwijl het model schrijft. Twee ingangen naar
// hetzelfde werk is precies hoe voorwaarden uit elkaar gaan lopen — de ene ingang controleert of de
// maaltijdmodule aanstaat en de andere vergeet het een release later. Beide roepen hieronder
// dezelfde functie aan; het enige verschil is of er een `melden` meegaat.
//
// Alles wat hier gebeurt, gebeurt op naam van `mij.user.id`. Er komt geen id uit een formulier of
// een request-body aan te pas.

/** Een volledig nieuw plan. */
export async function planOpdracht(mij, { weken, melden = null } = {}) {
  if (!coachAan()) return { error: "De AI-coach staat momenteel uit." };

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
    melden,
  });
  if (uit.error) return { error: uit.error };
  return { ok: true, message: "Je plan staat klaar ✓" };
}

/** Het weekmenu van deze week. */
export async function menuOpdracht(mij, { opnieuw = false, melden = null } = {}) {
  if (!coachAan()) return { error: "De AI-coach staat momenteel uit." };
  if (!maaltijdenAan(mij.profile)) return { error: "Zet eerst de maaltijdmodule aan." };

  const { data: plan } = await mij.admin.from("coaching_plans")
    .select("id, gym_id").eq("member_id", mij.user.id).eq("status", "lopend").maybeSingle();
  if (!plan) return { error: "Je hebt geen lopend plan." };

  const { data: weken } = await mij.admin.from("coaching_weeks")
    .select("id, weeknummer, unlocked_at").eq("plan_id", plan.id).order("weeknummer");
  const open = [...(weken || [])].reverse().find((w) => w.unlocked_at);
  if (!open) return { error: "Er staat nog geen week open." };

  const { data: checkin } = await mij.admin.from("coaching_checkins")
    .select("menu_gevolgd, honger").eq("week_id", open.id).maybeSingle();

  const argumenten = {
    gymId: plan.gym_id, memberId: mij.user.id, profiel: mij.profile,
    weeknummer: open.weeknummer, planId: plan.id, checkin, melden,
  };
  // Opnieuw vragen mag, maar dan ook echt opnieuw: de knop "ander menu" hoort een ander menu te
  // geven en niet stilletjes hetzelfde terug te zetten.
  const uit = opnieuw ? await maakWeekmenu(mij.admin, argumenten) : await zorgVoorMenu(mij.admin, argumenten);
  if (uit.error) return { error: uit.error };

  return { ok: true, message: uit.hergebruikt ? "Je menu van vorige week loopt door ✓" : "Je weekmenu staat klaar ✓" };
}
