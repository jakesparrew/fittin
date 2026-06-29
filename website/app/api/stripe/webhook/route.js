import { NextResponse } from "next/server";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBookingConfirmation, sendEventSignup } from "@/lib/email";
import { sendBookingInvites } from "@/lib/booking-invites";
import { recordRedemption } from "@/lib/discounts";

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

  // Idempotency lock: a unique-PK insert fails on a concurrent duplicate → skip.
  const { error: dupErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) return NextResponse.json({ received: true, duplicate: true });

  try {
    await handleEvent(event, admin);
  } catch (e) {
    // The handler did not complete. Release the lock and return a non-2xx so Stripe retries.
    // The credit / punch-card / coach grants are idempotent (stripe_ref) so re-processing is safe.
    console.error("stripe webhook error:", event.type, e?.message);
    await admin.from("stripe_events").delete().eq("id", event.id);
    return new NextResponse("handler error, will retry", { status: 500 });
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

async function grantCredits(admin, userId, credits, reason, withPunchcard = false, stripeRef = null) {
  if (!userId || !credits) return;
  const { data: prof } = await admin.from("profiles").select("gym_id").eq("id", userId).single();
  if (!prof) return;
  const expiresAt = new Date(Date.now() + 180 * 86400000).toISOString(); // 6-month validity (punch cards)
  // The abo's included session is use-it-or-lose-it: it expires at the end of the current calendar
  // month, so monthly credits never accumulate (each renewal grants a fresh one).
  const now = new Date();
  const endOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
  if (withPunchcard) {
    await admin.from("punch_cards").upsert(
      { gym_id: prof.gym_id, user_id: userId, credits_initial: credits, expires_at: expiresAt, stripe_ref: stripeRef },
      { onConflict: "stripe_ref", ignoreDuplicates: true }
    );
  }
  // stripe_ref makes the grant idempotent: a retried webhook adds the credits exactly once.
  // Punch-card credits expire after 6 months; the abo's monthly session expires at month end.
  await admin.from("credits_ledger").upsert(
    { gym_id: prof.gym_id, user_id: userId, delta: credits, reason, stripe_ref: stripeRef, expires_at: withPunchcard ? expiresAt : endOfMonth },
    { onConflict: "stripe_ref", ignoreDuplicates: true }
  );
}

async function markBookingPaid(admin, bookingId, paymentIntent, session) {
  // Don't confirm if the captured amount is below the agreed charge (mismatched/partial session).
  const { data: pre } = await admin.from("bookings").select("charge_cents, price_cents, status, gym_id, user_id, services(name)").eq("id", bookingId).single();
  if (!pre) return;
  if (session?.amount_total != null && session.amount_total < (pre.charge_cents ?? pre.price_cents ?? 0)) return;
  // RACE GUARD: a slow payment (SCA/Bancontact/bank-app) can land after the slot hold expired and the
  // slot was released/re-booked. Never deliver a dead booking — refund the charge and tell the member.
  if (pre.status !== "bevestigd") {
    try {
      if (paymentIntent) await stripe.refunds.create({ payment_intent: paymentIntent });
      await admin.from("notifications").insert({ gym_id: pre.gym_id, user_id: pre.user_id, type: "system", title: "Betaling terugbetaald", body: "Je tijdslot was niet meer vrij toen je betaling binnenkwam — we hebben het bedrag automatisch teruggestort.", link: "/boeken" });
    } catch (e) { console.error("markBookingPaid race refund failed:", e?.message); }
    return;
  }
  const { data: booking } = await admin
    .from("bookings")
    .update({ paid: true, status: "bevestigd", stripe_payment_intent: paymentIntent })
    .eq("id", bookingId)
    .eq("status", "bevestigd")
    .eq("paid", false) // only the FIRST unpaid→paid transition returns a row → confirm + invites run once
    .select("id, gym_id, starts_at, ends_at, persons, user_id, services(name)")
    .single();
  if (!booking) return;
  if (session?.amount_total)
    await recordPayment(admin, { gymId: booking.gym_id, userId: booking.user_id, amountCents: session.amount_total, kind: "booking", description: `Boeking · ${booking.services?.name || "Sessie"}`, stripeId: session.id });
  // Record the discount redemption now that the payment actually succeeded (once per booking).
  const codeId = session?.metadata?.discount_code_id;
  if (codeId && booking.user_id) {
    const { data: already } = await admin.from("discount_redemptions").select("id").eq("code_id", codeId).eq("booking_id", booking.id).maybeSingle();
    if (!already) { try { await recordRedemption(booking.gym_id, codeId, booking.user_id, booking.id); } catch (e) { console.error("recordRedemption:", e?.message); } }
  }
  // Referred member just paid → reward the referrer (deferred anti-farm reward).
  if (booking.user_id) await admin.rpc("reward_pending_referral", { p_user: booking.user_id });
  // Coach referral: if the referrer is a coach, give them ONE free intro session (a credit) the
  // first time their referred member pays — no cash commission.
  if (booking.user_id) {
    try {
      const { data: ref } = await admin.from("referrals").select("referrer_id").eq("referred_id", booking.user_id).maybeSingle();
      if (ref?.referrer_id) {
        const { data: rp } = await admin.from("profiles").select("role, gym_id").eq("id", ref.referrer_id).single();
        if (rp?.role === "coach") {
          const reason = `aanbreng:${booking.user_id}`; // idempotency marker — one reward per referred member
          const { data: already } = await admin.from("credits_ledger").select("id").eq("user_id", ref.referrer_id).eq("reason", reason).maybeSingle();
          if (!already) {
            await admin.from("credits_ledger").insert({ gym_id: rp.gym_id, user_id: ref.referrer_id, delta: 1, reason, ref_id: booking.id });
            await admin.from("notifications").insert({ gym_id: rp.gym_id, user_id: ref.referrer_id, type: "system", title: "Gratis introsessie verdiend 🎉", body: "Een aangebracht lid boekte — train samen met jouw gratis sessie.", link: "/coach" });
          }
        }
      }
    } catch {}
  }
  // Best-effort confirmation mail: never let an email hiccup roll back a successful payment.
  try {
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
  } catch (e) {
    console.error("booking confirmation mail failed (payment already recorded):", e?.message);
  }
  // Payment confirmed → now (and only now) e-mail anyone the booker invited along. Deferred from
  // booking creation so an abandoned/unpaid checkout never sends invites. Idempotent via the
  // unpaid→paid guard above (this runs once per booking).
  try {
    const { data: inviter } = await admin.from("profiles").select("full_name").eq("id", booking.user_id).single();
    await sendBookingInvites(admin, booking, inviter?.full_name);
  } catch (e) {
    console.error("post-payment booking invites failed:", e?.message);
  }
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

// Reverse positive grants tied to a refunded payment (idempotent per charge+row).
async function reverseLedger(admin, table, ref, chargeId) {
  const { data: rows } = await admin.from(table).select("*").eq("stripe_ref", ref);
  for (const row of rows || []) {
    if (!(row.delta > 0)) continue;
    const revRef = `refund:${chargeId}:${row.id}`;
    const { data: done } = await admin.from(table).select("id").eq("stripe_ref", revRef).maybeSingle();
    if (done) continue;
    const ins = { gym_id: row.gym_id, delta: -row.delta, reason: "refund", stripe_ref: revRef };
    if (row.user_id) ins.user_id = row.user_id;
    if (row.coach_id) ins.coach_id = row.coach_id;
    if (row.client_id) ins.client_id = row.client_id;
    await admin.from(table).insert(ins);
  }
}

// Refund: a FULL refund cancels the matching booking (frees the slot) + reverses credit/coach grants
// keyed on the originating checkout session(s) or subscription invoice. Partial refunds only alert the
// beheerders (manual review), so we never wrongly wipe partially-used credits.
async function handleRefund(admin, charge) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  const invoiceId = typeof charge.invoice === "string" ? charge.invoice : charge.invoice?.id;
  const fully = charge.refunded === true;

  if (fully) {
    if (pi) {
      await admin.from("bookings")
        .update({ status: "geannuleerd", paid: false, cancelled_at: new Date().toISOString() })
        .eq("stripe_payment_intent", pi).eq("status", "bevestigd");
    }
    const refs = [];
    if (pi) { try { const list = await stripe.checkout.sessions.list({ payment_intent: pi, limit: 10 }); for (const s of list.data || []) refs.push(s.id); } catch {} }
    if (invoiceId) refs.push(invoiceId);
    for (const ref of refs) {
      await reverseLedger(admin, "credits_ledger", ref, charge.id);
      await reverseLedger(admin, "coach_ledger", ref, charge.id);
      await reverseLedger(admin, "coach_credit_ledger", ref, charge.id);
    }
  }

  try {
    const { data: gym } = await admin.from("gyms").select("id").order("created_at").limit(1).single();
    if (gym) {
      const amt = ((charge.amount_refunded || 0) / 100).toFixed(2);
      const { data: admins } = await admin.from("profiles").select("id").eq("gym_id", gym.id).eq("role", "beheerder");
      for (const a of admins || []) {
        await admin.from("notifications").insert({ gym_id: gym.id, user_id: a.id, type: "system", title: `Terugbetaling € ${amt}`, body: fully ? "Volledige terugbetaling — boeking/credits automatisch teruggedraaid." : "Gedeeltelijke terugbetaling — controleer credits/boeking handmatig.", link: "/beheer/betalingen" });
      }
    }
  } catch {}
}

async function handleEvent(event, admin) {
  const obj = event.data.object;
  switch (event.type) {
    case "checkout.session.async_payment_succeeded":
    case "checkout.session.completed": {
      // Only grant value once Stripe confirms the funds are captured. Delayed methods (e.g. SEPA)
      // fire 'completed' with payment_status 'unpaid'/'processing' first — the real grant arrives on
      // async_payment_succeeded. Setup/subscription sessions carry no payment_status, so allow those.
      if (obj.mode === "payment" && obj.payment_status && obj.payment_status !== "paid") return;
      if (obj.metadata?.kind === "punchcard") {
        const credits = parseInt(obj.metadata.credits, 10) || 0;
        await grantCredits(admin, obj.metadata.user_id, credits, "aankoop", true, obj.id);
        await recordPayment(admin, { userId: obj.metadata.user_id, amountCents: obj.amount_total, kind: "beurtenkaart", description: `Beurtenkaart · ${credits} sessies`, stripeId: obj.id });
      } else if (obj.metadata?.kind === "coach_credits") {
        const coachId = obj.metadata.coach_id;
        const credits = parseInt(obj.metadata.credits, 10) || 0;
        const { data: prof } = await admin.from("profiles").select("gym_id").eq("id", coachId).single();
        if (prof && credits) {
          await admin.from("coach_ledger").upsert(
            { gym_id: prof.gym_id, coach_id: coachId, delta: credits, reason: "aankoop", stripe_ref: obj.id },
            { onConflict: "stripe_ref", ignoreDuplicates: true }
          );
        }
        await recordPayment(admin, { userId: coachId, amountCents: obj.amount_total, kind: "coach_credits", description: `Coach-sessies · ${credits}`, stripeId: obj.id });
      } else if (obj.metadata?.kind === "event") {
        const eventId = obj.metadata.event_id;
        const userId = obj.metadata.user_id;
        const { data: ev } = await admin.from("events").select("gym_id, title, starts_at").eq("id", eventId).single();
        if (ev) {
          await admin.from("event_signups").upsert(
            { gym_id: ev.gym_id, event_id: eventId, user_id: userId, paid: true, stripe_session_id: obj.id },
            { onConflict: "event_id,user_id" }
          );
          await recordPayment(admin, { gymId: ev.gym_id, userId, amountCents: obj.amount_total, kind: "overig", description: `Event · ${ev.title}`, stripeId: obj.id });
          try {
            const { data: prof } = await admin.from("profiles").select("email, full_name").eq("id", userId).single();
            if (prof?.email) await sendEventSignup({ to: prof.email, name: prof.full_name, title: ev.title, startsAt: ev.starts_at });
            await admin.from("notifications").insert({ gym_id: ev.gym_id, user_id: userId, type: "event", title: `Ingeschreven voor ${ev.title} ✓`, body: "Tot dan!", link: "/account" });
          } catch {}
        }
      } else if (obj.metadata?.kind === "coach_payment") {
        const reqId = obj.metadata.request_id;
        const { data: req } = await admin.from("coach_payment_requests").select("gym_id, client_id, coach_id, description, sessions, status").eq("id", reqId).single();
        if (req && req.status !== "paid") {
          await admin.from("coach_payment_requests").update({ status: "paid", paid_at: new Date().toISOString(), stripe_session_id: obj.id }).eq("id", reqId);
          const { data: coach } = await admin.from("profiles").select("full_name").eq("id", req.coach_id).single();
          await recordPayment(admin, { gymId: req.gym_id, userId: req.client_id, amountCents: obj.amount_total, kind: "overig", description: `Coaching · ${coach?.full_name || "coach"}${req.description ? ` · ${req.description}` : ""}`, stripeId: obj.id });
          // Top up the coachee's prepaid sessions with this coach so future bookings don't charge again.
          if (req.sessions > 0) {
            await admin.from("coach_credit_ledger").upsert(
              { gym_id: req.gym_id, coach_id: req.coach_id, client_id: req.client_id, delta: req.sessions, reason: "aankoop", stripe_ref: obj.id },
              { onConflict: "stripe_ref", ignoreDuplicates: true }
            );
            await admin.from("notifications").insert({ gym_id: req.gym_id, user_id: req.client_id, type: "system", title: `${req.sessions} sessietegoed bijgeschreven`, body: `Bij ${coach?.full_name || "je coach"} — je hoeft niet telkens opnieuw te betalen.`, link: "/account" });
          }
        }
      } else if (obj.metadata?.kind === "welcome" || obj.mode === "setup") {
        await handleWelcomeSetup(admin, obj);
      } else if (obj.metadata?.booking_id) {
        await markBookingPaid(admin, obj.metadata.booking_id, obj.payment_intent, obj);
      }
      // Stash the Stripe hosted receipt URL on the just-recorded payment (keyed by session id) so
      // members & coaches can download their betaalbewijs from their dashboard.
      try {
        if (obj.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(obj.payment_intent, { expand: ["latest_charge"] });
          const receipt = pi?.latest_charge?.receipt_url;
          if (receipt) await admin.from("payments").update({ receipt_url: receipt }).eq("stripe_id", obj.id).is("receipt_url", null);
        }
      } catch (e) { console.error("receipt capture:", e?.message); }
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
      await grantCredits(admin, prof.id, 1, "abo", false, obj.id);
      await recordPayment(admin, { gymId: prof.gym_id, userId: prof.id, amountCents: obj.amount_paid, kind: "abonnement", description: "Maandabonnement", stripeId: obj.id });
      if (obj.hosted_invoice_url) await admin.from("payments").update({ receipt_url: obj.hosted_invoice_url }).eq("stripe_id", obj.id);
      await admin.rpc("reward_pending_referral", { p_user: prof.id });
      // Welcome the new member on their first invoice; thank them each renewal.
      try {
        const first = reason === "subscription_create";
        await admin.from("notifications").insert({ gym_id: prof.gym_id, user_id: prof.id, type: "system", title: first ? "Welkom als member! 🎉" : "Je maandelijkse gratis sessie staat klaar", body: first ? "1 sessie inbegrepen staat klaar + je boekt voortaan aan € 12." : "+1 sessie bijgeschreven.", link: "/account" });
        if (first) {
          const { data: m } = await admin.from("profiles").select("email, full_name").eq("id", prof.id).single();
          if (m?.email) { const { sendMembershipActive } = await import("@/lib/email"); await sendMembershipActive({ to: m.email, name: m.full_name }); }
        }
      } catch {}
      return;
    }
    case "invoice.payment_failed": {
      const reason = obj.billing_reason || "";
      if (reason && !reason.startsWith("subscription")) return;
      const prof = await profileFromCustomer(admin, obj.customer);
      if (!prof) return;
      // Belt-and-suspenders: subscription.updated also flips status, but flag + nudge the member here.
      await admin.from("memberships").update({ status: "past_due" }).eq("user_id", prof.id).eq("status", "actief");
      try {
        await admin.from("notifications").insert({ gym_id: prof.gym_id, user_id: prof.id, type: "system", title: "Betaling mislukt", body: "Je maandbetaling lukte niet. Werk je betaalmethode bij via je account om member te blijven.", link: "/account" });
      } catch {}
      return;
    }
    case "charge.refunded":
      await handleRefund(admin, obj);
      return;
    default:
      return;
  }
}
