// Read-only: wat draait de zaal vandaag, en wat is de fysieke bovengrens?
// De ruimte is exclusief per tijdslot, dus capaciteit = openingsuren × prijs per uur.
//   node --env-file=.env.local scripts/diag-omzetpotentieel.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: gym } = await db.from("gyms").select("id, name, open_hour, close_hour").limit(1).single();
const uurPerDag = gym.close_hour - gym.open_hour;
console.log(`${gym.name}: open ${gym.open_hour}–${gym.close_hour} = ${uurPerDag} boekbare uren/dag · ${uurPerDag * 7} uren/week\n`);

// ---- Omzet per maand (enkel echt betaald) ----
const { data: pays } = await db.from("payments").select("amount_cents, status, kind, created_at").eq("gym_id", gym.id);
const perMaand = {};
for (const p of pays || []) {
  const betaald = (p.status || "betaald") === "betaald" || p.status === "paid";
  if (!betaald) continue;
  const m = p.created_at.slice(0, 7);
  (perMaand[m] ||= { totaal: 0, n: 0, soort: {} });
  perMaand[m].totaal += p.amount_cents || 0;
  perMaand[m].n++;
  perMaand[m].soort[p.kind || "?"] = (perMaand[m].soort[p.kind || "?"] || 0) + (p.amount_cents || 0);
}
console.log("=== BETAALDE OMZET PER MAAND ===");
for (const [m, v] of Object.entries(perMaand).sort()) {
  const soorten = Object.entries(v.soort).map(([k, c]) => `${k} € ${(c / 100).toFixed(0)}`).join(" · ");
  console.log(`  ${m}: € ${(v.totaal / 100).toFixed(2).padStart(9)}  (${v.n} betalingen)   ${soorten}`);
}

// ---- Bezetting per maand ----
const { data: bks } = await db.from("bookings")
  .select("starts_at, ends_at, status, persons, payment_source, user_id, coach_billing")
  .eq("gym_id", gym.id).eq("status", "bevestigd");
const bez = {};
for (const b of bks || []) {
  const m = b.starts_at.slice(0, 7);
  const uren = (new Date(b.ends_at) - new Date(b.starts_at)) / 3600000;
  (bez[m] ||= { uren: 0, sessies: 0, leden: new Set(), personen: 0, bron: {} });
  bez[m].uren += uren;
  bez[m].sessies++;
  bez[m].leden.add(b.user_id);
  bez[m].personen += b.persons || 1;
  const bron = b.coach_billing ? `coach(${b.coach_billing})` : b.payment_source;
  bez[m].bron[bron] = (bez[m].bron[bron] || 0) + 1;
}
console.log("\n=== BEZETTING PER MAAND ===");
for (const [m, v] of Object.entries(bez).sort()) {
  const dagen = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate();
  const beschikbaar = dagen * uurPerDag;
  const pct = (v.uren / beschikbaar) * 100;
  const omzet = perMaand[m]?.totaal || 0;
  console.log(`  ${m}: ${String(v.sessies).padStart(3)} sessies · ${v.uren.toFixed(1).padStart(5)} u van ${beschikbaar} (${pct.toFixed(1)}%) · ${v.leden.size} unieke leden · gem. ${(v.personen / v.sessies).toFixed(1)} pers/sessie · € ${(omzet / 100 / (v.uren || 1)).toFixed(2)}/geboekt uur`);
  console.log(`        bron: ${Object.entries(v.bron).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ")}`);
}

// ---- Wat brengt een geboekt uur gemiddeld op? ----
const laatste3 = Object.keys(bez).sort().slice(-3);
let u3 = 0, o3 = 0;
for (const m of laatste3) { u3 += bez[m].uren; o3 += perMaand[m]?.totaal || 0; }
console.log(`\n=== KENGETAL (laatste 3 maanden: ${laatste3.join(", ")}) ===`);
console.log(`  ${u3.toFixed(1)} geboekte uren · € ${(o3 / 100).toFixed(2)} omzet → € ${(o3 / 100 / (u3 || 1)).toFixed(2)} per geboekt uur`);

// ---- Abonnementen ----
const { data: mems } = await db.from("memberships").select("status").eq("gym_id", gym.id);
const actief = (mems || []).filter((m) => m.status === "actief").length;
console.log(`  ${actief} actieve abonnementen = € ${actief * 12}/maand vast`);

// ---- Drukte per uur van de dag (waar zit nog ruimte?) ----
const perUur = {};
for (const b of bks || []) {
  const h = parseInt(new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", hour12: false }).format(new Date(b.starts_at)), 10);
  perUur[h] = (perUur[h] || 0) + 1;
}
console.log("\n=== SESSIES PER UUR VAN DE DAG (alle tijd) ===");
for (let h = gym.open_hour; h < gym.close_hour; h++) {
  const n = perUur[h] || 0;
  console.log(`  ${String(h).padStart(2, "0")}:00 ${"█".repeat(Math.min(40, n))} ${n}`);
}
