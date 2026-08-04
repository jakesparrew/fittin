// Draait de batterijcontrole één keer, precies zoals de dagelijkse cron dat doet.
// Handig om de meting nu al in het dashboard te krijgen zonder tot 09:00 te wachten.
//   node --env-file=.env.local scripts/check-lock-battery.mjs
//
// LET OP: dit kan een échte waarschuwingsmail versturen als de batterij onder een drempel zit.
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: before } = await db.from("gym_integrations")
  .select("gym_id, battery_pct, battery_alert_tier, battery_checked_at").eq("nuki_enabled", true);
console.log("vóór:", JSON.stringify(before));

// De lib gebruikt de "@/"-alias van Next, die node niet kent → hier de logica rechtstreeks
// aanroepen zou duplicatie zijn. Daarom via de cron-route in de dev-server? Nee: te omslachtig.
// We doen de meting hier read-only en tonen wat de cron zou beslissen; het wegschrijven van de
// meting doen we wél, want dat is precies wat het dashboard nodig heeft.
const TIERS = [30, 20, 10];
for (const row of before || []) {
  const { data: cfg } = await db.from("gym_integrations")
    .select("nuki_api_token, nuki_smartlock_id").eq("gym_id", row.gym_id).maybeSingle();
  if (!cfg?.nuki_api_token || !cfg?.nuki_smartlock_id) { console.log("geen Nuki-config"); continue; }
  const r = await fetch(`https://api.nuki.io/smartlock/${cfg.nuki_smartlock_id}`, {
    headers: { Authorization: `Bearer ${cfg.nuki_api_token}` },
  });
  if (!r.ok) { console.log(`slot onbereikbaar (${r.status}) → geen meting`); continue; }
  const l = await r.json();
  const pct = l?.state?.batteryCharge ?? null;
  const critical = !!l?.state?.batteryCritical;
  const keypadCritical = !!l?.state?.keypadBatteryCritical;

  await db.from("gym_integrations").update({
    battery_pct: pct,
    battery_keypad_critical: keypadCritical,
    battery_checked_at: new Date().toISOString(),
  }).eq("gym_id", row.gym_id);

  const tier = critical ? 0 : TIERS.find((t) => pct != null && pct <= t) ?? null;
  console.log(`slot: ${pct}% · kritiek=${critical} · keypad kritiek=${keypadCritical}`);
  console.log(`  drempel die zou vuren: ${tier === null ? "geen (alles in orde)" : tier === 0 ? "KRITIEK" : tier + "%"}`);
  console.log(`  al gemeld tot: ${row.battery_alert_tier ?? "niets"} → ${tier === null || (row.battery_alert_tier != null && tier >= row.battery_alert_tier) ? "geen mail" : "MAIL"}`);
}

const { data: after } = await db.from("gym_integrations")
  .select("battery_pct, battery_keypad_critical, battery_checked_at").eq("nuki_enabled", true);
console.log("na:", JSON.stringify(after));
