// Read-only: wie betaalt wat bij een "Coach-factuur"-boeking? Zoekt de sessie van 5 aug 10:00
// en legt de geldstroom eromheen bloot.  node --env-file=.env.local scripts/diag-booking-pieter.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: bks } = await db.from("bookings")
  .select("*, member:profiles!bookings_user_id_fkey(id, full_name, email, role), coach:profiles!bookings_coach_id_fkey(id, full_name, email, role, coach_billing_mode, coach_session_price_cents)")
  .gte("starts_at", "2026-08-05T00:00:00Z").lt("starts_at", "2026-08-06T00:00:00Z")
  .order("starts_at");

for (const b of bks || []) {
  const isPieter = /pieter/i.test(b.member?.full_name || "");
  if (!isPieter) continue;
  console.log("=== BOEKING ===");
  console.log("  id            :", b.id);
  console.log("  wanneer       :", b.starts_at, "→", b.ends_at);
  console.log("  status        :", b.status, "· persons:", b.persons);
  console.log("\n  --- wie ---");
  console.log("  user_id (lid) :", b.member?.full_name, `(${b.member?.role})`, b.member?.email);
  console.log("  coach_id      :", b.coach?.full_name, `(${b.coach?.role})`, b.coach?.email);
  console.log("  notes         :", b.notes);
  console.log("\n  --- wat het LID betaalt ---");
  console.log("  price_cents   :", b.price_cents, "· paid:", b.paid, "· payment_source:", b.payment_source);
  console.log("  charge_cents  :", b.charge_cents, "· stripe_session:", b.stripe_session_id ? "ja" : "nee");
  console.log("\n  --- wat de COACH aan de gym betaalt ---");
  console.log("  coach_billing      :", b.coach_billing);
  console.log("  coach_charge_cents :", b.coach_charge_cents);
  console.log("  coach_invoiced_at  :", b.coach_invoiced_at ?? "(kolom bestaat niet of leeg)");
  console.log("  coach-modus nu     :", b.coach?.coach_billing_mode, "· tarief:", b.coach?.coach_session_price_cents);
  console.log("\n  --- overige velden ---");
  for (const [k, v] of Object.entries(b)) {
    if (["member", "coach"].includes(k)) continue;
    if (v === null || v === false) continue;
    if (["id", "starts_at", "ends_at", "status", "persons", "price_cents", "paid", "payment_source", "charge_cents", "coach_billing", "coach_charge_cents", "notes", "user_id", "coach_id"].includes(k)) continue;
    console.log(`  ${k}: ${JSON.stringify(v)}`);
  }

  // Staat er een factuurpost tegenover?
  const { data: pays } = await db.from("payments").select("id, amount_cents, kind, description, status, created_at, invoice_no, user_id")
    .eq("gym_id", b.gym_id).order("created_at", { ascending: false }).limit(200);
  const related = (pays || []).filter((p) => (p.description || "").toLowerCase().includes("pieter") || p.user_id === b.coach?.id);
  console.log("\n  --- betalingen gekoppeld aan deze coach ---");
  if (!related.length) console.log("    (geen)");
  for (const p of related.slice(0, 10)) {
    console.log(`    ${p.created_at.slice(0, 10)} · ${(p.amount_cents / 100).toFixed(2)} € · ${p.kind} · ${p.status} · ${p.description} ${p.invoice_no ? "· factuur " + p.invoice_no : ""}`);
  }
}
