"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, isStripeConfigured, bizGuest } from "@/lib/stripe";
import { sendBookingConfirmation } from "@/lib/email";
import { sendBookingInvites } from "@/lib/booking-invites";
import { validateDiscount, recordRedemption } from "@/lib/discounts";

// Search gym members to invite to a session (name + id only — no contact details exposed).
// Uses an RLS-safe security-definer RPC (search_members) scoped to the caller's own gym,
// instead of the service-role client which bypassed RLS.
export async function searchMembersAction(q) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.rpc("search_members", { p_q: String(q || "").trim() });
  return (data || []).map((p) => ({ id: p.id, name: p.full_name || "Lid" }));
}

// Live discount preview for the checkout panel. The server re-validates at booking time too, so this
// is display-only confidence — the authoritative discount is recomputed in createBookingAction.
export async function validateDiscountAction(code, baseCents) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log eerst in." };
  const { data: prof } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!prof?.gym_id) return { error: "Geen profiel gevonden." };
  const base = Math.max(0, parseInt(baseCents, 10) || 0);
  const d = await validateDiscount(prof.gym_id, user.id, String(code || ""), base);
  if (d.error) return { error: d.error };
  if (d.none) return { error: "Geef een kortingscode in." };
  return { ok: true, cents: d.cents, off: base - d.cents, label: d.label };
}

const siteUrl = () => process.env.NEXT_PUBLIC_SITE_URL || "https://fittin.be";

function checkoutParams(booking, email, chargeCents, codeId) {
  return {
    mode: "payment",
    customer_email: email,
    ...bizGuest,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: chargeCents ?? booking.price_cents,
          product_data: { name: `${booking.services?.name || "Sessie"} — Fittin'` },
        },
      },
    ],
    metadata: { booking_id: booking.id, ...(codeId ? { discount_code_id: codeId } : {}) },
    // Cap the payment window (~32 min) so it can't outlive the 35-min unpaid-slot hold (migration 0089).
    // Prevents a slow SCA/Bancontact payment from landing after the slot was freed/re-booked.
    expires_at: Math.floor(Date.now() / 1000) + 32 * 60,
    success_url: `${siteUrl()}/account?betaald=1`,
    cancel_url: `${siteUrl()}/boeken?geannuleerd=1`,
  };
}

