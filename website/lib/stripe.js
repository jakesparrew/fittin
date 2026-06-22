import Stripe from "stripe";

// Server-side Stripe client. SERVER ONLY. Null until the secret key is set.
const key = process.env.STRIPE_SECRET_KEY;
export const isStripeConfigured = Boolean(key);
// Pin the API version (matches the installed SDK default) so a future SDK bump can't silently
// change Checkout/Subscription/webhook behavior in production.
export const stripe = key ? new Stripe(key, { apiVersion: "2026-05-27.dahlia" }) : null;

// We issue our OWN Belgian invoices (coaches enter their company/VAT/address in their profile), so we
// no longer collect a VAT number at Stripe Checkout — the confusing "Purchasing as a business?"
// toggle is removed. We keep address collection + customer creation for clean receipts/customers.
// For sessions that attach a `customer`:
export const bizCustomer = {
  billing_address_collection: "auto",
  customer_update: { name: "auto", address: "auto" },
};
// For guest sessions (customer_email, no customer object):
export const bizGuest = {
  billing_address_collection: "auto",
  customer_creation: "always",
};
