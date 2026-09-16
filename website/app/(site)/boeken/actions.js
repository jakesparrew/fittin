"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe, isStripeConfigured, bizGuest, invoiceForBusiness } from "@/lib/stripe";
import { sendBookingConfirmation, sendBookingsConfirmation } from "@/lib/email";
import { MAX_MOMENTEN, mandLijnen, somCenten, momentLabel } from "@/lib/mand";
import { sendBookingInvites } from "@/lib/booking-invites";
import { validateDiscount, recordRedemption } from "@/lib/discounts";
import { clearWaitlistEntry } from "@/lib/waitlist";

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
    ...invoiceForBusiness,
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
    // Alleen betaalmethodes die METEEN bevestigen. Een boeking houdt het uur 15 minuten vast; een
    // methode met uitgestelde afwikkeling (SEPA-incasso bevestigt pas na dagen) betekent dat het lid
    // betaalt, het uur intussen vrijvalt en de webhook dagen later automatisch terugstort — betaald,
    // geen sessie. Sinds SEPA-incasso op het Stripe-account aanstaat zou Stripe die hier vanzelf
    // aanbieden, dus we kiezen expliciet. Google Pay en Apple Pay rijden mee op "card".
    payment_method_types: ["card", "bancontact", "paypal", "link"],
    // De reservering zelf valt na 15 minuten vrij (0121). Stripe eist minstens 30 minuten voor
    // expires_at, dus dit venster kan niet gelijklopen — het is enkel een bovengrens die voorkomt
    // dat een trage SCA/Bancontact-betaling nog uren later binnenkomt. De webhook vangt een late
    // betaling op een intussen vrijgegeven uur af en stort automatisch terug.
    expires_at: Math.floor(Date.now() / 1000) + 32 * 60,
    success_url: `${siteUrl()}/account?betaald=1`,
    // Een afgebroken checkout eindigde op /boeken, terwijl de reservering (met aftelling én
    // "Betaal nu") op /account staat. Wie afhaakte, zag dus nergens dat hij nog 15 minuten had.
    cancel_url: `${siteUrl()}/account?betaling=afgebroken`,
  };
}

// De boek-RPC's schrijven hun weigeringen zelf in het Nederlands en markeren die met P0001.
// Elke andere databankfout is een technische code ("duplicate key value violates…") die een lid
// niets zegt en enkel doet twijfelen of er nu geboekt is of niet.
function bookingErrorText(error) {
  if (error?.code === "P0001" && error.message) return error.message;
  return "Dit moment kon niet geboekt worden. Ververs de pagina en probeer het opnieuw.";
}

