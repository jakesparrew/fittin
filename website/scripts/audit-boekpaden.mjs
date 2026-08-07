// Read-only audit: welke paden kunnen een boeking aanmaken, en hoe wordt coach_billing daar gezet?
// Doel: bewijzen dat er GEEN manier is om op factuur te boeken zonder te betalen.
//   node --env-file=.env.local scripts/audit-boekpaden.mjs
const t = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) { console.error(r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  return r.json();
};

const fns = await q(`
  select p.proname as naam,
         pg_get_function_identity_arguments(p.oid) as args,
         (pg_get_functiondef(p.oid) ilike '%coach_billing%') as zet_billing,
         (pg_get_functiondef(p.oid) ilike '%insert into bookings%') as maakt_boeking,
         (pg_get_functiondef(p.oid) ilike '%invoice%') as noemt_invoice
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (pg_get_functiondef(p.oid) ilike '%insert into bookings%'
          or pg_get_functiondef(p.oid) ilike '%coach_billing%')
   order by p.proname`);

console.log("FUNCTIES die boekingen maken of coach_billing raken:\n");
for (const f of fns) {
  console.log(`  ${f.naam}(${f.args})`);
  console.log(`     maakt boeking: ${f.maakt_boeking} · zet coach_billing: ${f.zet_billing} · noemt 'invoice': ${f.noemt_invoice}`);
}

// Wie kan er rechtstreeks in de bookings-tabel schrijven? RLS-policies tonen dat.
const pol = await q(`
  select polname, cmd, pg_get_expr(polqual, polrelid) as using_expr, pg_get_expr(polwithcheck, polrelid) as check_expr
    from (select pol.polname, case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' else 'ALL' end as cmd,
                 pol.polqual, pol.polwithcheck, pol.polrelid
            from pg_policy pol join pg_class c on c.oid = pol.polrelid where c.relname = 'bookings') s`);
console.log("\nRLS-POLICIES op bookings (kan een coach zelf een rij invoegen?):");
for (const p of pol) console.log(`  ${p.cmd.padEnd(7)} ${p.polname}\n      using: ${p.using_expr || "—"}\n      check: ${p.check_expr || "—"}`);

const rls = await q(`select relrowsecurity as aan from pg_class where relname = 'bookings'`);
console.log(`\nRLS staat aan op bookings: ${rls[0]?.aan}`);
