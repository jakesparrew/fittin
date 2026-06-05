"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

export async function buyPackage(formData) {
  const packageId = formData.get("packageId");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/lidmaatschap");

  const { data: pkg } = await supabase.from("packages").select("*").eq("id", packageId).eq("active", true).single();
  if (!pkg) return { error: "Pakket niet gevonden." };
  if (!isStripeConfigured) return { error: "Betalingen nog niet geconfigureerd." };

  if (pkg.kind === "beurtenkaart") {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: pkg.price_cents,
            product_data: { name: `${pkg.name} — Fittin'` },
          },
        },
      ],
      metadata: { kind: "punchcard", package_id: pkg.id, credits: String(pkg.credits), user_id: user.id },
      success_url: `${siteUrl()}/account?credits=1`,
      cancel_url: `${siteUrl()}/lidmaatschap?geannuleerd=1`,
    });
    redirect(session.url);
  }

  // Abonnement → Stripe Billing (mode:'subscription' with a recurring Price). Scaffolded:
  // create a Product+Price once, store price_id on the package, then mode:'subscription'.
  return { error: "Abonnementen komen binnenkort." };
}
