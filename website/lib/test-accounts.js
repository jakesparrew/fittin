// Accounts die NOOIT mogen meetellen in cijfers die de eigenaar te zien krijgt.
//
// Owner-regel (2026-08-07): "Achilius is een test account daar moet je nooit rekening mee houden."
//
// Waarom dit een gedeelde helper is en geen afspraak in iemands hoofd: een testaccount dat overal
// gewoon meetelt, verschuift je coachtelling, je sessies-per-maand en je tegoedoverzicht met net
// genoeg om cijfers onbetrouwbaar te maken zonder dat het opvalt. Eén keer onthouden werkt niet —
// bij de volgende telling zit het er weer in. Vandaar één lijst en één filter.
//
// Nu op e-mailadres, omdat `profiles` geen testvlag heeft. Migratie 0129 voegt `profiles.is_test`
// toe; zodra die toegepast is, hoeft enkel testAccountIds() hieronder om te schakelen naar de kolom
// en kan de eigenaar accounts zelf markeren vanuit superadmin. De rest van de app verandert niet.
export const TEST_ACCOUNT_EMAILS = ["coach@fittin.be"];

export function isTestAccount(profile) {
  const mail = String(profile?.email || "").toLowerCase();
  return TEST_ACCOUNT_EMAILS.some((e) => e.toLowerCase() === mail);
}

// De id's van alle testaccounts van deze gym. Bewust een Set: de aanroepers filteren rijen waarin
// enkel een user_id of coach_id staat (boekingen, tegoedregels), niet het volledige profiel.
export async function testAccountIds(supabase, gymId) {
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("gym_id", gymId)
    .in("email", TEST_ACCOUNT_EMAILS);
  return new Set((data || []).map((p) => p.id));
}

// Filter een lijst rijen op één of meer id-velden. `velden` is bv. ["user_id", "coach_id"]:
// een boeking valt weg zodra het testaccount er in ÉÉN van beide rollen in zit.
export function zonderTest(rows, testIds, velden = ["user_id"]) {
  if (!testIds?.size) return rows || [];
  return (rows || []).filter((r) => !velden.some((v) => testIds.has(r?.[v])));
}
