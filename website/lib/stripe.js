import Stripe from "stripe";

// Server-side Stripe client. SERVER ONLY. Null until the secret key is set.
const key = process.env.STRIPE_SECRET_KEY;
export const isStripeConfigured = Boolean(key);
// Pin the API version (matches the installed SDK default) so a future SDK bump can't silently
// change Checkout/Subscription/webhook behavior in production.
export const stripe = key ? new Stripe(key, { apiVersion: "2026-05-27.dahlia" }) : null;

// Let people pay as a business: a "Purchasing as a business?" checkbox + VAT/company tax id
// field on the Stripe Checkout page (so company purchases get a proper invoice).
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
