// Read-only: dump de HUIDIGE definitie van een Postgres-functie via de Supabase Management API
// (de directe DB-poort is hier dichtgezet). Belangrijk: een migratiebestand kan door een latere
// migratie achterhaald zijn — dit toont wat er écht draait.
//   node --env-file=.env.local scripts/dump-fn.mjs coach_book_session
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
const name = process.argv[2];
if (!token || !ref || !name) { console.error("Gebruik: node --env-file=.env.local scripts/dump-fn.mjs <functienaam>"); process.exit(1); }

const q = `select p.oid::text as oid, pg_get_function_identity_arguments(p.oid) as args, pg_get_functiondef(p.oid) as def
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = '${name.replace(/'/g, "''")}'`;

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: q }),
});
if (!res.ok) { console.error(res.status, (await res.text()).slice(0, 500)); process.exit(1); }
const rows = await res.json();
console.log(`${rows.length} overload(s) van ${name}\n`);
for (const r of rows) console.log(`--- oid ${r.oid} (${r.args}) ---\n${r.def}\n`);