// Creates the booking (slot held immediately). Free → confirm + email. Paid → Stripe Checkout URL.
// Maakt de checkout-sessie, met een vangnet op de methodelijst.
//
// De lijst hierboven is bewust beperkt tot methodes die meteen bevestigen. Weigert Stripe die lijst
// ooit — bv. omdat PayPal op dit account niet (meer) beschikbaar is — dan zou het aanmaken van de
// sessie falen en kon NIEMAND nog een sessie betalen. Daarom vallen we dan terug: eerst zonder
// PayPal, en als laatste redmiddel op de automatische keuze van Stripe. Betalen blijft zo altijd
// mogelijk; enkel de garantie "geen uitgestelde methode" valt in dat uiterste geval weg.
async function maakCheckout(params) {
  const zonderPaypal = { ...params, payment_method_types: (params.payment_method_types || []).filter((m) => m !== "paypal") };
  const { payment_method_types: _weg, ...automatisch } = params;
  for (const [poging, opties] of [["volledig", params], ["zonder paypal", zonderPaypal], ["automatisch", automatisch]]) {
    try {
      return await stripe.checkout.sessions.create(opties);
    } catch (e) {
      console.error(`checkout-sessie (${poging}) geweigerd:`, e?.message);
      if (poging === "automatisch") throw e;
    }
  }
}

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
    // Halve uren toegestaan (0117): 1 · 1,5 · 2 · … · 4. Afronden op 0,5 zodat er nooit een
    // ongeldige duur naar de RPC gaat (die valideert zelf ook).
    p_hours: Math.min(4, Math.max(1, Math.round((parseFloat(hours) || 1) * 2) / 2)),
  });
  if (error) return { error: bookingErrorText(error) };

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, persons, price_cents, paid, payment_source, services(name)")
    .eq("id", bookingId)
    .single();

  // Wie op de wachtlijst stond voor dit uur en het nu zelf boekt, mag daarna geen "Er is een plek
  // vrij 🎉" meer krijgen voor zijn eigen sessie. Zijn eigen wachtrij-rij is nu zinloos, dus weg.
  // Best-effort: clearWaitlistEntry slikt zijn eigen fouten — een boeking mag hier nooit op stuklopen.
  if (booking?.gym_id && booking?.starts_at) {
    await clearWaitlistEntry(createAdminClient(), { gymId: booking.gym_id, userId: user.id, slotInstant: booking.starts_at });
  }

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
    let creditBalance = null;
    if (booking) {
      const admin = createAdminClient();
      try { await sendBookingInvites(admin, booking, user.user_metadata?.full_name); } catch {}
      // A punch-card booking's confirmation doubles as the balance receipt.
      if (booking.payment_source === "credit") {
        // isFinite, niet isInteger: een 90-minutensessie kost 1,5 tegoed, dus halve saldi bestaan.
        // De integer-test liet die leden zonder saldoregel in hun bevestiging achter. De null-check
        // blijft nodig omdat Number(null) 0 is — een mislukte RPC mag geen "0 sessies" beloven.
        try { const { data: bal } = await admin.rpc("credits_balance", { p_user: user.id }); if (bal != null && Number.isFinite(Number(bal))) creditBalance = Number(bal); } catch {}
      }
    }
    await sendBookingConfirmation({
      to: user.email,
      name: user.user_metadata?.full_name,
      serviceName: booking?.services?.name || "Sessie",
      startsAt: booking?.starts_at,
      endsAt: booking?.ends_at,
      persons: booking?.persons || 1,
      free: true,
      paymentSource: booking?.payment_source,
      creditBalance,
      bookingId: booking?.id, // → agenda-item als bijlage
    });
    // bookingId gaat mee zodat het bevestigingsscherm meteen een agenda-item kan aanbieden.
    return { ok: true, free: true, bookingId: booking?.id || null };
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
        bookingId: booking.id, // → agenda-item als bijlage
      });
    } catch {}
    try { await sendBookingInvites(admin, booking, user.user_metadata?.full_name); } catch {}
    revalidatePath("/account");
    revalidatePath("/boeken");
    return { ok: true, free: true, bookingId: booking.id };
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

  const session = await maakCheckout(checkoutParams(booking, user.email, chargeCents, codeId));
  await supabase.from("bookings").update({ stripe_session_id: session.id }).eq("id", booking.id);
  // Persist the agreed charge + code (bookings columns are member-locked → service role) so a
  // resumed checkout re-charges the same amount. The redemption is recorded by the Stripe webhook
  // only AFTER payment succeeds, so abandoning checkout no longer burns a one-time code.
  await createAdminClient().from("bookings").update({ charge_cents: chargeCents, discount_code_id: codeId }).eq("id", booking.id);
  return { ok: true, checkoutUrl: session.url };
}

// ==============================================================================================================
// Meerdere momenten in één keer — de mand (0164, ontwerp docs/plans/2026-09-13-meerdere-momenten-boeken.md v2)
// ==============================================================================================================
//
// Eén moment gaat NIET hierlangs: dat blijft createBookingAction, met buddies, uitnodigingen en de welkomstsessie.
// Hier: 2 tot 8 momenten, zelfde dienst, duur en personen, alles-of-niets in de databank, één Stripe-sessie.

const OPEN_RIJ = (r) => r.status === "bevestigd" && !r.paid && (Number(r.price_cents) || 0) > 0;

// Wat te doen met een mand die er al staat (zelfde clientKey). Nooit opnieuw boeken, nooit een tweede mail:
// hooguit de betaling hervatten.
async function hervatIndiening(admin, user, order) {
  const orderId = order.id;
  if (order.status === "betaald") return { ok: true, free: !order.stripe_session_id, verwerkt: !!order.stripe_session_id, orderId };
  if (order.status !== "open") return { error: "Deze boeking is intussen verlopen. Kies je momenten opnieuw." };
  let hervat = null;
  try { hervat = await hervatMand(admin, user, orderId); }
  catch (e) {
    console.error("hervatIndiening:", e?.message);
    return { error: "Je momenten staan vast, maar de betaallink kon niet gemaakt worden. Rond af via je account." };
  }
  if (hervat?.verwerkt) return { ok: true, verwerkt: true, orderId };
  if (hervat?.url) return { ok: true, checkoutUrl: hervat.url, orderId };
  return { error: "Deze boeking is intussen verlopen. Kies je momenten opnieuw." };
}

