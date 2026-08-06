// Read-only: welke beurten zijn ECHT verloren gegaan (vervallen zonder gebruikt te zijn)?
//
// Mijn vorige script telde elke bijschrijving met een verstreken vervaldatum als "verloren". Dat is
// fout: een beurt die je in week 1 gebruikt hebt, heeft in week 5 óók een verstreken vervaldatum.
// Hier wordt de FIFO-boekhouding van credits_balance (migratie 0095) exact nagebootst: het totale
// verbruik eet de oudste bijschrijvingen eerst op, en pas wat daarna nog openstond én ondertussen
// vervallen is, is echt verloren.
//   node --env-file=.env.local scripts/diag-verloren-beurten.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: led } = await db.from("credits_ledger")
  .select("id, user_id, delta, reason, expires_at, created_at, member:profiles!credits_ledger_user_id_fkey(full_name)")
  .order("created_at");

const perUser = new Map();
for (const r of led || []) {
  if (!perUser.has(r.user_id)) perUser.set(r.user_id, { naam: r.member?.full_name || r.user_id.slice(0, 8), rows: [] });
  perUser.get(r.user_id).rows.push(r);
}

const now = new Date();
let totaalVerloren = 0;
const gedupeerd = [];

for (const [, u] of perUser) {
  let verbruikt = u.rows.filter((r) => Number(r.delta) < 0).reduce((a, r) => a + -Number(r.delta), 0);
  const grants = u.rows.filter((r) => Number(r.delta) > 0); // al op created_at gesorteerd
  const verloren = [];
  for (const g of grants) {
    const d = Number(g.delta);
    if (verbruikt >= d) { verbruikt -= d; continue; }        // volledig opgebruikt
    const rest = d - verbruikt;                               // dit deel overleefde het verbruik
    verbruikt = 0;
    const isVervallen = g.expires_at && new Date(g.expires_at) < now;
    if (isVervallen) verloren.push({ rest, reason: g.reason, created: g.created_at, expires: g.expires_at });
  }
  if (verloren.length) {
    const som = verloren.reduce((a, v) => a + v.rest, 0);
    totaalVerloren += som;
    gedupeerd.push({ naam: u.naam, som, verloren });
  }
}

if (!gedupeerd.length) {
  console.log("✓ NIEMAND is beurten verloren. Elke vervallen bijschrijving was op dat moment al opgebruikt.");
} else {
  console.log("Leden die effectief beurten verloren:\n");
  for (const g of gedupeerd) {
    console.log(`  ${g.naam}: ${g.som} beurt(en) verloren`);
    for (const v of g.verloren) {
      const dagen = Math.round((new Date(v.expires) - new Date(v.created)) / 86400000);
      console.log(`     ${v.rest}× reden=${v.reason} · toegekend ${v.created.slice(0, 10)} · vervallen ${v.expires.slice(0, 10)} (${dagen} dagen geldig)`);
    }
  }
  console.log(`\nTOTAAL ECHT VERLOREN: ${totaalVerloren} beurt(en)`);
}

// Controle: klopt mijn simulatie met wat de app zelf als saldo toont?
console.log("\n--- controle: eigen berekening vs. credits_balance() van de app ---");
for (const [uid, u] of perUser) {
  const { data: bal } = await db.rpc("credits_balance", { p_user: uid });
  let verbruikt = u.rows.filter((r) => Number(r.delta) < 0).reduce((a, r) => a + -Number(r.delta), 0);
  let beschikbaar = 0;
  for (const g of u.rows.filter((r) => Number(r.delta) > 0)) {
    const d = Number(g.delta);
    if (verbruikt >= d) { verbruikt -= d; continue; }
    if (!g.expires_at || new Date(g.expires_at) > now) beschikbaar += d - verbruikt;
    verbruikt = 0;
  }
  const eigen = Math.max(0, Math.floor(beschikbaar));
  const app = Number(bal || 0);
  console.log(`  ${u.naam.padEnd(24)} eigen=${eigen}  app=${app}  ${eigen === app ? "✓" : "⚠ VERSCHIL"}`);
}
