import Stripe from "stripe";

// Server-side Stripe client. SERVER ONLY. Null until the secret key is set.
const key = process.env.STRIPE_SECRET_KEY;
export const isStripeConfigured = Boolean(key);
// Pin the API version (matches the installed SDK default) so a future SDK bump can't silently
// change Checkout/Subscription/webhook behavior in production.
export const stripe = key ? new Stripe(key, { apiVersion: "2026-05-27.dahlia" }) : null;

// Btw-nummer in de checkout: de "Purchasing as a business?"-schakelaar van Stripe. Aan- en weer
// uitgezet in juni 2026 (240b9bf → 0118e3c) omdat de schakelaar voor iedereen verschijnt, ook voor
// leden die een sessie van € 15 boeken. Op 29-08-2026 op vraag van de eigenaar opnieuw aangezet:
// een zelfstandige vroeg een factuur mét btw-nummer rechtstreeks bij de betaling. De eigen
// factuurroute (btw-gegevens in het profiel → /account/factuur/[id]) blijft ernaast bestaan.
// ⚠️ tax_id_collection mag NIET in een mode:"setup"-sessie (FittinWelcome) — die spreidt deze
// objecten dan ook bewust niet in.
// For sessions that attach a `customer`:
export const bizCustomer = {
  tax_id_collection: { enabled: true },
  billing_address_collection: "auto",
  customer_update: { name: "auto", address: "auto" },
};
// For guest sessions (customer_email, no customer object):
export const bizGuest = {
  tax_id_collection: { enabled: true },
  billing_address_collection: "auto",
  customer_creation: "always",
};
// Stripe's EIGEN factuur bij eenmalige betalingen staat UIT (04-09-2026, op vraag van de eigenaar).
//
// Waarom: er liepen twee factuurreeksen naast elkaar voor dezelfde verkoop — die van Stripe
// (QZ8LYIM3-0007) en die van Fittin' (2026-0007). Stripe kent bovendien ons 6%-tarief niet: er is
// geen tax rate en geen Stripe Tax geconfigureerd, dus zijn factuur toonde "€ 12,00" zonder enige
// btw-regel. Onbruikbaar voor een btw-plichtige coach en onleesbaar voor de boekhouding.
//
// De verdeling is nu: Stripe factureert de abonnementen (dat doet hij sowieso, dat kan niet uit),
// Fittin' factureert al de rest — eenmalige betalingen, cash, overschrijvingen, manuele facturen —
// met de vzw-gegevens, de 6%-splitsing en de doorlopende nummering (/beheer/factuur).
//
// Wat WEL aan blijft: tax_id_collection hierboven. Dat vraagt het btw-nummer bij het afrekenen, en
// de webhook neemt het over in het profiel (lib/invoice.js#neemFacturatieOverVanStripe) zodat de
// Fittin'-factuur compleet is. De klant krijgt van Stripe nog gewoon een betaalbewijs; de webhook
// valt daar automatisch op terug wanneer er geen Stripe-factuur bestaat.
//
// Terug aanzetten = { invoice_creation: { enabled: true } } — maar dan eerst 6% in Stripe zetten.
export const invoiceForBusiness = {};
