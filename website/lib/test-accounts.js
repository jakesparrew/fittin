// Accounts die NOOIT mogen meetellen in cijfers die de eigenaar te zien krijgt.
//
// Owner-regel (2026-08-07): "Achilius is een test account daar moet je nooit rekening mee houden."
//
// Waarom dit een gedeelde helper is en geen afspraak in iemands hoofd: een testaccount dat overal
// gewoon meetelt, verschuift je coachtelling, je sessies-per-maand en je tegoedoverzicht met net
// genoeg om cijfers onbetrouwbaar te maken zonder dat het opvalt. Eén keer onthouden werkt niet —
// bij de volgende telling zit het er weer in. Vandaar één lijst en één filter.
//
// De waarheid staat sinds migratie 0129 in `profiles.is_test`, zodat de eigenaar zelf een account
// kan markeren zonder dat er code gedeployd moet worden. De e-mailadreslijst hieronder blijft als
// vangnet: draait de app ooit tegen een database waar 0129 nog niet gedraaid is, dan valt de
// uitsluiting terug op het adres in plaats van stilzwijgend niets te filteren — want "geen
// testaccounts gevonden" ziet er precies hetzelfde uit als een geslaagde filter.
export const TEST_ACCOUNT_EMAILS = ["coach@fittin.be"];

export function isTestAccount(profile) {
  // Enkel `=== true` telt. Een query die `is_test` niet meeselecteert geeft undefined, en dat mag
  // niet als "geen testaccount" gelezen worden — dan valt hij door naar de adrescontrole.
  if (profile?.is_test === true) return true;
  const mail = String(profile?.email || "").toLowerCase();
  return TEST_ACCOUNT_EMAILS.some((e) => e.toLowerCase() === mail);
}

// De id's van alle testaccounts van deze gym. Bewust een Set: de aanroepers filteren rijen waarin
// enkel een user_id of coach_id staat (boekingen, tegoedregels), niet het volledige profiel.
export async function testAccountIds(supabase, gymId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("gym_id", gymId)
    .eq("is_test", true);
  if (!error) return new Set((data || []).map((p) => p.id));

  // Kolom bestaat nog niet (0129 niet toegepast) → terugvallen op het adres.
  const { data: opAdres } = await supabase
    .from("profiles")
    .select("id")
    .eq("gym_id", gymId)
    .in("email", TEST_ACCOUNT_EMAILS);
  return new Set((opAdres || []).map((p) => p.id));
}

// Filter een lijst rijen op één of meer id-velden. `velden` is bv. ["user_id", "coach_id"]:
// een boeking valt weg zodra het testaccount er in ÉÉN van beide rollen in zit.
export function zonderTest(rows, testIds, velden = ["user_id"]) {
  if (!testIds?.size) return rows || [];
  return (rows || []).filter((r) => !velden.some((v) => testIds.has(r?.[v])));
}