export async function createBookingsAction({ serviceId, slots, persons, hours, useCredit, discountCode, clientKey }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Je moet ingelogd zijn om te boeken." };

  const momenten = (Array.isArray(slots) ? slots : [])
    .map((s) => ({ date: String(s?.date || ""), hour: Number(s?.hour) }))
    .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date) && Number.isFinite(s.hour));
  if (momenten.length < 2) return { error: "Kies minstens twee momenten." };
  if (momenten.length > MAX_MOMENTEN) return { error: `Je kan maximaal ${MAX_MOMENTEN} momenten in één keer boeken.` };
  const uren = Math.min(4, Math.max(1, Math.round((parseFloat(hours) || 1) * 2) / 2));
  const key = /^[0-9a-f-]{36}$/i.test(String(clientKey || "")) ? String(clientKey) : null;
  const admin = createAdminClient();

  // Een HERHAALDE indiening herkennen aan het BESTAAN van de mand, niet aan haar leeftijd.
  //
  // De client probeert zelf al na ~1,2 s opnieuw als het antwoord wegvalt. Een leeftijdsdrempel van 20 s werd
  // daardoor nooit gehaald: de hele flow liep dan een tweede keer, met een tweede bevestigingsmail en een tweede
  // Stripe-sessie waarvan de eerste open bleef staan (review #2).
  if (key) {
    const { data: bestaand } = await admin.from("booking_orders")
      .select("id, status, stripe_session_id").eq("user_id", user.id).eq("client_key", key).maybeSingle();
    if (bestaand) return await hervatIndiening(admin, user, bestaand);
  }

  // De kortingscode VÓÓR de databank: een foute code mag geen acht momenten een kwartier laten vastzitten.
  // Gevalideerd op de lijstprijs van één sessie; na het boeken herberekend op de echte prijs (abo/los).
  let codeVooraf = null;
  if (discountCode && !useCredit) {
    const [{ data: prof }, { data: srv }] = await Promise.all([
      supabase.from("profiles").select("gym_id").eq("id", user.id).single(),
      supabase.from("services").select("price_cents").eq("id", serviceId).maybeSingle(),
    ]);
    const d = await validateDiscount(prof?.gym_id, user.id, discountCode, Math.round((srv?.price_cents || 0) * uren));
    if (d.error) return { error: d.error };
    if (d.ok) codeVooraf = discountCode;
  }

  const { data: orderId, error } = await supabase.rpc("create_booking_batch", {
    p_service: serviceId,
    p_slots: momenten,
    p_persons: persons,
    p_hours: uren,
    p_use_credit: !!useCredit,
    p_client_key: key,
  });
  // `hint` draagt de index van het moment dat faalde; het scherm markeert precies dat moment.
  if (error) return { error: bookingErrorText(error), momentIndex: error.hint != null && error.hint !== "" ? Number(error.hint) : null };

  // Vanaf hier geldt: wat ook misloopt, de momenten mogen niet 15 minuten blijven hangen.
  const ruimOp = async () => {
    await admin.from("bookings").update({ status: "geannuleerd", cancelled_at: new Date().toISOString() })
      .eq("order_id", orderId).eq("paid", false).eq("status", "bevestigd");
    await admin.from("booking_orders").update({ status: "geannuleerd" }).eq("id", orderId).eq("status", "open");
  };

  const { data: order } = await admin.from("booking_orders")
    .select("id, gym_id, user_id, status, stripe_session_id, created_at").eq("id", orderId).single();
  // De RPC sláágde, dus de momenten staan vast. Zonder opruimen blijven ze een kwartier bezet en botst het lid
  // 15 minuten lang op de hamsterrem (review #5).
  if (!order) { await ruimOp(); return { error: "Er liep iets mis bij het boeken. Probeer het opnieuw." }; }
  // Een sleutel van een mand die intussen geannuleerd of verlopen is: niets bevestigen, opnieuw laten kiezen.
  if (order.status === "geannuleerd" || order.status === "verlopen") {
    return { error: "Deze boeking is intussen verlopen. Kies je momenten opnieuw." };
  }

  try {
    const { data: rijen, error: re } = await admin.from("bookings")
      .select("id, gym_id, starts_at, ends_at, persons, price_cents, charge_cents, paid, status, payment_source, services(name)")
      .eq("order_id", orderId).order("starts_at");
    if (re || !rijen?.length) throw new Error(re?.message || "mand zonder rijen");

    for (const r of rijen) {
      await clearWaitlistEntry(admin, { gymId: r.gym_id, userId: user.id, slotInstant: r.starts_at });
    }
    revalidatePath("/account");
    revalidatePath("/boeken");

    // Alles al rond (tegoed): meteen bevestigen. Op de STATUS van de mand, niet afgeleid uit de rijen — een rij die
    // niet open is, kan ook geannuleerd zijn.
    if (order.status === "betaald") {
      let creditBalance = null;
      if (rijen[0].payment_source === "credit") {
        try { const { data: bal } = await admin.rpc("credits_balance", { p_user: user.id }); if (bal != null && Number.isFinite(Number(bal))) creditBalance = Number(bal); } catch {}
      }
      try {
        await sendBookingsConfirmation({
          to: user.email, name: user.user_metadata?.full_name, paymentSource: rijen[0].payment_source, creditBalance,
          sessies: rijen.map((r) => ({ bookingId: r.id, startsAt: r.starts_at, endsAt: r.ends_at, serviceName: r.services?.name, persons: r.persons })),
        });
      } catch (e) { console.error("mand-bevestiging (tegoed):", e?.message); }
      return { ok: true, free: true, orderId, bookingIds: rijen.map((r) => r.id) };
    }

    // Korting op ÉÉN sessie, herberekend op de echte prijs van de eerste regel.
    let korting = null;
    if (codeVooraf) {
      const eerste = rijen.filter(OPEN_RIJ).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
      const d = await validateDiscount(eerste.gym_id, user.id, codeVooraf, eerste.price_cents);
      if (d.error) { await ruimOp(); return { error: d.error }; }
      if (d.ok) korting = { codeId: d.codeId, cents: d.cents };
    }

    if (!isStripeConfigured) {
      if (process.env.NODE_ENV === "production") { await ruimOp(); return { error: "Betalen is tijdelijk niet beschikbaar. Probeer het later opnieuw." }; }
      return { ok: true, unpaid: true, orderId };
    }

    const uit = await maakMandCheckout(admin, { order, rijen: rijen.filter(OPEN_RIJ), email: user.email, korting });
    // Volledig met een kortingscode betaald: geen Checkout, wel dezelfde bevestigingsmail als bij tegoed.
    if (uit?.gratis) {
      try {
        await sendBookingsConfirmation({
          to: user.email, name: user.user_metadata?.full_name, paymentSource: "gratis_code",
          sessies: rijen.map((r) => ({ bookingId: r.id, startsAt: r.starts_at, endsAt: r.ends_at, serviceName: r.services?.name, persons: r.persons })),
        });
      } catch (e) { console.error("mand-bevestiging (korting):", e?.message); }
      return { ok: true, free: true, orderId, bookingIds: uit.bookingIds };
    }
    return { ok: true, checkoutUrl: uit?.url || null, orderId };
  } catch (e) {
    console.error("createBookingsAction:", e?.message);
    // Een mand die met tegoed betaald werd, is al afgeboekt en bevestigd: opruimen doet niets en "er staat niets
    // vast" is dan gewoon onwaar (review #5). Eerst kijken hoe de mand er echt voor staat.
    const { data: o } = await admin.from("booking_orders").select("status").eq("id", orderId).maybeSingle();
    if (o?.status === "betaald") return { ok: true, free: true, orderId };
    await ruimOp();
    return { error: "Er liep iets mis bij het afrekenen. Er staat niets vast — probeer het opnieuw." };
  }
}

