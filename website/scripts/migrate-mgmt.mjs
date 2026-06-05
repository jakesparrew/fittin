// Runs the SQL migrations via the Supabase Management API.
// Usage: SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... node scripts/migrate-mgmt.mjs
import { readFile } from "node:fs/promises";

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF");
  process.exit(1);
}

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["0001_init.sql", "0002_seed.sql"];
for (const f of files) {
  const sql = await readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8");
  process.stdout.write(`→ ${f} ... `);
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) {
    console.log("FAILED", res.status);
    console.error(text.slice(0, 1000));
    process.exit(1);
  }
  console.log("ok");
}
console.log("✓ migration complete");
