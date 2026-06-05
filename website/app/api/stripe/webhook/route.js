import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe webhook: confirms paid bookings + sends the confirmation email.
export async function POST(req) {
  if (!isStripeConfigured) return new NextResponse("stripe not configured", { status: 503 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    return new NextResponse(`Webhook signature error: ${e.message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const bookingId = session.metadata?.booking_id;
    if (bookingId) {
      const admin = createAdminClient();
      const { data: booking } = await admin
        .from("bookings")
        .update({ paid: true, stripe_payment_intent: session.payment_intent })
        .eq("id", bookingId)
        .select("id, starts_at, ends_at, persons, user_id, services(name)")
        .single();

      if (booking) {
        const { data: profile } = await admin
          .from("profiles")
          .select("email, full_name")
          .eq("id", booking.user_id)
          .single();
        await sendBookingConfirmation({
          to: profile?.email,
          name: profile?.full_name,
          serviceName: booking.services?.name || "Sessie",
          startsAt: booking.starts_at,
          endsAt: booking.ends_at,
          persons: booking.persons,
          free: false,
        });
      }
    }
  }

  return NextResponse.json({ received: true });
}
