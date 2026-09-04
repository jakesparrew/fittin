// VAT treatment for COACH session-credit invoices (B2B sale: the VZW sells session-credits to a
// coach who runs a commercial PT activity). The exact rate is an accountant decision — set it here
// once and every coach invoice follows it. Options:
//   0     = vrijgesteld van btw  → set COACH_VAT_NOTE to the legal exemption mention
//   0.06  = 6% (sportdiensten)
//   0.21  = 21% (standaard B2B)  ← most common for a B2B service to a VAT-registered coach
// ⚠ Bevestig met de boekhouder vóór je echte facturen uitreikt; pas dan dit ene getal aan.
export const COACH_VAT_RATE = 0.06; // 6%, INBEGREPEN in de prijs (€12 = incl. btw) — bevestigd 2026-06-23
export const COACH_VAT_NOTE =
  "Bedragen zijn inclusief 6% btw. Sportvereniging zonder winstoogmerk.";

// ── Facturatiegegevens overnemen van Stripe ────────────────────────────────────────
// Sinds de owner "Ik koop als bedrijf" aanzette, VRAAGT Stripe bij het afrekenen een btw-nummer en
// een bedrijfsnaam. Die belandden alleen in Stripe: onze eigen factuur bleef leeg, en de coach moest
// hetzelfde nummer een tweede keer intypen in zijn profiel. Dat is de reden dat er facturen zonder
// btw-nummer bestonden.
//
// Twee regels die het veilig houden:
//   • NOOIT overschrijven wat de gebruiker zelf invulde. Alleen lege velden worden aangevuld — wie
//     zijn adres bewust anders zet dan bij Stripe, houdt dat.
//   • Nooit de betaling laten mislukken. Dit is een aanvulling, geen voorwaarde: elke fout wordt
//     gelogd en verder genegeerd.
const adresRegel = (a) =>
  [a?.line1, a?.line2, [a?.postal_code, a?.city].filter(Boolean).join(" "), a?.country]
    .map((s) => String(s || "").trim())
    .filter(Boolean)
    .join(", ") || null;

export async function neemFacturatieOverVanStripe(stripe, admin, userId, session) {
  if (!userId || !session) return;
  try {
    const { data: p } = await admin
      .from("profiles")
      .select("bill_company, bill_vat, bill_address")
      .eq("id", userId)
      .maybeSingle();
    if (!p) return;
    if (p.bill_company && p.bill_vat && p.bill_address) return; // niets aan te vullen

    const details = session.customer_details || {};
    // customer_details.tax_ids staat er niet op elke API-versie; de lijst op de klant zelf wel.
    let btw = (details.tax_ids || []).find((t) => t.value)?.value || null;
    if (!btw && session.customer) {
      try {
        const lijst = await stripe.customers.listTaxIds(session.customer, { limit: 1 });
        btw = lijst?.data?.[0]?.value || null;
      } catch (e) { console.error("stripe listTaxIds:", e?.message); }
    }

    const nieuw = {};
    if (!p.bill_vat && btw) nieuw.bill_vat = btw;
    // De naam bij een zakelijke aankoop is de bedrijfsnaam die de koper zelf intypte.
    if (!p.bill_company && btw && details.name) nieuw.bill_company = details.name;
    if (!p.bill_address && adresRegel(details.address)) nieuw.bill_address = adresRegel(details.address);
    if (!Object.keys(nieuw).length) return;

    await admin.from("profiles").update(nieuw).eq("id", userId);
  } catch (e) {
    console.error("facturatiegegevens van Stripe overnemen:", e?.message);
  }
}
