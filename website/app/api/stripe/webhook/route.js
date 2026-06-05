import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Health check (Stripe validates endpoint reachability on creation).
export async function GET() {
  return NextResponse.json({ ok: true });
}

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

  const admin = createAdminClient();

  // Idempotency: a unique-PK insert fails on replays → we skip.
  const { error: dupErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handleEvent(event, admin);
  } catch (e) {
    console.error("stripe webhook error:", event.type, e?.message);
  }
  return NextResponse.json({ received: true });
}

async function profileFromCustomer(admin, customerId) {
  if (!customerId) return null;
  const { data } = await admin.from("profiles").select("id, gym_id").eq("stripe_customer_id", customerId).maybeSingle();
  return data || null;
}

async function grantCredits(admin, userId, credits, reason, withPunchcard = false) {
  if (!userId || !credits) return;
  const { data: prof } = await admin.from("profiles").select("gym_id").eq("id", userId).single();
  if (!prof) return;
  if (withPunchcard) {
    await admin.from("punch_cards").insert({
      gym_id: prof.gym_id,
      user_id: userId,
      credits_initial: credits,
      expires_at: new Date(Date.now() + 180 * 86400000).toISOString(),
    });
  }
  await admin.from("credits_ledger").insert({ gym_id: prof.gym_id, user_id: userId, delta: credits, reason });
}

async function markBookingPaid(admin, bookingId, paymentIntent) {
  const { data: booking } = await admin
    .from("bookings")
    .update({ paid: true, stripe_payment_intent: paymentIntent })
    .eq("id", bookingId)
    .select("id, starts_at, ends_at, persons, user_id, services(name)")
    .single();
  if (!booking) return;
  const { data: profile } = await admin.from("profiles").select("email, full_name").eq("id", booking.user_id).single();
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

async function upsertMembership(admin, sub) {
  const prof = await profileFromCustomer(admin, sub.customer);
  const userId = sub.metadata?.user_id || prof?.id;
  if (!userId) return;
  const { data: p } = await admin.from("profiles").select("gym_id").eq("id", userId).single();
  if (!p) return;
  const status = sub.status === "active" || sub.status === "trialing" ? "actief" : sub.status;
  const row = {
    gym_id: p.gym_id,
    user_id: userId,
    stripe_sub_id: sub.id,
    status,
    current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    price_id: sub.items?.data?.[0]?.price?.id || null,
  };
  const { data: existing } = await admin.from("memberships").select("id").eq("stripe_sub_id", sub.id).maybeSingle();
  if (existing) await admin.from("memberships").update(row).eq("id", existing.id);
  else await admin.from("memberships").insert(row);
}

async function handleEvent(event, admin) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      if (obj.metadata?.kind === "punchcard") {
        await grantCredits(admin, obj.metadata.user_id, parseInt(obj.metadata.credits, 10) || 0, "aankoop", true);
      } else if (obj.metadata?.booking_id) {
        await markBookingPaid(admin, obj.metadata.booking_id, obj.payment_intent);
      }
      // subscription checkout → handled by subscription.* + invoice.paid
      return;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await upsertMembership(admin, obj);
      return;
    case "customer.subscription.deleted":
      await admin.from("memberships").update({ status: "geannuleerd" }).eq("stripe_sub_id", obj.id);
      return;
    case "invoice.paid": {
      if (!obj.subscription) return; // only subscription invoices grant the monthly session
      const prof = await profileFromCustomer(admin, obj.customer);
      if (!prof) return;
      let credits = 1;
      try {
        const s = await stripe.subscriptions.retrieve(obj.subscription);
        credits = parseInt(s.metadata?.credits, 10) || 1;
      } catch {}
      await grantCredits(admin, prof.id, credits, "abo");
      return;
    }
    default:
      return;
  }
}
