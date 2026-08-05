// Read-only: wat staat er per coach nog open op factuur (coach_billing = 'invoice' en nog niet
// gefactureerd)?  node --env-file=.env.local scripts/diag-coach-invoice-open.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: rows } = await db.from("bookings")
  .select("id, starts_at, status, coach_charge_cents, coach_invoiced_at, coach:profiles!bookings_coach_id_fkey(id, full_name, coach_billing_mode), member:profiles!bookings_user_id_fkey(full_name)")
  .eq("coach_billing", "invoice")
  .order("starts_at");

const byCoach = new Map();
for (const b of rows || []) {
  const k = b.coach?.full_name || "(geen coach)";
  if (!byCoach.has(k)) byCoach.set(k, { open: [], done: [], mode: b.coach?.coach_billing_mode });
  (b.coach_invoiced_at ? byCoach.get(k).done : byCoach.get(k).open).push(b);
}

for (const [naam, g] of byCoach) {
  const openTotal = g.open.filter((b) => b.status === "bevestigd").reduce((a, b) => a + (b.coach_charge_cents || 0), 0);
  console.log(`\n=== ${naam} (modus: ${g.mode}) ===`);
  console.log(`  nog te factureren: ${g.open.filter((b) => b.status === "bevestigd").length} sessies · € ${(openTotal / 100).toFixed(2)}`);
  console.log(`  al gefactureerd  : ${g.done.length} sessies`);
  for (const b of g.open) {
    console.log(`    ${b.starts_at.slice(0, 16).replace("T", " ")} · ${b.member?.full_name} · € ${((b.coach_charge_cents || 0) / 100).toFixed(2)} · ${b.status}`);
  }
}
