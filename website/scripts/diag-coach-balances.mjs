// Read-only: saldo + modus per coach, en of de tegoed-guard een halve beurt kan doorlaten.
//   node --env-file=.env.local scripts/diag-coach-balances.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: coaches } = await db.from("profiles")
  .select("id, full_name, role, coach_billing_mode, coach_session_price_cents")
  .in("role", ["coach", "beheerder"]);

const { data: ledger } = await db.from("coach_ledger").select("coach_id, delta");
const bal = {};
for (const r of ledger || []) bal[r.coach_id] = (bal[r.coach_id] || 0) + Number(r.delta || 0);

const { data: inv } = await db.from("bookings")
  .select("coach_id, coach_charge_cents, status, coach_invoiced_at").eq("coach_billing", "invoice");
const openInv = {};
for (const b of inv || []) {
  if (b.coach_invoiced_at || b.status !== "bevestigd") continue;
  openInv[b.coach_id] = (openInv[b.coach_id] || 0) + (b.coach_charge_cents || 0);
}

console.log("coach".padEnd(26), "modus".padEnd(9), "tegoed".padEnd(8), "open op factuur");
for (const c of coaches || []) {
  const b = bal[c.id];
  const o = openInv[c.id] || 0;
  if (b == null && !o) continue;
  console.log(
    (c.full_name || "?").slice(0, 25).padEnd(26),
    String(c.coach_billing_mode || "-").padEnd(9),
    String(b ?? "-").padEnd(8),
    o ? `€ ${(o / 100).toFixed(2)}` : "-"
  );
}

// Halve beurten bestaan sinds 0117 (90 min = 1,5). De guard leest het saldo in een INT-variabele;
// een halve beurt zou daardoor kunnen worden afgerond en de blokkade omzeilen.
const fractional = Object.entries(bal).filter(([, v]) => v % 1 !== 0);
console.log("\ncoaches met een HALF saldo (bv. 0,5 of 1,5):", fractional.length ? JSON.stringify(fractional) : "geen");

const { data: half } = await db.from("coach_ledger").select("delta").not("delta", "in", "(1,-1,2,-2,3,-3,5,-5,10,-10)").limit(20);
console.log("niet-hele ledger-mutaties (steekproef):", JSON.stringify((half || []).map((r) => r.delta)));
