// De webhook-kant van de mand: een geslaagde Stripe-sessie afrekenen, en terugbetalingen boeken.
//
// Ontwerp v2 §A–§D. De regels die dit bestand bewaakt, telkens met de reden:
//
//  1. De SESSIE is de bron van waarheid. Welke boekingen en welke bedragen staan in booking_order_lines per sessie;
//     de beslissing zelf gebeurt in settle_booking_order (één SQL-transactie, onder slot). Hier wordt niets beslist
//     op basis van een eerder gelezen rij.
//  2. Volgorde: afrekenen → betaalrij → terugbetaling. De betaalrij staat er dus altijd vóór het refund-event van
//     Stripe binnenkomt; anders zou de terugbetaling een rij zoeken die nog niet bestaat.
//  3. Elke Supabase-fout GOOIT. De webhook geeft dan 500, het event-slot wordt vrijgegeven en Stripe probeert het
//     later opnieuw. Supabase zelf gooit niet — een `if (error)` die ontbreekt, is een half verwerkte betaling.
//  4. Een terugbetaling is een eigen, NEGATIEVE betaalrij (stripe_id = re_…). Omzet, btw en dashboards netten zo
//     vanzelf; geen enkel scherm moet een tweede kolom leren aftrekken.
//
// Alles van buitenaf komt als parameter binnen (admin, stripe, mail, meldingen), zodat dit met een nagebootste
// Stripe en databank te testen is — lib/mand-afrekenen.test.js.

import { momentLabel, momentenZin } from "./mand.js";

const gooiBij = (res, wat) => {
  if (res?.error) throw new Error(`${wat}: ${res.error.message || res.error}`);
  return res?.data;
};

const piVan = (x) => (typeof x === "string" ? x : x?.id || null);

/**
 * @param {object} deps { admin, stripe, stuurBevestiging, meldLid, meldBeheer, beloonAanbreng, registreerKorting }
 * @param {object} session  het Checkout Session-object uit het event
 * @returns {Promise<{confirmed:string[], refundCents:number, herhaald:boolean}>}
 */
