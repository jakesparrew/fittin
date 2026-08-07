// Read-only: bootst exact na wat /beheer/abonnementen zal tonen, zodat we de cijfers kunnen
// controleren vóór de owner erop vertrouwt.
//   node --env-file=.env.local scripts/diag-abonnees.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const eur = (c) => "€ " + (c / 100).toFixed(2);

const { data: mems } = await db.from("memberships")
  .select("user_id, status, started_at, current_period_end, cancel_at_period_end, member:profiles!memberships_user_id_fkey(full_name)");
const { data: bks } = await db.from("bookings").select("user_id, starts_at").eq("status", "bevestigd");
const { data: pays } = await db.from("payments").select("user_id, amount_cents, status").eq("kind", "abonnement");

const nu = Date.now();
const betaaldPer = {};
for (const p of pays || []) {
  if (((p.status || "betaald") !== "betaald") && p.status !== "paid") continue;
  betaaldPer[p.user_id] = (betaaldPer[p.user_id] || 0) + (p.amount_cents || 0);
}

console.log("lid".padEnd(22), "mnd".padEnd(6), "sess".padEnd(6), "ritme".padEnd(8), "stil".padEnd(10), "voordeel".padEnd(11), "betaald");
for (const m of mems || []) {
  const maanden = Math.max(0, (nu - new Date(m.started_at).getTime()) / (30.44 * 86400000));
  const eigen = (bks || []).filter((b) => b.user_id === m.user_id && new Date(b.starts_at) >= new Date(m.started_at) && new Date(b.starts_at) <= nu);
  const sessies = eigen.length;
  const perMaand = maanden > 0.5 ? sessies / maanden : sessies;
  const laatste = eigen.length ? Math.max(...eigen.map((b) => new Date(b.starts_at).getTime())) : null;
  const stil = laatste ? Math.floor((nu - laatste) / 86400000) + "d" : "NOOIT";
  const voordeel = sessies * 1500 - (sessies * 1200 + Math.max(0, Math.round(maanden) - sessies) * 1200);
  console.log(
    (m.member?.full_name || "?").slice(0, 21).padEnd(22),
    maanden.toFixed(1).padEnd(6),
    String(sessies).padEnd(6),
    (perMaand.toFixed(1) + "x").padEnd(8),
    stil.padEnd(10),
    (voordeel >= 0 ? "+" : "") + eur(voordeel).padEnd(10),
    eur(betaaldPer[m.user_id] || 0),
    m.status !== "actief" ? " [" + m.status + "]" : (m.cancel_at_period_end ? " [opgezegd]" : "")
  );
}
