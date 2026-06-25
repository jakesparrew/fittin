// READ-ONLY diagnosis: find coach/beheerder profiles that have confirmed upcoming bookings where
// they are the member (user_id) but no coach is attached (coach_id=null) — i.e. sessions that will
// NOT show in their coach agenda (which filters coach_id). No writes. No --apply. Pure report.
// Usage: node --env-file=.env.local scripts/diag-coach-bookings.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Missing env"); process.exit(1); }
const sb = createClient(url, key, { auth: { persistSession: false } });

// All staff (coach or beheerder).
const { data: staff, error: se } = await sb
  .from("profiles")
  .select("id, full_name, email, role")
  .in("role", ["coach", "beheerder"]);
if (se) { console.error("profiles query failed:", se.message); process.exit(1); }

console.log(`Staff (coach/beheerder): ${staff.length}`);
const nowIso = new Date().toISOString();

for (const s of staff) {
  // Sessions where this staffer is the MEMBER but no coach attached (invisible in coach agenda).
  const { data: orphan } = await sb
    .from("bookings")
    .select("id, starts_at, status, coach_id, user_id, payment_source, services(name)")
    .eq("user_id", s.id)
    .is("coach_id", null)
    .eq("status", "bevestigd")
    .gte("starts_at", nowIso)
    .order("starts_at");
  // Sessions correctly attached as coach (visible).
  const { count: asCoach } = await sb
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("coach_id", s.id)
    .eq("status", "bevestigd")
    .gte("starts_at", nowIso);
  if ((orphan && orphan.length) || asCoach) {
    console.log(`\n=== ${s.full_name || "(naamloos)"} <${s.email}> role=${s.role} id=${s.id}`);
    console.log(`   visible-as-coach (coach_id=me, upcoming bevestigd): ${asCoach || 0}`);
    if (orphan && orphan.length) {
      console.log(`   ORPHAN member-bookings (user_id=me, coach_id=null) → NOT in coach agenda: ${orphan.length}`);
      for (const r of orphan) console.log(`     ${r.starts_at}  ${r.services?.name || "Sessie"}  src=${r.payment_source}  id=${r.id}`);
    }
  }
}
console.log("\n(Read-only. No changes made.)");
