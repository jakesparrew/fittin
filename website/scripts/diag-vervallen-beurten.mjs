// Read-only: kost de 6 maanden-vervaldatum je leden vandaag effectief beurten?
//   node --env-file=.env.local scripts/diag-vervallen-beurten.mjs
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: led } = await db.from("credits_ledger")
  .select("user_id, delta, reason, expires_at, created_at, member:profiles!credits_ledger_user_id_fkey(full_name)")
  .order("created_at");

const per = new Map();
for (const r of led || []) {
  const k = r.user_id;
  if (!per.has(k)) per.set(k, { naam: r.member?.full_name || k.slice(0, 8), bij: 0, af: 0, verlopen: 0, rijen: [] });
  const p = per.get(k);
  const d = Number(r.delta);
  if (d > 0) {
    p.bij += d;
    if (r.expires_at && new Date(r.expires_at) < new Date()) p.verlopen += d;
  } else p.af += -d;
  p.rijen.push(r);
}

console.log("lid".padEnd(26), "bijgeschreven".padEnd(14), "gebruikt".padEnd(10), "verlopen", " met vervaldatum?");
let totVerlopen = 0, totZonder = 0, totMet = 0;
for (const [, p] of per) {
  const metDatum = p.rijen.filter((r) => Number(r.delta) > 0 && r.expires_at).length;
  const zonder = p.rijen.filter((r) => Number(r.delta) > 0 && !r.expires_at).length;
  totMet += metDatum; totZonder += zonder; totVerlopen += p.verlopen;
  console.log(
    p.naam.slice(0, 25).padEnd(26),
    String(p.bij).padEnd(14),
    String(p.af).padEnd(10),
    String(p.verlopen).padEnd(9),
    `${metDatum} met · ${zonder} zonder`
  );
}
console.log(`\nTOTAAL: ${totVerlopen} beurten verlopen · ${totMet} bijschrijvingen mét vervaldatum · ${totZonder} zonder`);
console.log(`Verlopen beurten vertegenwoordigen ± € ${(totVerlopen * 13.64).toFixed(2)} aan vooruitbetaalde waarde.`);