export async function rekenMandAf(deps, session) {
  const { admin, stripe } = deps;
  const pi = piVan(session.payment_intent);
  const orderId = session.metadata?.order_id;
  if (!orderId) throw new Error("mand-sessie zonder order_id");

  const order = gooiBij(await admin.from("booking_orders").select("id, gym_id, user_id, discount_code_id").eq("id", orderId).single(), "mand lezen");
  const lijnen = gooiBij(await admin.from("booking_order_lines").select("booking_id, charge_cents").eq("session_id", session.id), "mandlijnen lezen") || [];
  if (!lijnen.length) throw new Error(`geen mandlijnen voor sessie ${session.id}`);

  // Minder betaald dan deze sessie aanrekende: niets bevestigen, alles terug, beheer verwittigen. Dit hoort nooit te
  // gebeuren; als het toch gebeurt, is een half bevestigde mand erger dan geen.
  const verwacht = lijnen.reduce((a, l) => a + (Number(l.charge_cents) || 0), 0);
  if (session.amount_total != null && session.amount_total < verwacht) {
    if (pi) {
      await stripe.refunds.create(
        { payment_intent: pi, metadata: { kind: "booking_order", order_id: orderId, session_id: session.id, reden: "bedrag" } },
        { idempotencyKey: `mand-bedrag:${session.id}` }
      );
    }
    await deps.meldBeheer?.(order.gym_id, `Mandbetaling afgewezen: € ${(session.amount_total / 100).toFixed(2)} ontvangen, € ${(verwacht / 100).toFixed(2)} verwacht — volledig teruggestort.`);
    return { confirmed: [], refundCents: session.amount_total, herhaald: false };
  }

  const uit = gooiBij(await admin.rpc("settle_booking_order", { p_session: session.id, p_pi: pi }), "mand afrekenen");
  const confirmed = uit?.confirmed || [];
  const refundIds = uit?.refund_booking_ids || [];
  const refundCents = Number(uit?.refund_cents) || 0;

  const rijen = gooiBij(await admin.from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, persons, payment_source, discount_code_id, services(name)")
    .in("id", lijnen.map((l) => l.booking_id)), "mandrijen lezen") || [];
  const perId = new Map(rijen.map((r) => [r.id, r]));
  const labels = (ids) => ids.map((id) => momentLabel(perId.get(id)?.starts_at)).filter(Boolean);
  const dienst = rijen[0]?.services?.name || "Sessie";

  // Betaalrij enkel als er iets bevestigd werd. Ging alles terug (dubbele betaling, alles vervallen), dan is er
  // geen omzet — een betaalrij plus een negatieve rij zou netto kloppen, maar een factuur van € 0 is ruis.
  if (confirmed.length) {
    gooiBij(await admin.from("payments").upsert({
      gym_id: order.gym_id, user_id: order.user_id, amount_cents: session.amount_total, kind: "booking",
      description: `Boeking · ${confirmed.length} × ${dienst} (${momentenZin(labels(confirmed))})`,
      stripe_id: session.id, order_id: orderId,
    }, { onConflict: "stripe_id" }).select("id").maybeSingle(), "betaalrij mand");
  }

  // De terugbetaling. Idempotent op de sessie: bij een herhaalde aflevering stuurt Stripe hetzelfde refund-object
  // terug in plaats van een tweede te maken (en de refund_id in de settlement houdt het ook na 24 uur tegen).
  let refundId = uit?.refund_id || null;
  if (refundCents > 0 && pi && !refundId) {
    const reden = confirmed.length ? "vervallen" : "dubbel";
    // De idempotencyKey geldt maar 24 uur, en Stripe probeert een event tot 3 dagen opnieuw. Lukte de refund de
    // vorige keer maar faalde het bewaren van refund_id, dan zou een late poging een TWEEDE keer terugstorten
    // (review #9). Daarom eerst kijken of deze sessie al een refund heeft.
    const eerder = await stripe.refunds.list({ payment_intent: pi, limit: 100 });
    const al = (eerder?.data || []).find((r) => r.metadata?.session_id === session.id && r.metadata?.reden !== "bedrag" && r.status !== "failed" && r.status !== "canceled");
    const re = al || await stripe.refunds.create({
      payment_intent: pi,
      amount: refundCents,
      metadata: { kind: "booking_order", order_id: orderId, session_id: session.id, reden, booking_ids: refundIds.join(",").slice(0, 490) },
    }, { idempotencyKey: `mand-refund:${session.id}` });
    refundId = re.id;
    gooiBij(await admin.from("booking_order_settlements").update({ refund_id: re.id }).eq("session_id", session.id), "refund-id bewaren");
    // Enkel een negatieve rij als er ook een positieve staat. Ging de hele sessie terug (dubbele betaling), dan is er
    // geen betaalrij geschreven — een losse negatieve rij zou de omzet onder nul trekken.
    if (confirmed.length) {
      await boekTerugbetaling(deps, { refund: re, gymId: order.gym_id, userId: order.user_id, orderId, omschrijving: `Terugbetaling · ${momentenZin(labels(refundIds))}` });
    }
    await deps.meldLid?.(order.gym_id, order.user_id, confirmed.length
      ? { titel: "Deel van je betaling teruggestort", tekst: `${momentenZin(labels(refundIds))} was niet meer vrij toen je betaling binnenkwam — € ${(refundCents / 100).toFixed(2).replace(".", ",")} gaat terug.` }
      : { titel: "Betaling teruggestort", tekst: "Deze momenten waren al betaald of niet meer vrij — we hebben het volledige bedrag teruggestort." });
  }

  // Mail, korting en aanbreng: precies EÉN keer per sessie, geclaimd op `nazorg_at`.
  //
  // Waarom niet op `herhaald`: als er hierboven iets faalt (Stripe-time-out, Supabase hikt), geeft de webhook 500
  // en levert Stripe opnieuw af. Bij die tweede aflevering is de settle `herhaald`, en dan zou de nazorg voorgoed
  // overgeslagen worden: een betaald lid zonder bevestigingsmail, en een eenmalige code die nooit verbruikt werd
  // (review #3/#6/#15). De claim slaagt maar één keer, dus een tweede mail is nog steeds onmogelijk.
  const claim = confirmed.length
    ? gooiBij(await admin.from("booking_order_settlements").update({ nazorg_at: new Date().toISOString() })
        .eq("session_id", session.id).is("nazorg_at", null).select("session_id"), "nazorg claimen")
    : null;
  if (claim?.length) {
    // De code pas verbruiken als de sessie waarop hij stond ook ECHT bevestigd is. "De eerste bevestigde lijn"
    // was zomaar een andere sessie: viel de kortingsregel weg, dan brandde de code op zonder korting te geven.
    const kortingId = confirmed.find((id) => perId.get(id)?.discount_code_id === order.discount_code_id);
    if (order.discount_code_id && kortingId) {
      try { await deps.registreerKorting?.(order.gym_id, order.discount_code_id, order.user_id, kortingId); }
      catch (e) { console.error("mand-korting:", e?.message); }
    }
    try { await deps.beloonAanbreng?.(order.user_id); } catch (e) { console.error("mand-aanbreng:", e?.message); }
    try {
      await deps.stuurBevestiging?.({
        userId: order.user_id,
        amountPaidCents: (session.amount_total || 0) - refundCents,
        teruggestortCents: refundCents,
        teruggestortMomenten: labels(refundIds),
        sessies: confirmed.map((id) => perId.get(id)).filter(Boolean).map((r) => ({
          bookingId: r.id, startsAt: r.starts_at, endsAt: r.ends_at, serviceName: r.services?.name, persons: r.persons,
        })),
      });
    } catch (e) { console.error("mand-bevestiging (betaling staat al geboekt):", e?.message); }
  }

  return { confirmed, refundCents, herhaald: !!uit?.herhaald, refundId };
}

