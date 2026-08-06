// Read-only: welke binnengekomen mails hebben bijlagen? Doorzoekt de volledige lijst, niet enkel
// de eerste pagina, zodat oudere facturen niet buiten beeld blijven.
//   node --env-file=.env.local scripts/zoek-bijlagen.mjs
const KEY = process.env.RESEND_API_KEY;
const H = { Authorization: `Bearer ${KEY}` };
const rf = async (p) => {
  const r = await fetch("https://api.resend.com" + p, { headers: H });
  if (!r.ok) throw new Error(`${p} → ${r.status}`);
  return r.json();
};

const list = await rf("/emails/receiving");
const items = list.data || list || [];
console.log(`${items.length} mails in de inbound-lijst\n`);

const metBijlage = [];
for (const it of items) {
  const full = await rf("/emails/receiving/" + it.id);
  const att = Array.isArray(full.attachments) ? full.attachments : [];
  if (!att.length) continue;
  metBijlage.push({ id: it.id, from: full.from, to: full.to, subject: full.subject, date: full.created_at, att });
}

for (const m of metBijlage) {
  console.log(`${(m.date || "").slice(0, 16)}  ${m.subject}`);
  console.log(`   van ${m.from}  →  ${Array.isArray(m.to) ? m.to.join(", ") : m.to}`);
  for (const a of m.att) console.log(`   📎 ${a.filename} · ${a.content_type} · ${Math.round(a.size / 1024)} kB`);
  console.log(`   id ${m.id}\n`);
}
console.log(`TOTAAL: ${metBijlage.length} mail(s) met bijlagen, ${metBijlage.reduce((a, m) => a + m.att.length, 0)} bestand(en).`);
