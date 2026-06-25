// Backfill for the root-cause fix in 0094: existing sessions where a coach/beheerder is the member
// (user_id) but no coach is attached (coach_id=null) never reached their coach agenda. Set
// coach_id = user_id on those rows so they show as reserved slots (same as the trigger now does for
// new bookings). Scoped to staff's own upcoming, confirmed bookings. Dry-run by default; --apply writes.
// Generalises the earlier one-off fix-jelle-coach-bookings.mjs to every coach.
// Usage: node --env-file=.env.local scripts/fix-staff-coach-bookings.mjs [--apply]
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

const { data: staff, error: se } = await sb.from("profiles").select("id, full_name, email").in("role", ["coach", "beheerder"]);
if (se) { console.error("profiles query failed:", se.message); process.exit(1); }
const staffIds = staff.map((s) => s.id);
const nameOf = Object.fromEntries(staff.map((s) => [s.id, s.full_name || s.email]));

// Orphans: staff is the member, no coach attached, still upcoming + confirmed.
const { data: rows, error } = await sb
  .from("bookings")
  .select("id, starts_at, user_id, coach_id, payment_source, services(name)")
  .in("user_id", staffIds)
  .is("coach_id", null)
  .eq("status", "bevestigd")
  .gte("starts_at", new Date().toISOString())
  .order("starts_at");
if (error) { console.error("bookings query failed:", error.message); process.exit(1); }

console.log(`Found ${rows.length} orphan staff booking(s) (user_id=staff, coach_id=null, upcoming, bevestigd):`);
for (const r of rows) console.log(`  ${r.starts_at}  ${nameOf[r.user_id]}  ${r.services?.name || "Sessie"}  src=${r.payment_source}  id=${r.id}`);

if (!rows.length) { console.log("Nothing to do."); process.exit(0); }
if (!apply) { console.log("\nDRY RUN — re-run with --apply to set coach_id = user_id on these rows."); process.exit(0); }

let ok = 0;
for (const r of rows) {
  const { error: e2 } = await sb.from("bookings").update({ coach_id: r.user_id }).eq("id", r.id).is("coach_id", null);
  if (e2) { console.error(`  ✗ ${r.id}: ${e2.message}`); continue; }
  ok++;
}
console.log(`\n✓ Updated ${ok}/${rows.length} booking(s) — now visible in the coach's agenda as reserved slots.`);
