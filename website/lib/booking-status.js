// ONE shared definition of a booking's payment state + source label. The admin list, the
// booking-detail panel and the member account previously each had their own (drifted) heuristic —
// the admin one showed an unpaid €12 abo session with a green ✓ so the money was never chased.
// Works with both snake_case rows (payment_source/price_cents) and the camelCase BookingDetail DTO.

const src = (b) => b.payment_source ?? b.paymentSource;
const cents = (b) => b.price_cents ?? b.priceCents ?? 0;

// Settled = the gym has (or needs) no money for this booking: actually paid, a €0 booking, or a
// source that settles at creation (credit was debited, gratis/invite are free by design).
// An unpaid 'los' OR 'abo' booking is NOT settled — both owe a Stripe payment.
export function isSettled(b) {
  if (!b) return false;
  return !!b.paid || cents(b) === 0 || ["credit", "gratis_code", "invite"].includes(src(b));
}

// How the booking came in / how it's paid — for lists, panels and e-mails.
export function sourceLabel(b, { coachName } = {}) {
  const s = src(b);
  if (s === "abo") return "Abonnement";
  if (s === "credit") return "Beurtenkaart";
  if (s === "gratis_code") return "Gratis code";
  if (s === "invite") return "Uitgenodigd";
  if (coachName || b.coach_name || b.coachName) return "Via coach";
  return "Online";
}
