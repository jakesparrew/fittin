// Read-only: waar komt het sessietegoed van elke coach vandaan, en staat er een BETAALDE post
// tegenover? Dit legt bloot of tegoed gratis kan ontstaan.
//   node --env-file=.env.local scripts/diag-coach-ledger.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: coaches } = await db.from("profiles").select("id, full_name, coach_billing_mode").in("role", ["coach", "beheerder"]);
const nameOf = new Map((coaches || []).map((c) => [c.id, c.full_name]));

const { data: led } = await db.from("coach_ledger").select("coach_id, delta, reason, created_at, ref_id").order("created_at");
const { data: pays } = await db.from("payments").select("id, user_id, amount_cents, kind, status, description, created_at").order("created_at");

const byCoach = new Map();
for (const r of led || []) {
  if (!byCoach.has(r.coach_id)) byCoach.set(r.coach_id, []);
  byCoach.get(r.coach_id).push(r);
}

for (const [cid, rows] of byCoach) {
  const bal = rows.reduce((a, r) => a + Number(r.delta || 0), 0);
  const bijgeschreven = rows.filter((r) => Number(r.delta) > 0);
  const gebruikt = rows.filter((r) => Number(r.delta) < 0);
  console.log(`\n=== ${nameOf.get(cid) || cid} · saldo ${bal} ===`);
  console.log(`  ${bijgeschreven.length} bijschrijving(en), ${gebruikt.length} sessie(s) gebruikt`);
  for (const r of bijgeschreven) {
    console.log(`    + ${r.delta}  ${r.reason}  ${r.created_at.slice(0, 10)}`);
  }
  // Betalingen van deze coach: is het tegoed betaald of op rekening gezet?
  const mine = (pays || []).filter((p) => p.user_id === cid);
  console.log(`  betalingen van deze coach: ${mine.length}`);
  for (const p of mine) {
    console.log(`    ${p.created_at.slice(0, 10)} · € ${(p.amount_cents / 100).toFixed(2)} · ${p.kind} · STATUS: ${p.status} · ${p.description}`);
  }
  if (!mine.length && bijgeschreven.length) console.log("    ⚠ tegoed bijgeschreven zonder ENIGE betaalpost");
}
