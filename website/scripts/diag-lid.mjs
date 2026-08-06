// Read-only: alles over één lid, om een boekingsprobleem te kunnen duiden.
//   node --env-file=.env.local scripts/diag-lid.mjs laura
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const q = (process.argv[2] || "").toLowerCase();

const { data: people } = await db.from("profiles").select("*");
const hits = (people || []).filter((p) =>
  `${p.full_name || ""} ${p.email || ""}`.toLowerCase().includes(q));

for (const p of hits) {
  console.log(`\n=== ${p.full_name} <${p.email}> ===`);
  console.log(`  id ${p.id} · rol ${p.role} · aangemaakt ${p.created_at}`);
  console.log(`  welcome_status: ${p.welcome_status} · gym ${p.gym_id}`);

  const { data: mem } = await db.from("memberships").select("*").eq("user_id", p.id);
  console.log(`  abonnementen: ${JSON.stringify((mem || []).map((m) => ({ status: m.status, start: m.started_at, eind: m.current_period_end, stripe: m.stripe_subscription_id ? "ja" : "nee" })))}`);

  const { data: led } = await db.from("credits_ledger").select("delta, reason, expires_at, created_at").eq("user_id", p.id).order("created_at");
  const saldo = (led || []).reduce((a, r) => a + (new Date(r.expires_at || "2999-01-01") > new Date() ? Number(r.delta) : 0), 0);
  console.log(`  sessietegoed: ${saldo} (${(led || []).length} mutaties)`);
  for (const l of led || []) console.log(`     ${l.delta > 0 ? "+" : ""}${l.delta} ${l.reason} · vervalt ${l.expires_at} · ${l.created_at.slice(0, 16)}`);

  const { data: pays } = await db.from("payments").select("amount_cents, kind, status, description, created_at").eq("user_id", p.id).order("created_at");
  console.log(`  betalingen:`);
  for (const x of pays || []) console.log(`     ${x.created_at.slice(0, 16)} € ${(x.amount_cents / 100).toFixed(2)} ${x.kind} [${x.status}] ${x.description}`);

  const { data: bks } = await db.from("bookings").select("id, starts_at, status, paid, price_cents, payment_source, created_at").eq("user_id", p.id).order("created_at");
  console.log(`  boekingen (${(bks || []).length}):`);
  for (const b of bks || []) {
    const open = b.status === "bevestigd" && !b.paid && (b.price_cents || 0) > 0 && ["los", "abo"].includes(b.payment_source);
    console.log(`     ${b.starts_at.slice(0, 16)} ${b.status} ${b.payment_source} € ${((b.price_cents || 0) / 100).toFixed(2)} betaald=${b.paid} aangemaakt ${b.created_at.slice(0, 16)}${open ? "  ← OPENSTAANDE RESERVERING" : ""}`);
  }

  const { data: errs } = await db.from("client_errors").select("message, path, created_at").eq("user_id", p.id).order("created_at", { ascending: false }).limit(10);
  console.log(`  foutmeldingen uit haar browser: ${(errs || []).length}`);
  for (const e of errs || []) console.log(`     ${e.created_at.slice(0, 16)} ${e.path} — ${e.message.slice(0, 120)}`);
}
if (!hits.length) console.log("geen profiel gevonden voor: " + q);
