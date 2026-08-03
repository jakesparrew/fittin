// Read-only inspectie van het Nuki-slot. Schrijft niets.
//   node --env-file=.env.local scripts/nuki-inspect.mjs        → samenvatting
//   node --env-file=.env.local scripts/nuki-inspect.mjs --raw   → volledige JSON van slot + 1 auth
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: cfg } = await db.from("gym_integrations")
  .select("nuki_api_token, nuki_smartlock_id").not("nuki_api_token", "is", null).limit(1).maybeSingle();
if (!cfg?.nuki_api_token) { console.error("Geen Nuki-token in gym_integrations."); process.exit(1); }

const H = { Authorization: `Bearer ${cfg.nuki_api_token}`, "Content-Type": "application/json" };
const id = cfg.nuki_smartlock_id;
const raw = process.argv.includes("--raw");

const lr = await fetch(`https://api.nuki.io/smartlock/${id}`, { headers: H });
const lock = lr.ok ? await lr.json() : null;
if (lock) {
  const lastSeen = lock?.state?.timestamp || lock?.updateDate || null;
  const ageMin = lastSeen ? Math.round((Date.now() - new Date(lastSeen).getTime()) / 60000) : null;
  console.log(`slot: ${lock.name} · serverState ${lock.serverState} · batterij ${lock?.state?.batteryCharge}%`);
  console.log(`laatst gezien: ${lastSeen} (${ageMin} min geleden)`);
  if (raw) console.log("\n--- volledig slot-object ---\n" + JSON.stringify(lock, null, 2));
}

const ar = await fetch(`https://api.nuki.io/smartlock/${id}/auth`, { headers: H });
const auths = ar.ok ? await ar.json() : [];
const keypad = auths.filter((a) => a.type === 13);
console.log(`\n${auths.length} autorisaties · ${keypad.length} keypad · app-gemaakt ("Fittin …"): ${keypad.filter((a) => String(a.name || "").startsWith("Fittin ")).length}`);
if (raw && keypad[0]) console.log("\n--- voorbeeld keypad-auth (velden) ---\n" + JSON.stringify(keypad[0], null, 2));
