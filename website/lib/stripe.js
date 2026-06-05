import Stripe from "stripe";

// Server-side Stripe client. SERVER ONLY. Null until the secret key is set.
const key = process.env.STRIPE_SECRET_KEY;
export const isStripeConfigured = Boolean(key);
export const stripe = key ? new Stripe(key) : null;

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
