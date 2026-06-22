import { stripe } from "./stripe";
import { createAdminClient } from "./supabase/admin";

// Get-or-create a persistent Stripe Customer for a profile (needed for subscriptions,
// the billing portal, saved cards and invoices). Stores stripe_customer_id on the profile.
export async function getOrCreateCustomer(supabase, userId, email) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, full_name")
    .eq("id", userId)
    .single();
  // Reuse the stored customer, but only if it still exists in the ACTIVE Stripe account/mode. A stale
  // id (e.g. created under a different test/live key) would make checkout.sessions.create throw
  // "No such customer" — so validate it and fall through to recreate a fresh one if it's gone.
  if (profile?.stripe_customer_id) {
    try {
      const existing = await stripe.customers.retrieve(profile.stripe_customer_id);
      if (existing && !existing.deleted) return existing.id;
    } catch {
      // invalid/stale id → recreate below
    }
  }

  const customer = await stripe.customers.create({
    email,
    name: profile?.full_name || undefined,
    metadata: { user_id: userId },
  });
  // stripe_customer_id is a protected column → write via service role, not the user client.
  await createAdminClient().from("profiles").update({ stripe_customer_id: customer.id }).eq("id", userId);
  return customer.id;
}