// Eén Stripe-sessie voor de open rijen van een mand. De LIJNEN worden bewaard vóór de betaallink teruggaat: de
// webhook beslist uitsluitend op wat in déze sessie aangerekend werd (ontwerp v2 §A).
async function maakMandCheckout(admin, { order, rijen, email, korting }) {
  const lijnen = mandLijnen(rijen, korting);
  if (!lijnen.length) return null;

  // Stripe rekent geen regel van € 0 aan. Een gratis sessie valt dus uit de Checkout, maar BLIJFT in de mand:
  // ze staat in booking_order_lines en wordt door settle_booking_order samen met de rest bevestigd.
  //
  // Waarom niet meteen bevestigen (review, §A/§B): een sessie die buiten de mand om op paid gezet wordt,
  // overleeft een afgebroken checkout (ruimOp raakt alleen paid=false), krijgt nooit een bevestigingsmail, en
  // verbrandt de eenmalige code terwijl het lid niets geboekt heeft.
  const teBetalen = lijnen.filter((l) => l.charge_cents > 0);

  // Is de HELE mand gratis (kan alleen bij één moment), dan is er niets om af te rekenen en bevestigen we ze
  // in haar geheel — alles-of-niets blijft gelden, want het gaat om alle regels samen.
  if (!teBetalen.length) {
    const ids = lijnen.map((l) => l.booking_id);
    const bev = await admin.from("bookings").update({ paid: true, charge_cents: 0, discount_code_id: korting?.codeId || null }, { count: "exact" })
      .in("id", ids).eq("paid", false);
    if (bev.error) throw new Error(bev.error.message);
    if (bev.count !== ids.length) throw new Error("gratis mand niet volledig bevestigd");
    const ord = await admin.from("booking_orders").update({ status: "betaald", total_cents: 0, discount_code_id: korting?.codeId || null }, { count: "exact" })
      .eq("id", order.id).eq("status", "open");
    if (ord.error) throw new Error(ord.error.message);
    if (korting?.codeId) await recordRedemption(order.gym_id, korting.codeId, order.user_id, ids[0]);
    return { gratis: true, bookingIds: ids };
  }

  const perId = new Map(rijen.map((r) => [r.id, r]));
  const params = {
    mode: "payment",
    customer_email: email,
    ...bizGuest,
    ...invoiceForBusiness,
    line_items: teBetalen.map((l) => {
      const r = perId.get(l.booking_id);
      return {
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: l.charge_cents,
          product_data: {
            name: `${r?.services?.name || "Sessie"} — ${momentLabel(r?.starts_at)}${l.korting ? " (korting)" : ""}`,
            metadata: { booking_id: l.booking_id },
          },
        },
      };
    }),
    metadata: { kind: "booking_order", order_id: order.id, ...(korting?.codeId ? { discount_code_id: korting.codeId } : {}) },
    payment_method_types: ["card", "bancontact", "paypal", "link"],
    expires_at: Math.floor(Date.now() / 1000) + 32 * 60,
    success_url: `${siteUrl()}/account?betaald=1`,
    cancel_url: `${siteUrl()}/account?betaling=afgebroken`,
  };

  const session = await maakCheckout(params);
  const { error: le } = await admin.from("booking_order_lines").insert(
    lijnen.map((l) => ({ session_id: session.id, booking_id: l.booking_id, order_id: order.id, charge_cents: l.charge_cents }))
  );
  if (le) {
    // Zonder lijnen kan de webhook deze betaling niet toewijzen. De link mag dus nooit bij het lid belanden.
    try { await stripe.checkout.sessions.expire(session.id); } catch {}
    throw new Error(`mandlijnen niet bewaard: ${le.message}`);
  }
  // Deze updates moeten lukken. Blijft de order zonder stripe_session_id achter, dan laat hervatten sessie A niet
  // vervallen en zijn A en B allebei betaalbaar — twee betalingen (review #4). Supabase gooit zelf niet, dus:
  // controleren, de sessie laten vervallen, en gooien zodat de URL nooit bij het lid belandt.
  const mislukt = async (wat) => {
    try { await stripe.checkout.sessions.expire(session.id); } catch {}
    throw new Error(wat);
  };
  const ord = await admin.from("booking_orders")
    .update({ stripe_session_id: session.id, total_cents: somCenten(lijnen), discount_code_id: korting?.codeId || null }, { count: "exact" })
    .eq("id", order.id);
  if (ord.error || !ord.count) await mislukt(`mand niet bijgewerkt: ${ord.error?.message || "0 rijen"}`);
  for (const l of lijnen) {
    const bk = await admin.from("bookings")
      .update({ charge_cents: l.charge_cents, discount_code_id: l.korting ? korting?.codeId || null : null, stripe_session_id: session.id }, { count: "exact" })
      .eq("id", l.booking_id);
    if (bk.error || !bk.count) await mislukt(`boeking niet bijgewerkt: ${bk.error?.message || "0 rijen"}`);
  }
  return { url: session.url };
}

