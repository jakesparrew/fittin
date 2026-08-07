// Read-only: welke weg naar de database werkt nog? De management-API geeft 401 (token vervallen),
// dus we hebben een alternatief nodig om migraties te kunnen draaien. Print nooit het wachtwoord.
import net from "node:net";

const url = process.env.SUPABASE_DB_URL || "";
if (!url) { console.error("SUPABASE_DB_URL ontbreekt."); process.exit(1); }
let host = "?", port = "?", user = "?";
try {
  const u = new URL(url);
  host = u.hostname; port = u.port || "5432"; user = u.username;
} catch { console.error("SUPABASE_DB_URL is geen geldige URL."); process.exit(1); }
console.log(`host: ${host}\npoort in URL: ${port}\ngebruiker: ${user}\n`);

const probeer = (p) => new Promise((res) => {
  const s = net.createConnection({ host, port: p, timeout: 6000 });
  s.on("connect", () => { s.destroy(); res(`poort ${p}: OPEN`); });
  s.on("timeout", () => { s.destroy(); res(`poort ${p}: time-out (geblokkeerd)`); });
  s.on("error", (e) => res(`poort ${p}: ${e.code}`));
});
for (const p of [5432, 6543]) console.log(await probeer(p));

// Pooler-host van Supabase, voor het geval de directe host geblokkeerd is.
const ref = process.env.SUPABASE_PROJECT_REF;
if (ref) {
  for (const h of [`aws-0-eu-central-1.pooler.supabase.com`]) {
    const s = await new Promise((res) => {
      const c = net.createConnection({ host: h, port: 6543, timeout: 6000 });
      c.on("connect", () => { c.destroy(); res("OPEN"); });
      c.on("timeout", () => { c.destroy(); res("time-out"); });
      c.on("error", (e) => res(e.code));
    });
    console.log(`pooler ${h}:6543 → ${s}`);
  }
}
