import Stripe from "stripe";

// Server-side Stripe client. SERVER ONLY. Null until the secret key is set.
const key = process.env.STRIPE_SECRET_KEY;
export const isStripeConfigured = Boolean(key);
export const stripe = key ? new Stripe(key) : null;
