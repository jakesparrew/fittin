// One-off: Jelle planned sessions via superadmin as a *member* (user_id=Jelle, coach_id=null),
// so they never showed up in his coach agenda (which filters coach_id). This re-attributes those
// rows to coach-reserved slots (set coach_id = Jelle) so he sees them and can assign a client later.
// Scoped to Jelle's own future, confirmed bookings only. Dry-run by default; pass --apply to write.
// Usage: node --env-file=.env.local scripts/fix-jelle-coach-bookings.mjs [--apply]
import { createClient } from "@supabase/supabase-js";

const JELLE = "649c969a-4569-47a1-a83e-fc0a07f3cd4e";
const apply = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// Candidates: his own member-bookings with no coach attached, still upcoming + confirmed.
const { data: rows, error } = await sb
  .from("bookings")
  .select("id, starts_at, status, coach_id, user_id, payment_source, services(name)")
  .eq("user_id", JELLE)
  .is("coach_id", null)
  .eq("status", "bevestigd")
  .gte("starts_at", new Date().toISOString())
  .order("starts_at");

if (error) { console.error("Query failed:", error.message); process.exit(1); }

console.log(`Found ${rows.length} candidate booking(s) for Jelle (user_id=Jelle, coach_id=null, bevestigd, upcoming):`);
for (const r of rows) console.log(`  ${r.starts_at}  ${r.services?.name || "Sessie"}  src=${r.payment_source}  id=${r.id}`);

if (!rows.length) { console.log("Nothing to do."); process.exit(0); }
if (!apply) { console.log("\nDRY RUN — re-run with --apply to set coach_id=Jelle on these rows."); process.exit(0); }

const ids = rows.map((r) => r.id);
const { data: updated, error: e2 } = await sb
  .from("bookings")
  .update({ coach_id: JELLE })
  .in("id", ids)
  .select("id");
if (e2) { console.error("Update failed:", e2.message); process.exit(1); }
console.log(`\n✓ Updated ${updated.length} booking(s) — now visible in Jelle's coach agenda as reserved slots.`);