// Creates the booking (slot held immediately). Free → confirm + email. Paid → Stripe Checkout URL.
export async function createBookingAction({ serviceId, date, hour, persons, useWelcome, coachId, useCredit, discountCode, buddyIds, participantIds, emailInvites, hours }) {
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
    p_hours: Math.min(4, Math.max(1, parseInt(hours, 10) || 1)),
  });
  if (error) return { error: error.message };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, persons, price_cents, paid, payment_source, services(name)")
    .eq("id", bookingId)
    .single();

  // Persist the invitees now, but DON'T e-mail them yet. Invites are sent only once the booking is
  // CONFIRMED — immediately below for free/credit bookings, or from the Stripe webhook after a paid
  // booking's payment succeeds. This way an abandoned (unpaid) checkout never e-mails the invitees.
  // Members invited along (capped at the booking's person count). Their attendance counts for them.
  const invitees = (Array.isArray(participantIds) && participantIds.length ? participantIds : buddyIds) || [];
  if (invitees.length && booking) {
    await supabase.rpc("add_booking_participants", { p_booking: booking.id, p_users: invitees });
  }

  // Invite NON-members by e-mail. Anti-abuse: capped at the booking's free spots, e-mail-validated,
  // de-duped, members added directly (not e-mailed), and a 20/day per-inviter cap (no mass mailing).
  const emails = Array.isArray(emailInvites) ? emailInvites : [];
  const freeSpots = Math.max(0, (parseInt(persons, 10) || 1) - 1 - invitees.length);
  if (emails.length && booking && freeSpots > 0) {
    try {
      const admin = createAdminClient();
      const clean = [...new Set(emails.map((e) => String(e || "").trim().toLowerCase()))]
        .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e !== (user.email || "").toLowerCase())
        .slice(0, freeSpots);
      const since = new Date(Date.now() - 86400000).toISOString();
      const { count: sentToday } = await admin.from("email_invites").select("id", { count: "exact", head: true }).eq("inviter_id", user.id).gte("created_at", since);
      let budget = Math.max(0, 20 - (sentToday || 0));
      for (const email of clean) {
        if (budget <= 0) break;
        const { data: member } = await admin.from("profiles").select("id").eq("email", email).eq("gym_id", booking.gym_id).maybeSingle();
        if (member) {
          // Existing member → add as a participant; they're invited via sendBookingInvites on confirm.
          await supabase.rpc("add_booking_participants", { p_booking: booking.id, p_users: [member.id] });
        } else {
          // Non-member → record the pending invite; the e-mail is sent on confirm.
          await admin.from("email_invites").insert({ gym_id: booking.gym_id, inviter_id: user.id, email, booking_id: booking.id });
          budget--;
        }
      }
    } catch {}
  }

  // Mark the FittinWelcome free session as used (also blocks re-claiming with a new card).
  // welcome_status is a protected column (members can't self-edit it) → write via service role.
  if (booking?.payment_source === "gratis_code") {
    await createAdminClient().from("profiles").update({ welcome_status: "used" }).eq("id", user.id);
  }

  revalidatePath("/account");
  revalidatePath("/boeken");

  // Free (FittinWelcome) or zero-price → confirmed now, so the invitees can be e-mailed.
  if (!booking || booking.paid || booking.price_cents === 0) {
    if (booking) { try { await sendBookingInvites(createAdminClient(), booking, user.user_metadata?.full_name); } catch {} }
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

  // Optional discount code (e.g. an activation win-back) → reduce the amount charged.
  let chargeCents = booking.price_cents;
  let codeId = null;
  if (discountCode) {
    const d = await validateDiscount(booking.gym_id, user.id, discountCode, booking.price_cents);
    if (d.error) return { error: d.error };
    if (d.ok) { chargeCents = d.cents; codeId = d.codeId; }
  }

  // A 100%-off code brings the charge to €0. Stripe Checkout cannot bill €0, so confirm the
  // booking as free directly (mark paid, record the one-time redemption, e-mail the confirmation)
  // instead of handing off to Stripe.
  if (codeId && chargeCents === 0) {
    const admin = createAdminClient();
    await admin.from("bookings").update({ paid: true, charge_cents: 0, discount_code_id: codeId }).eq("id", booking.id);
    try { await recordRedemption(booking.gym_id, codeId, user.id, booking.id); } catch {}
    try {
      await sendBookingConfirmation({
        to: user.email,
        name: user.user_metadata?.full_name,
        serviceName: booking.services?.name || "Sessie",
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        persons: booking.persons || 1,
        free: true,
      });
    } catch {}
    try { await sendBookingInvites(admin, booking, user.user_metadata?.full_name); } catch {}
    revalidatePath("/account");
    revalidatePath("/boeken");
    return { ok: true, free: true };
  }

  // Paid: hand off to Stripe Checkout. In production a missing Stripe key must NOT silently confirm a
  // free unpaid slot — cancel the held booking and fail loudly. (Dev keeps the unpaid confirm.)
  if (!isStripeConfigured) {
    if (process.env.NODE_ENV === "production") {
      await createAdminClient().from("bookings").update({ status: "geannuleerd", cancelled_at: new Date().toISOString() }).eq("id", booking.id);
      return { error: "Betalen is tijdelijk niet beschikbaar. Probeer het later opnieuw." };
    }
    return { ok: true, unpaid: true };
  }

  const session = await stripe.checkout.sessions.create(checkoutParams(booking, user.email, chargeCents, codeId));
  await supabase.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);
  // Persist the agreed charge + code (bookings columns are member-locked → service role) so a
  // resumed checkout re-charges the same amount. The redemption is recorded by the Stripe webhook
  // only AFTER payment succeeds, so abandoning checkout no longer burns a one-time code.
  await createAdminClient().from("bookings").update({ charge_cents: chargeCents, discount_code_id: codeId }).eq("id", booking.id);
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
    .select("id, price_cents, charge_cents, discount_code_id, paid, services(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!booking || booking.paid) return;

  // Re-use the originally agreed (possibly discounted) amount + code, not the full list price.
  const session = await stripe.checkout.sessions.create(
    checkoutParams(booking, user.email, booking.charge_cents ?? undefined, booking.discount_code_id || null)
  );
  await supabase.from("bookings").update({ stripe_session_id: session.id }).eq("id", id);
  redirect(session.url);
}
