// De mand: meerdere momenten in één keer boeken en betalen.
//
// Ontwerp en alle redenen: docs/plans/2026-09-13-meerdere-momenten-boeken.md (v2). Dit bestand bevat enkel
// PURE functies — geen databank, geen Stripe — zodat het rekenwerk (wie betaalt wat, welke regel krijgt de korting,
// hoe de afrekenbanner groepeert) met tests vast te leggen is. De databankzijde staat in 0164, de webhook in
// lib/mand-afrekenen.js.

export const MAX_MOMENTEN = 8;

/** "di 22 sep 19:00" — altijd in de tijd van de gym, nooit in die van de server. */
export function momentLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const g = (t) => (p.find((x) => x.type === t)?.value || "").replace(".", "");
  // Intl schrijft "di." en "sep." met een punt; in een regel met acht momenten leest dat rommelig.
  return `${g("weekday")} ${g("day")} ${g("month")} ${g("hour")}:${g("minute")}`;
}

/**
 * Wat elke sessie in déze Stripe-sessie kost.
 *
 * Een kortingscode geldt in een mand voor ÉÉN sessie, niet voor het totaal (ontwerp v2 §F). Anders geeft één
 * eenmalige 100%-code acht gratis sessies. De korting landt op de eerste regel in de tijd.
 *
 * @param {Array<{id:string, starts_at:string, price_cents:number, charge_cents?:number|null}>} rijen  enkel de nog te betalen rijen
 * @param {{ codeId:string, cents:number } | null} korting  cents = prijs van die ene sessie ná korting
 * @returns {Array<{ booking_id:string, charge_cents:number, korting:boolean }>}
 */
export function mandLijnen(rijen, korting = null) {
  const gesorteerd = [...(rijen || [])].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  return gesorteerd.map((r, i) => {
    const vol = Math.max(0, Math.round(Number(r.price_cents) || 0));
    if (i === 0 && korting && Number.isFinite(korting.cents)) {
      return { booking_id: r.id, charge_cents: Math.max(0, Math.min(vol, Math.round(korting.cents))), korting: true };
    }
    return { booking_id: r.id, charge_cents: vol, korting: false };
  });
}

export const somCenten = (lijnen) => (lijnen || []).reduce((a, l) => a + (Number(l.charge_cents) || 0), 0);

/**
 * De afrekenbanner op /account: één blok per mand in plaats van acht knoppen "Betaal nu € 15".
 *
 * @param {Array<{id, order_id?, created_at, price_cents, charge_cents?, starts_at, services?}>} onbetaald
 * @param {number} holdMinuten
 */
export function groepeerOpenBetalingen(onbetaald, holdMinuten = 15) {
  const groepen = new Map();
  for (const b of onbetaald || []) {
    const sleutel = b.order_id || b.id;
    if (!groepen.has(sleutel)) {
      groepen.set(sleutel, {
        id: b.id, // één boeking-id: resumeCheckoutAction zoekt daaruit zelf de mand op
        orderId: b.order_id || null,
        name: b.services?.name || "Sessie",
        price: 0,
        momenten: [],
        // Alle rijen van een mand hebben dezelfde created_at (één transactie). Toch de vroegste nemen, zodat
        // een afwijking nooit een te ruime deadline toont.
        deadline: null,
      });
    }
    const g = groepen.get(sleutel);
    g.price += Number(b.charge_cents ?? b.price_cents) || 0;
    g.momenten.push(momentLabel(b.starts_at));
    const dl = new Date(new Date(b.created_at).getTime() + holdMinuten * 60000).toISOString();
    if (!g.deadline || dl < g.deadline) g.deadline = dl;
  }
  return [...groepen.values()];
}

/** De zin onder een mand in de banner en de mail: "di 22 sep 19:00 · do 24 sep 19:00". */
export const momentenZin = (momenten, max = 4) =>
  momenten.length <= max ? momenten.join(" · ") : `${momenten.slice(0, max).join(" · ")} · +${momenten.length - max}`;
