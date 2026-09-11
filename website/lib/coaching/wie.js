import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/auth";
import { magCoaching } from "./toegang.js";

/**
 * Wie vraagt dit, en mag die het?
 *
 * Deze stond als lokale functie in actions.js met de opmerking "hem per actie herhalen is hem ooit
 * vergeten". Diezelfde reden geldt nu tussen bestanden: de stroomroute doet exact hetzelfde werk als
 * de serveracties en hoort niet zijn eigen kopie van de poort te hebben. Eén poort, twee ingangen.
 *
 * Schrijven gebeurt met de service-role: 0157 geeft `authenticated` alleen SELECT op de
 * coaching-tabellen. Wie hier langs mag, mag in ZIJN EIGEN dossier schrijven — de aanroeper moet
 * dus altijd `mij.user.id` gebruiken en nooit een id uit een formulier of een body.
 */
export async function wie() {
  const { user, profile } = await getSessionProfile();
  if (!user || !profile) return null;
  if (!magCoaching(profile)) return null;
  return { user, profile, admin: createAdminClient() };
}
