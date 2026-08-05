// Read-only: controleer dat de bedrag-formattering in de blokkademelding klopt voor de bedragen
// die vandaag echt voorkomen.  node --env-file=.env.local scripts/test-guard-message.mjs
const token = process.env.SUPABASE_ACCESS_TOKEN, ref = process.env.SUPABASE_PROJECT_REF;
const q = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) { console.error(r.status, (await r.text()).slice(0, 400)); process.exit(1); }
  return r.json();
};

const rows = await q(`
  select c as centen,
         to_char(round(c / 100.0, 2), 'FM999999990.00') as weergave
    from (values (1200), (6000), (9600), (50), (100000), (12345)) as t(c)`);
for (const r of rows) console.log(String(r.centen).padStart(7), "→ € " + r.weergave);
