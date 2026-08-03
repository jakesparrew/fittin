// Read-only: draait de per-boeking Nuki-keypadcode écht? Raakt niets aan — enkel selects.
// Draaien: node --env-file=.env.local scripts/check-nuki-status.mjs
//
// LET OP bij het lezen van de cijfers: revokeExpiredKeypadCodes() zet nuki_code terug op NULL
// zodra een sessie voorbij is (+grace). "0 boekingen met nuki_code" bewijst dus NIETS over of
// het werkt. nuki_auth_name blijft wél staan — dát is het bewijs dat er een code geminteerd is.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: gyms } = await db.from("gyms").select("id, name");
for (const g of gyms || []) {
  const { data: cfg } = await db
    .from("gym_integrations")
    .select("nuki_enabled, nuki_smartlock_id, nuki_api_token, keypad_lead_min, keypad_grace_min, access_code")
    .eq("gym_id", g.id).maybeSingle();

  console.log(`\n=== ${g.name} ===`);
  console.log("  nuki_enabled :", cfg?.nuki_enabled, "· smartlock:", cfg?.nuki_smartlock_id || "(leeg)",
              "· token:", cfg?.nuki_api_token ? "ja" : "NEE");
  console.log("  statische reservecode:", cfg?.access_code ? "ingevuld" : "NIET INGEVULD");

  const since = new Date(Date.now() - 60 * 86400000).toISOString();
  const q = () => db.from("bookings").select("id", { count: "exact", head: true })
    .eq("gym_id", g.id).eq("status", "bevestigd").gte("starts_at", since);
  const { count: total } = await q();
  const { count: mailed } = await q().eq("access_sent", true);
  const { count: minted } = await q().not("nuki_auth_name", "is", null);
  const { count: liveCode } = await q().not("nuki_code", "is", null);
  const { count: cleaned } = await q().eq("nuki_cleaned", true);
  console.log(`  60 dagen: ${total} bevestigd · ${mailed} toegangsmail · ${minted} kreeg een EIGEN Nuki-code (auth_name) · ${liveCode} nu nog actief · ${cleaned} opgeruimd`);

  // Laatste 5 boekingen met een geminteerde code — bewijst dat het recent nog werkte.
  const { data: recent } = await db.from("bookings")
    .select("starts_at, nuki_auth_name, nuki_code, nuki_cleaned, access_sent")
    .eq("gym_id", g.id).not("nuki_auth_name", "is", null)
    .order("starts_at", { ascending: false }).limit(5);
  console.log("  recentste geminteerde codes:");
  for (const b of recent || []) {
    console.log(`    ${b.starts_at}  auth=${b.nuki_auth_name}  code=${b.nuki_code ? "actief" : "gewist"}  cleaned=${b.nuki_cleaned}`);
  }
}

const { data: runs } = await db.from("cron_runs").select("ok, detail, created_at")
  .eq("job", "access_codes").order("created_at", { ascending: false }).limit(200);
const bad = (runs || []).filter((r) => !r.ok);
console.log(`\n=== access_codes-cron: ${runs?.length} recente runs, ${bad.length} met fouten ===`);
for (const r of bad.slice(0, 5)) console.log(" ", r.created_at, JSON.stringify(r.detail));
