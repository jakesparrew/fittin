// Read-only: wat ziet de nieuwe rem per coach? Rekent exact dezelfde som als de guard in
// coach_book_session, zodat we weten wie er vanaf nu geblokkeerd is en waarom.
//   node --env-file=.env.local scripts/verify-0124.mjs
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) { console.error(r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  return r.json();
};

const overloads = await q(`select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                            where n.nspname='public' and p.proname='coach_book_session'`);
console.log("overloads van coach_book_session:", overloads[0].n, overloads[0].n === 1 ? "✓" : "⚠ MEERDERE → PostgREST-ambiguïteit!");

const rows = await q(`
  select pr.full_name,
         pr.coach_billing_mode as modus,
         coalesce((select sum(b.coach_charge_cents) from bookings b
                    where b.coach_id = pr.id and b.coach_billing='invoice'
                      and b.status='bevestigd' and b.coach_invoiced_at is null), 0) as nog_te_factureren,
         coalesce((select sum(p.amount_cents) from payments p
                    where p.user_id = pr.id and p.status='onbetaald' and p.kind='coach_credits'), 0) as onbetaalde_facturen,
         coalesce((select sum(l.delta) from coach_ledger l where l.coach_id = pr.id), 0) as tegoed
    from profiles pr
   where pr.role in ('coach','beheerder')
   order by pr.full_name`);

console.log("\ncoach".padEnd(26), "modus".padEnd(9), "tegoed".padEnd(7), "te fact.".padEnd(9), "onbet.fact".padEnd(11), "→ mag boeken?");
for (const r of rows) {
  const owed = Number(r.nog_te_factureren) + Number(r.onbetaalde_facturen);
  let verdict;
  if (r.modus === "free") verdict = "ja (gratis-afspraak)";
  else if (r.modus === "invoice") verdict = owed > 0 ? `NEE — € ${(owed / 100).toFixed(2)} openstaand` : "ja";
  else verdict = Number(r.tegoed) >= 1 ? "ja" : `NEE — tegoed ${r.tegoed}`;
  console.log(
    (r.full_name || "?").slice(0, 25).padEnd(26),
    String(r.modus || "-").padEnd(9),
    String(r.tegoed).padEnd(7),
    `€ ${(r.nog_te_factureren / 100).toFixed(2)}`.padEnd(9),
    `€ ${(r.onbetaalde_facturen / 100).toFixed(2)}`.padEnd(11),
    verdict
  );
}