// Een mand opnieuw laten betalen. Eerst kijken hoe de VORIGE sessie ervoor staat: een sessie die al 'complete' is,
// betekent dat er een betaling onderweg is (trage bank-app, webhook nog niet binnen). Dan geen tweede link — dat
// was precies hoe een lid twee keer kon betalen (review #1).
async function hervatMand(admin, user, orderId) {
  if (!isStripeConfigured) return null;
  const { data: order } = await admin.from("booking_orders")
    .select("id, gym_id, user_id, status, stripe_session_id, discount_code_id").eq("id", orderId).eq("user_id", user.id).maybeSingle();
  if (!order || order.status !== "open") return null;

  if (order.stripe_session_id) {
    const vorige = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
    if (vorige.status === "complete") return { verwerkt: true };
    // Bewust NIET in een try: lukt het vervallen niet, dan mag er ook geen nieuwe sessie komen.
    if (vorige.status === "open") await stripe.checkout.sessions.expire(order.stripe_session_id);
  }

  const { data: rijen } = await admin.from("bookings")
    .select("id, gym_id, starts_at, ends_at, price_cents, charge_cents, discount_code_id, paid, status, services(name)")
    .eq("order_id", orderId).order("starts_at");
  const open = (rijen || []).filter(OPEN_RIJ);
  if (!open.length) return null;

  // De afgesproken korting blijft, als de code nog geldig is. Anders gewoon de volle prijs.
  let korting = null;
  const metKorting = open.find((r) => r.discount_code_id);
  if (metKorting) {
    const { data: dc } = await admin.from("discount_codes").select("active, expires_at, max_uses, used_count").eq("id", metKorting.discount_code_id).maybeSingle();
    const geldig = dc && dc.active && !(dc.expires_at && new Date(dc.expires_at) < new Date()) && !(dc.max_uses != null && dc.used_count >= dc.max_uses);
    if (geldig && metKorting.id === open[0].id) korting = { codeId: metKorting.discount_code_id, cents: metKorting.charge_cents ?? metKorting.price_cents };
  }
  const uit = await maakMandCheckout(admin, { order, rijen: open, email: user.email, korting });
  if (uit?.gratis) return { verwerkt: true };
  return uit?.url ? { url: uit.url } : null;
}

