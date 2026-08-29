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
// Spread into ONE-TIME (mode:'payment') Checkout sessions so Stripe auto-generates a real invoice
// (with the business name + VAT number the customer enters) — receipts don't show VAT, invoices do.
// NOT for subscriptions (those already invoice each cycle) or setup/€0 sessions.
export const invoiceForBusiness = { invoice_creation: { enabled: true } };
