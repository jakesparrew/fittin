// Alles wat een lid over zijn punten ziet — één functie voor de accountkaart en /account/punten.

import { laadInstellingen, puntenVan, huidigeReeks, laadRustigeUren, rustigsteMomenten, beginMaand } from "./punten-db.js";
import { questStatus, isGestart, isoWeek, gymdoel, waarde, WAARDEN } from "./punten.js";
import { BADGES, volgendeBadge, sessieStats } from "./badges.js";
import { isSettled } from "./booking-status.js";

export const DOEL_OPTIES = [
  { v: "sterker", l: "Sterker worden" },
  { v: "conditie", l: "Conditie" },
  { v: "afvallen", l: "Afvallen" },
  { v: "spiermassa", l: "Spiermassa" },
  { v: "bewegen", l: "Gewoon regelmatig bewegen" },
];
export const BRON_OPTIES = ["Instagram", "Facebook / Meta-advertentie", "Google", "Via een vriend", "Via een coach", "Voorbijgewandeld", "Anders"];

export async function puntenOverzicht(admin, userId, gymId) {
  const s = await laadInstellingen(admin, gymId);
  if (!s?.aan) return null;
  const nu = Date.now();
  const [pt, { data: prof }, { data: eigen }, { data: mee }, { data: badges }, rustig, { data: gymSessies }] = await Promise.all([
    puntenVan(admin, userId, { limit: 60 }),
    admin.from("profiles").select("role, streak_target, coaching_doel, hoe_gevonden").eq("id", userId).maybeSingle(),
    admin.from("bookings").select("id, starts_at, ends_at, status, paid, price_cents, payment_source, promo, created_at").eq("user_id", userId).neq("status", "geannuleerd").order("starts_at"),
    admin.from("booking_participants").select("confirmed_at, booking:bookings(starts_at, ends_at, status, paid, price_cents, payment_source, promo)").eq("user_id", userId).not("confirmed_at", "is", null),
    admin.from("member_badges").select("badge, earned_at").eq("user_id", userId),
    laadRustigeUren(admin, gymId),
    admin.from("bookings").select("starts_at, status, paid, price_cents, payment_source").eq("gym_id", gymId).eq("status", "bevestigd")
      .gte("starts_at", beginMaand(new Date(), 1)).lte("starts_at", new Date().toISOString()),
  ]);
  if (prof?.role !== "lid") return null;

  const voltooid = [
    ...(eigen || []).filter((b) => b.status === "bevestigd" && new Date(b.ends_at).getTime() <= nu && isSettled(b)),
    ...(mee || []).map((m) => m.booking).filter((b) => b && b.status === "bevestigd" && new Date(b.ends_at).getTime() <= nu && isSettled(b)),
  ].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const eersteBoeking = (eigen || []).map((b) => b.created_at).sort()[0] || null;
  const questRij = new Map(pt.alle.filter((r) => r.kind === "quest").map((r) => [r.meta?.stap, r.created_at]));
  const quest = questStatus({
    sessies: voltooid, geboektOp: eersteBoeking, gestartOp: s.gestart_op,
    profielOp: questRij.get("profiel") || (prof?.coaching_doel && prof?.streak_target ? s.gestart_op : null),
    bronOp: questRij.get("bron") || (prof?.hoe_gevonden ? s.gestart_op : null),
  }).map((q) => ({ ...q, waarde: waarde(s, q.key), gekregen: questRij.has(q.id) }));

  // Deze week: hoeveel sessies (voltooid of geboekt) tegenover het weekdoel.
  const dezeWeek = isoWeek(new Date().toISOString());
  const doel = Math.min(4, Math.max(1, prof?.streak_target || 1));
  const ditWeek = [...(eigen || []).filter((b) => b.status === "bevestigd"), ...(mee || []).map((m) => m.booking).filter(Boolean)]
    .filter((b) => isoWeek(b.starts_at) === dezeWeek).length;

  const al = new Set((badges || []).map((b) => b.badge));
  const stats = { ...sessieStats(voltooid) };
  const bezet = new Set();
  const maandStart = new Date(beginMaand()).getTime();
  const tel = (van, tot) => (gymSessies || []).filter((b) => isSettled(b) && new Date(b.starts_at).getTime() >= van && new Date(b.starts_at).getTime() < tot).length;
  const vorigeMaand = new Date(beginMaand(new Date(), 1)).getTime();
  // Het gymdoel van deze maand hangt aan vorige maand (die staat volledig in gymSessies).
  const doelMaand = gymdoel(tel(vorigeMaand, maandStart));
  const { count: dezeMaand } = await admin.from("bookings").select("id", { count: "exact", head: true })
    .eq("gym_id", gymId).eq("status", "bevestigd").gte("starts_at", new Date(maandStart).toISOString()).lte("starts_at", new Date().toISOString());

  return {
    instellingen: { prijs: s.prijs_sessie, maxPerLid: s.max_per_lid_maand, rustigAan: s.rustig_aan, waarden: { ...WAARDEN, ...(s.waarden || {}) } },
    lifetime: pt.lifetime, saldo: pt.saldo, klassement: pt.klassement, niveau: pt.niveau, rijen: pt.rijen,
    reeks: huidigeReeks(pt.alle),
    week: { doel, gedaan: ditWeek },
    quest, gestart: isGestart(voltooid.length),
    badges: BADGES.map((b) => ({ ...b, regel: undefined, behaald: al.has(b.id), op: (badges || []).find((x) => x.badge === b.id)?.earned_at || null })),
    volgendeBadge: volgendeBadge(stats, al),
    rustig: rustigsteMomenten(rustig, { bezet }),
    gymdoel: { doel: doelMaand, gedaan: dezeMaand || 0 },
    profiel: { doel: prof?.coaching_doel || "", streak_target: prof?.streak_target || 1, hoe_gevonden: prof?.hoe_gevonden || "" },
    kanInwisselen: pt.saldo >= s.prijs_sessie,
  };
}
