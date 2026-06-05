import { stripe } from "./stripe";

// Get-or-create a persistent Stripe Customer for a profile (needed for subscriptions,
// the billing portal, saved cards and invoices). Stores stripe_customer_id on the profile.
export async function getOrCreateCustomer(supabase, userId, email) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, full_name")
    .eq("id", userId)
    .single();
  if (profile?.stripe_customer_id) return profile.stripe_customer_id;

  const customer = await stripe.customers.create({
    email,
    name: profile?.full_name || undefined,
    metadata: { user_id: userId },
  });
  await supabase.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", userId);
  return customer.id;
}
