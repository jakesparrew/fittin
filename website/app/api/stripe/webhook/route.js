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

async function recordPayment(admin, { gymId, userId, amountCents, kind, description, stripeId }) {
  if (!amountCents || amountCents <= 0) return; // skip €0 (setup/welcome)
  let gym = gymId;
  if (!gym && userId) {
    const { data: p } = await admin.from("profiles").select("gym_id").eq("id", userId).maybeSingle();
    gym = p?.gym_id;
  }
  if (!gym) return;
  await admin.from("payments").upsert(
    { gym_id: gym, user_id: userId || null, amount_cents: amountCents, kind, description, stripe_id: stripeId },
    { onConflict: "stripe_id" }
  );
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

async function markBookingPaid(admin, bookingId, paymentIntent, session) {
  const { data: booking } = await admin
    .from("bookings")
    .update({ paid: true, stripe_payment_intent: paymentIntent })
    .eq("id", bookingId)
    .select("id, gym_id, starts_at, ends_at, persons, user_id, services(name)")
    .single();
  if (!booking) return;
  if (session?.amount_total)
    await recordPayment(admin, { gymId: booking.gym_id, userId: booking.user_id, amountCents: session.amount_total, kind: "booking", description: `Boeking · ${booking.services?.name || "Sessie"}`, stripeId: session.id });
  // Referred member just paid → reward the referrer (deferred anti-farm reward).
  if (booking.user_id) await admin.rpc("reward_pending_referral", { p_user: booking.user_id });
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
  const periodEnd = sub.current_period_end || sub.items?.data?.[0]?.current_period_end || null;
  const row = {
    gym_id: p.gym_id,
    user_id: userId,
    stripe_sub_id: sub.id,
    status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    price_id: sub.items?.data?.[0]?.price?.id || null,
  };
  const { data: existing } = await admin.from("memberships").select("id").eq("stripe_sub_id", sub.id).maybeSingle();
  if (existing) await admin.from("memberships").update(row).eq("id", existing.id);
  else await admin.from("memberships").insert(row);
}

// Free-session activation: dedupe by card fingerprint so the same card can't claim a
// FittinWelcome on multiple accounts.
async function handleWelcomeSetup(admin, session) {
  const userId = session.metadata?.user_id;
  const setupIntentId = session.setup_intent;
  if (!userId || !setupIntentId) return;
  const si = await stripe.setupIntents.retrieve(setupIntentId);
  if (!si.payment_method) return;
  const pm = await stripe.paymentMethods.retrieve(si.payment_method);
  const fingerprint = pm.card?.fingerprint;
  if (!fingerprint) return;

  const { error: insErr } = await admin.from("welcome_claims").insert({ fingerprint, user_id: userId });
  if (insErr) {
    // fingerprint already used → this card already claimed a free session elsewhere
    await admin.from("profiles").update({ welcome_status: "blocked" }).eq("id", userId);
  } else {
    await admin.from("profiles").update({ welcome_status: "eligible" }).eq("id", userId);
  }
}

async function handleEvent(event, admin) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      if (obj.metadata?.kind === "punchcard") {
        const credits = parseInt(obj.metadata.credits, 10) || 0;
        await grantCredits(admin, obj.metadata.user_id, credits, "aankoop", true);
        await recordPayment(admin, { userId: obj.metadata.user_id, amountCents: obj.amount_total, kind: "beurtenkaart", description: `Beurtenkaart · ${credits} sessies`, stripeId: obj.id });
      } else if (obj.metadata?.kind === "coach_credits") {
        const coachId = obj.metadata.coach_id;
        const credits = parseInt(obj.metadata.credits, 10) || 0;
        const { data: prof } = await admin.from("profiles").select("gym_id").eq("id", coachId).single();
        if (prof && credits) {
          await admin.from("coach_ledger").insert({ gym_id: prof.gym_id, coach_id: coachId, delta: credits, reason: "aankoop" });
        }
        await recordPayment(admin, { userId: coachId, amountCents: obj.amount_total, kind: "coach_credits", description: `Coach-sessies · ${credits}`, stripeId: obj.id });
      } else if (obj.metadata?.kind === "welcome" || obj.mode === "setup") {
        await handleWelcomeSetup(admin, obj);
      } else if (obj.metadata?.booking_id) {
        await markBookingPaid(admin, obj.metadata.booking_id, obj.payment_intent, obj);
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
      // Only subscription invoices grant the monthly included session.
      // (Stripe's newer API moved the subscription ref off the invoice root, so we
      //  key on billing_reason instead — robust across API versions.)
      const reason = obj.billing_reason || "";
      if (!reason.startsWith("subscription")) return;
      const prof = await profileFromCustomer(admin, obj.customer);
      if (!prof) return;
      await grantCredits(admin, prof.id, 1, "abo");
      await recordPayment(admin, { gymId: prof.gym_id, userId: prof.id, amountCents: obj.amount_paid, kind: "abonnement", description: "Maandabonnement", stripeId: obj.id });
      await admin.rpc("reward_pending_referral", { p_user: prof.id });
      return;
    }
    default:
      return;
  }
}
