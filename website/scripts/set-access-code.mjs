// Zet de statische reserve-deurcode in gym_integrations (service-role-only tabel; de
// wereld-leesbare gyms-rij bevat hem NIET). Owner-beslissing, dus expliciet als argument
// meegeven — nooit hardcoded.
//   node --env-file=.env.local scripts/set-access-code.mjs 676767
//
// LET OP: dit zet de code enkel in de app. De code moet OOK lokaal op het Nuki-keypad staan,
// anders mailen we een code die de deur niet opent — erger dan niets sturen. Die reservecode
// is juist bedoeld om te werken wanneer de Nuki-cloud/Bridge onbereikbaar is.
import { createClient } from "@supabase/supabase-js";

const code = (process.argv[2] || "").trim();
if (!/^\d{4,8}$/.test(code)) {
  console.error("Geef een code van 4-8 cijfers mee, bv: node --env-file=.env.local scripts/set-access-code.mjs 676767");
  process.exit(1);
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: gyms } = await db.from("gyms").select("id, name");
for (const g of gyms || []) {
  const { data: before } = await db.from("gym_integrations").select("access_code").eq("gym_id", g.id).maybeSingle();
  const { error } = await db.from("gym_integrations").upsert({ gym_id: g.id, access_code: code }, { onConflict: "gym_id" });
  if (error) { console.error(`${g.name}: MISLUKT — ${error.message}`); continue; }
  const { data: after } = await db.from("gym_integrations").select("access_code").eq("gym_id", g.id).maybeSingle();
  console.log(`${g.name}: was ${before?.access_code ? "ingevuld" : "leeg"} → nu ${after?.access_code === code ? "correct opgeslagen" : "NIET opgeslagen (!)"}`);
}

// Controle: de code mag nergens in de wereld-leesbare gyms-tabel staan.
const { data: leak } = await db.from("gyms").select("id, access_code").limit(5);
const leaking = (leak || []).filter((r) => r.access_code);
console.log(leaking.length ? `⚠ LEK: gyms.access_code is ingevuld op ${leaking.length} rij(en)` : "✓ gyms-tabel bevat geen deurcode (goed)");
