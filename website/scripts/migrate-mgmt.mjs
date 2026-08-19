// Draait de SQL-migraties via de Supabase Management API — en houdt sinds 0141 in
// public.schema_migrations bij welk bestand gedraaid is.
//
// WAAROM die ledger: zonder bijhouden is "is deze al gedraaid?" een geheugenkwestie, en dat is niet
// onschuldig. 0138 en 0143 bevatten een datamigratie (`update ... set updated_at = created_at where
// updated_at > created_at`). Wie zo'n bestand een tweede keer draait nadat er echt iets bewerkt is,
// gooit die wijzigingsdatums weg. Dit script weigert daarom wat al in de ledger staat.
//
// Gebruik:
//   node scripts/migrate-mgmt.mjs                         → status: wat staat er nog open?
//   node scripts/migrate-mgmt.mjs 0141_db_ledger.sql ...   → die bestanden draaien, op volgorde
//   node scripts/migrate-mgmt.mjs --force 0143_x.sql       → bewust opnieuw draaien
//
// Zonder argumenten draait er BEWUST niets meer. Vroeger viel het script dan terug op
// ["0001_init.sql", "0002_seed.sql"] — één argumentloze aanroep tegen de productiedatabank zou het
// schema en de seed opnieuw uitvoeren.
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const MIGRATIES = new URL("../supabase/migrations/", import.meta.url);
const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = process.env.SUPABASE_PROJECT_REF;
if (!token || !ref) {
  console.error("Missing SUPABASE_ACCESS_TOKEN or SUPABASE_PROJECT_REF");
  process.exit(1);
}

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 1000)}`);
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

// Handmatig quoten omdat de Management API alleen kale SQL slikt, geen parameters. Enkel
// bestandsnamen en hex-checksums gaan hier doorheen, maar één ontsnapt aanhalingsteken is genoeg.
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

const bestandenOpSchijf = async () => (await readdir(MIGRATIES)).filter((f) => f.endsWith(".sql")).sort();

async function ledgerBestaat() {
  const rows = await query("select to_regclass('public.schema_migrations') as t");
  return Boolean(rows[0]?.t);
}

// Map van bestandsnaam → checksum zoals hij bij het draaien was. Leeg zolang 0141 niet gedraaid is.
async function geboekt() {
  if (!(await ledgerBestaat())) return null;
  const rows = await query("select version, checksum from public.schema_migrations");
  return new Map(rows.map((r) => [r.version, r.checksum]));
}

const som = (sql) => createHash("sha256").update(sql).digest("hex");

async function status() {
  const files = await bestandenOpSchijf();
  const ledger = await geboekt();
  if (!ledger) {
    console.log("⚠ Geen ledger in de databank. Draai eerst: node scripts/migrate-mgmt.mjs 0141_db_ledger.sql");
    console.log(`  ${files.length} bestanden op schijf, status onbekend.`);
    return;
  }
  const open = [];
  for (const f of files) {
    if (!ledger.has(f)) open.push(f);
    else {
      const huidig = som(await readFile(new URL(f, MIGRATIES), "utf8"));
      const vorig = ledger.get(f);
      // Een gewijzigd bestand dat al gedraaid is, is een waarschuwing waard: wat in de databank zit
      // is niet meer wat er in het bestand staat. Alleen melden, nooit stilzwijgend opnieuw draaien.
      if (vorig && vorig !== huidig) console.log(`~ ${f} — gedraaid, maar het bestand is sindsdien gewijzigd`);
    }
  }
  console.log(`${files.length - open.length}/${files.length} gedraaid.`);
  if (open.length) console.log(`Open:\n  ${open.join("\n  ")}`);
  else console.log("Niets open.");
}

async function draai(files, force) {
  let ledger = await geboekt();
  if (!ledger) console.log("⚠ Nog geen ledger — draai 0141_db_ledger.sql eerst of mee.");
  // Wat er draait vóór de ledger bestaat (bv. een andere migratie die alfabetisch vóór
  // 0141_db_ledger.sql staat) wordt hier onthouden en alsnog geboekt zodra de tabel er is.
  const wacht = [];

  const boek = async (naam, checksum) => {
    await query(
      `insert into public.schema_migrations (version, checksum, applied_at) values (${lit(naam)}, ${lit(checksum)}, now())
       on conflict (version) do update set checksum = excluded.checksum, applied_at = excluded.applied_at`,
    );
    ledger.set(naam, checksum);
  };

  for (const f of files) {
    let sql;
    try {
      sql = await readFile(new URL(f, MIGRATIES), "utf8");
    } catch {
      console.error(`✗ ${f} — bestaat niet in supabase/migrations/`);
      process.exit(1);
    }
    if (ledger?.has(f) && !force) {
      console.log(`· ${f} — staat al in de ledger, overgeslagen (--force om toch te draaien)`);
      continue;
    }
    process.stdout.write(`→ ${f} ... `);
    try {
      await query(sql);
    } catch (e) {
      console.log("FAILED");
      console.error(e.message);
      process.exit(1);
    }
    // Pas hier boeken: een mislukte migratie mag nooit als gedraaid genoteerd staan. De ledger
    // opnieuw opvragen, want 0141 legt hem net zelf aan.
    if (!ledger) ledger = await geboekt();
    if (ledger) {
      for (const w of wacht.splice(0)) await boek(w.naam, w.checksum);
      await boek(f, som(sql));
      console.log("ok (geboekt)");
    } else {
      wacht.push({ naam: f, checksum: som(sql) });
      console.log("ok (nog niet geboekt — ledger ontbreekt)");
    }
  }
  if (wacht.length) console.log(`⚠ Niet geboekt (geen ledger): ${wacht.map((w) => w.naam).join(", ")}`);
  console.log("✓ klaar");
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const files = args.filter((a) => !a.startsWith("--"));
if (files.length) await draai(files, force);
else await status();
