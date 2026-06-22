// VAT treatment for COACH session-credit invoices (B2B sale: the VZW sells session-credits to a
// coach who runs a commercial PT activity). The exact rate is an accountant decision — set it here
// once and every coach invoice follows it. Options:
//   0     = vrijgesteld van btw  → set COACH_VAT_NOTE to the legal exemption mention
//   0.06  = 6% (sportdiensten)
//   0.21  = 21% (standaard B2B)  ← most common for a B2B service to a VAT-registered coach
// ⚠ Bevestig met de boekhouder vóór je echte facturen uitreikt; pas dan dit ene getal aan.
export const COACH_VAT_RATE = 0; // placeholder tot de boekhouder bevestigt
export const COACH_VAT_NOTE =
  "Btw-regeling voor sessietegoed nog te bevestigen met de boekhouder (vrijstelling / 6% / 21%). Pas COACH_VAT_RATE aan in lib/invoice.js.";