// Vind terug wat een afgebroken boeking heeft achtergelaten.
//
// Valt het netwerk weg NA het aanmaken van de boeking maar VÓÓR het antwoord, dan weet de
// browser niet of er iets gebeurd is. Blind opnieuw proberen zou dan een tweede boeking maken
// (en bij een betaalde sessie een tweede reservering). Daarom kijkt de client eerst hier:
// bestaat er al een boeking van deze gebruiker op exact dit moment, aangemaakt in de laatste
// 10 minuten? Zo ja, dan was de eerste poging geslaagd en mag er niets meer aangemaakt worden.
const slotKeyOf = (iso) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso));
  const g = (t) => p.find((x) => x.type === t)?.value;
  let hh = g("hour"); if (hh === "24") hh = "0";
  return `${g("year")}-${g("month")}-${g("day")}:${parseInt(hh, 10) + (parseInt(g("minute"), 10) >= 30 ? 0.5 : 0)}`;
};

export async function recoverBookingAction({ date, hour }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { found: false };

  const since = new Date(Date.now() - 10 * 60000).toISOString();
  const { data: rows } = await supabase
    .from("bookings")
    .select("id, starts_at, paid, price_cents, status")
    .eq("user_id", user.id)
    .eq("status", "bevestigd")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(10);

  const want = `${date}:${Number(hour)}`;
  const match = (rows || []).find((b) => slotKeyOf(b.starts_at) === want);
  if (!match) return { found: false };
  // Al rond (gratis, tegoed of betaald): niets meer doen, gewoon de bevestiging tonen.
  if (match.paid || match.price_cents === 0) return { found: true, done: true };
  // Onbetaalde reservering: geef een verse checkout-link mee, anders vervalt het slot na 15 min.
  const url = await buildResumeCheckout(supabase, user, match.id);
  return url ? { found: true, checkoutUrl: url } : { found: true, done: true };
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
  // Hoort deze boeking bij een mand, dan wordt de HELE mand hervat. Per sessie hervatten liet de gedeelde
  // Stripe-sessie vervallen en rekende maar één sessie aan (review #26).
  const { data: rij } = await supabase.from("bookings").select("order_id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (rij?.order_id) {
    const hervat = await hervatMand(createAdminClient(), user, rij.order_id);
    if (hervat?.verwerkt) redirect("/account?betaling=verwerkt");
    if (hervat?.url) redirect(hervat.url);
    return;
  }
  const url = await buildResumeCheckout(supabase, user, id);
  if (url) redirect(url);
}