/** Eén Stripe-refund als negatieve betaalrij. Idempotent op re_…-id; neemt de soort van de oorspronkelijke betaling over. */
export async function boekTerugbetaling({ admin }, { refund, gymId, userId, orderId, omschrijving, kind = "booking", status = "betaald" }) {
  if (!refund?.id || !(refund.amount > 0)) return;
  if (refund.status === "failed" || refund.status === "canceled") return;
  gooiBij(await admin.from("payments").upsert({
    gym_id: gymId, user_id: userId || null, amount_cents: -Math.abs(refund.amount), kind,
    description: omschrijving || "Terugbetaling", stripe_id: refund.id, order_id: orderId || null, status,
  }, { onConflict: "stripe_id" }), "terugbetaling boeken");
}

/**
 * Een GEDEELTELIJKE terugbetaling (charge.refunded met refunded=false). Boekt elke refund van de charge als
 * negatieve rij. Annuleert NIETS: wie terugbetaalt (adminCancelBooking, de mand-afrekening), heeft de boeking zelf
 * al geannuleerd. Een deelrefund die het annuleren overnam, annuleerde in de review sessies die met ander geld
 * betaald waren (#2, #14, #25).
 *
 * @returns {Promise<{geboekt:number, zonderHerkomst:number}>}  zonderHerkomst = refunds die niet van ons komen (dashboard)
 */
export async function boekDeelterugbetalingen(deps, charge) {
  const { admin, stripe } = deps;
  const pi = piVan(charge.payment_intent);
  if (!pi) return { geboekt: 0, zonderHerkomst: 0 };
  const lijst = await stripe.refunds.list({ payment_intent: pi, limit: 100 });
  let geboekt = 0, zonderHerkomst = 0;

  // Herkomst van het geld: de oorspronkelijke betaalrij (mand of enkele boeking) voor gym, lid en order.
  const { data: boeking } = await admin.from("bookings").select("gym_id, user_id, order_id, stripe_session_id").eq("stripe_payment_intent", pi).limit(1).maybeSingle();
  // Stripe levert events niet gegarandeerd op volgorde. Staat de oorspronkelijke betaling al op 'refunded' (de
  // volledige terugbetaling kwam eerst binnen), dan krijgt deze negatieve rij dezelfde status. Anders telt de omzet
  // het bedrag twee keer af en zakt ze onder nul.
  let status = "betaald";
  if (boeking?.stripe_session_id) {
    const { data: orig } = await admin.from("payments").select("status").eq("stripe_id", boeking.stripe_session_id).maybeSingle();
    if (orig?.status === "refunded") status = "refunded";
  }
  for (const re of lijst?.data || []) {
    if (!re.metadata?.kind && !re.metadata?.booking_id) zonderHerkomst++;
    if (!boeking) continue;
    await boekTerugbetaling(deps, {
      refund: re, gymId: boeking.gym_id, userId: boeking.user_id, orderId: re.metadata?.order_id || boeking.order_id, status,
      omschrijving: re.metadata?.reden === "annulering" ? "Terugbetaling · geannuleerde sessie" : "Terugbetaling",
    });
    geboekt++;
  }
  return { geboekt, zonderHerkomst };
}
