"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { sendBookingConfirmation } from "@/lib/email";

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3008";

function checkoutParams(booking, email) {
  return {
    mode: "payment",
    customer_email: email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: booking.price_cents,
          product_data: { name: `${booking.services?.name || "Sessie"} — Fittin'` },
        },
      },
    ],
    metadata: { booking_id: booking.id },
    success_url: `${siteUrl()}/account?betaald=1`,
    cancel_url: `${siteUrl()}/boeken?geannuleerd=1`,
  };
}

// Creates the booking (slot held immediately). Free → confirm + email. Paid → Stripe Checkout URL.
export async function createBookingAction({ serviceId, date, hour, persons, useWelcome, coachId, useCredit }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Je moet ingelogd zijn om te boeken." };

  const { data: bookingId, error } = await supabase.rpc("create_booking", {
    p_service: serviceId,
    p_date: date,
    p_hour: hour,
    p_persons: persons,
    p_use_welcome: !!useWelcome,
    p_coach: coachId || null,
    p_use_credit: !!useCredit,
  });
  if (error) return { error: error.message };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, starts_at, ends_at, persons, price_cents, paid, services(name)")
    .eq("id", bookingId)
    .single();

  revalidatePath("/account");
  revalidatePath("/boeken");

  // Free (FittinWelcome) or zero-price → done.
  if (!booking || booking.paid || booking.price_cents === 0) {
    await sendBookingConfirmation({
      to: user.email,
      name: user.user_metadata?.full_name,
      serviceName: booking?.services?.name || "Sessie",
      startsAt: booking?.starts_at,
      endsAt: booking?.ends_at,
      persons: booking?.persons || 1,
      free: true,
    });
    return { ok: true, free: true };
  }

  // Paid: hand off to Stripe Checkout. If Stripe isn't set up, confirm unpaid (dev).
  if (!isStripeConfigured) return { ok: true, unpaid: true };

  const session = await stripe.checkout.sessions.create(checkoutParams(booking, user.email));
  await supabase.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);
  return { ok: true, checkoutUrl: session.url };
}

// Resume payment for an existing unpaid booking (from the account page).
export async function resumeCheckoutAction(formData) {
  const id = formData.get("bookingId");
  if (!id || !isStripeConfigured) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, price_cents, paid, services(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!booking || booking.paid) return;

  const session = await stripe.checkout.sessions.create(checkoutParams(booking, user.email));
  await supabase.from("bookings").update({ stripe_session_id: session.id }).eq("id", id);
  redirect(session.url);
}