// Gedeeld door "Afrekenen" op /account en door het netwerkherstel hierboven: maak een verse
// Checkout-sessie voor een bestaande, nog onbetaalde reservering. Geeft null als dat niet (meer) mag.
async function buildResumeCheckout(supabase, user, id) {
  if (!id || !isStripeConfigured) return null;

  const { data: booking } = await supabase
    .from("bookings")
    .select("id, price_cents, charge_cents, discount_code_id, paid, status, stripe_session_id, services(name)")
    .eq("id", id)
    .eq("user_id", user.id)
    // Een mandrij hervat je nooit los — dat gaat via hervatMand (zie resumeCheckoutAction).
    .is("order_id", null)
    .maybeSingle();
  // Only resume a still-held, unpaid booking. A cancelled/expired slot must not spawn a new checkout.
  if (!booking || booking.paid || booking.status !== "bevestigd") return null;

  // Prevent a DOUBLE charge: expire the previous Checkout session before opening a new one, so a
  // slow payment on the old link can't land alongside the new one. Best-effort (old link may already
  // be expired/completed).
  if (booking.stripe_session_id) {
    try { await stripe.checkout.sessions.expire(booking.stripe_session_id); } catch {}
  }

  // Re-use the originally agreed (possibly discounted) amount + code, not the full list price —
  // but re-check the code first: it may have been exhausted/deactivated since the booking was made.
  let chargeCents = booking.charge_cents ?? undefined;
  let codeId = booking.discount_code_id || null;
  if (codeId) {
    const admin = createAdminClient();
    const { data: dc } = await admin.from("discount_codes").select("active, expires_at, max_uses, used_count").eq("id", codeId).maybeSingle();
    const stillValid = dc && dc.active
      && !(dc.expires_at && new Date(dc.expires_at) < new Date())
      && !(dc.max_uses != null && dc.used_count >= dc.max_uses);
    if (!stillValid) {
      chargeCents = booking.price_cents; codeId = null;
      await admin.from("bookings").update({ charge_cents: booking.price_cents, discount_code_id: null }).eq("id", id);
    }
  }
  const session = await maakCheckout(checkoutParams(booking, user.email, chargeCents, codeId));
  await supabase.from("bookings").update({ stripe_session_id: session.id }).eq("id", id);
  return session.url;
}

// Batch 5.5 — join/leave the waitlist for a full slot (logged-in members only). When the slot later
// frees (cancel/reschedule), the earliest waiters get a bell + e-mail (see lib/waitlist notifyWaitlist).
export async function toggleWaitlistAction({ date, hour }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Log in om je op de wachtlijst te zetten." };
  const h = parseFloat(hour);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(h)) return { error: "Ongeldig tijdslot." };
  const { slotInstant } = await import("@/lib/time");
  const { data: prof } = await supabase.from("profiles").select("gym_id").eq("id", user.id).single();
  if (!prof?.gym_id) return { error: "Geen gym gekoppeld." };
  const iso = slotInstant(date, h).toISOString();

  // Toggle: already on the list → remove; otherwise add.
  const { data: existing } = await supabase.from("slot_waitlist").select("id").eq("gym_id", prof.gym_id).eq("user_id", user.id).eq("slot_instant", iso).maybeSingle();
  if (existing) {
    await supabase.from("slot_waitlist").delete().eq("id", existing.id);
    return { ok: true, on: false, message: "Van de wachtlijst gehaald." };
  }
  const { error } = await supabase.from("slot_waitlist").insert({ gym_id: prof.gym_id, user_id: user.id, slot_instant: iso });
  if (error) return { error: "Kon je niet op de wachtlijst zetten." };
  return { ok: true, on: true, message: "Je staat op de wachtlijst — we mailen je zodra er een plek vrijkomt." };
}
