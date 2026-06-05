// Runs the SQL migrations against the Supabase Postgres.
// Usage: node --env-file=.env.local scripts/migrate.mjs
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set in .env.local");
  process.exit(1);
}

const files = ["0001_init.sql", "0002_seed.sql"];
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

await client.connect();
try {
  for (const f of files) {
    const sql = await readFile(new URL(`../supabase/migrations/${f}`, import.meta.url), "utf8");
    process.stdout.write(`→ running ${f} ... `);
    await client.query(sql);
    console.log("ok");
  }
  const { rows } = await client.query(
    "select (select count(*) from gyms) as gyms, (select count(*) from services) as services"
  );
  console.log("seed:", rows[0]);
  console.log("✓ migration complete");
} catch (e) {
  console.error("\n✗ migration failed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
