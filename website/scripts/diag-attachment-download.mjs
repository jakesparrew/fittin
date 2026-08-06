// Read-only: hoe haal je de INHOUD van een inbound-bijlage op bij Resend? De lijst geeft enkel
// metadata (id, filename, size), dus we moeten het juiste endpoint vinden vóór we kunnen doorsturen.
//   node --env-file=.env.local scripts/diag-attachment-download.mjs
const KEY = process.env.RESEND_API_KEY;
const H = { Authorization: `Bearer ${KEY}` };

const list = await (await fetch("https://api.resend.com/emails/receiving", { headers: H })).json();
const items = list.data || list || [];

// Zoek de eerste mail mét bijlage.
let mail = null, att = null;
for (const it of items) {
  const full = await (await fetch("https://api.resend.com/emails/receiving/" + it.id, { headers: H })).json();
  if (Array.isArray(full.attachments) && full.attachments.length) { mail = full; att = full.attachments[0]; break; }
}
if (!att) { console.log("Geen mail met bijlage gevonden."); process.exit(0); }

console.log(`Testmail: ${mail.subject} · bijlage ${att.filename} (${att.size} bytes)`);
console.log("attachment-object:", JSON.stringify(att, null, 2));

const kandidaten = [
  `/emails/receiving/${mail.id}/attachments/${att.id}`,
  `/emails/receiving/${mail.id}/attachments/${att.id}/download`,
  `/emails/receiving/${mail.id}/attachment/${att.id}`,
  `/attachments/${att.id}`,
];
for (const p of kandidaten) {
  try {
    const r = await fetch("https://api.resend.com" + p, { headers: H });
    const ct = r.headers.get("content-type") || "";
    const body = ct.includes("json") ? JSON.stringify(await r.json()).slice(0, 200) : `${(await r.arrayBuffer()).byteLength} bytes binair`;
    console.log(`\n${p}\n   → ${r.status} · ${ct}\n   ${body}`);
  } catch (e) {
    console.log(`\n${p}\n   → fout: ${e.message}`);
  }
}

// Valt terug op de rauwe MIME als er geen apart endpoint is: die bevat alles.
console.log(`\nraw-veld aanwezig: ${mail.raw ? "ja (" + String(mail.raw).length + " tekens)" : "nee"}`);
