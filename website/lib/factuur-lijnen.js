// De regels van een factuur, gedeeld door de beheerfactuur en de factuur die het lid zelf opent.
//
// Voor een MAND (0164) is één regel "Boeking · Fit60 × 1 — € 45" inhoudelijk fout: het is een btw-document voor drie
// sessies op drie data. De regels komen dus uit booking_order_lines van precies deze Stripe-sessie, met de datum van
// elke sessie. Werd een deel later teruggestort, dan is dat een eigen, negatieve betaalrij (een creditnota met een eigen
// nummer) — deze factuur blijft het bedrag van de oorspronkelijke betaling tonen, zoals het hoort.

import { momentLabel } from "./mand.js";

const KIND = { booking: "Sessie", beurtenkaart: "Beurtenkaart", abonnement: "Abonnement", coach_credits: "Coach-sessietegoed", overig: "Dienst" };

/**
 * @param admin  service-role client
 * @param p      payments-rij met minstens { amount_cents, kind, description, created_at, stripe_id, order_id }
 * @param kort   (iso) => korte datum, zoals de factuurpagina die al gebruikt
 */
export async function factuurLijnen(admin, p, kort) {
  const standaard = [{ desc: p.description || KIND[p.kind] || "Dienst", sub: kort(p.created_at), qty: 1, gross: p.amount_cents || 0 }];
  if (!p.order_id || !p.stripe_id || (p.amount_cents || 0) < 0) return standaard;

  const { data: lijnen } = await admin
    .from("booking_order_lines")
    .select("charge_cents, booking:bookings(starts_at, services(name))")
    .eq("session_id", p.stripe_id);
  if (!lijnen?.length) return standaard;

  const regels = lijnen
    .filter((l) => l.booking)
    .sort((a, b) => new Date(a.booking.starts_at) - new Date(b.booking.starts_at))
    .map((l) => ({ desc: l.booking.services?.name || "Sessie", sub: momentLabel(l.booking.starts_at), qty: 1, gross: l.charge_cents || 0 }));
  // De som van de regels moet het betaalde bedrag zijn. Klopt dat niet (een oudere of handmatig aangepaste rij), dan
  // liever één eerlijke regel dan een factuur waarvan de regels en het totaal elkaar tegenspreken.
  const som = regels.reduce((a, r) => a + r.gross, 0);
  return som === p.amount_cents ? regels : standaard;
}

/** Een negatieve betaalrij is een creditnota, geen factuur. */
export const factuurTitel = (p) => ((p?.amount_cents || 0) < 0 ? "Creditnota" : "Factuur");
