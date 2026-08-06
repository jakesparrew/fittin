// Read-only: levert Resend bijlagen aan bij binnenkomende mail, en in welke vorm?
// Bepaalt of doorsturen mét bijlage überhaupt kan.
//   node --env-file=.env.local scripts/diag-inbound-bijlagen.mjs
const KEY = process.env.RESEND_API_KEY;
if (!KEY) { console.error("Geen RESEND_API_KEY."); process.exit(1); }

const rfetch = async (path) => {
  const r = await fetch("https://api.resend.com" + path, { headers: { Authorization: `Bearer ${KEY}` } });
  if (!r.ok) throw new Error(`${path} → ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const list = await rfetch("/emails/receiving");
const items = list.data || list || [];
console.log(`${items.length} binnengekomen mails in Resend\n`);

let metBijlage = 0;
for (const it of items.slice(0, 12)) {
  const full = await rfetch("/emails/receiving/" + it.id);
  const velden = Object.keys(full);
  const att = full.attachments || full.attachment || null;
  const n = Array.isArray(att) ? att.length : 0;
  if (n) metBijlage++;
  console.log(`${(full.created_at || "").slice(0, 16)}  van ${String(full.from).slice(0, 40).padEnd(42)} bijlagen: ${n}`);
  if (n) {
    for (const a of att) {
      console.log(`     → ${a.filename || a.name || "(naamloos)"} · ${a.content_type || a.type || "?"} · velden: ${Object.keys(a).join(", ")}`);
    }
  }
  if (items.indexOf(it) === 0) console.log(`   (velden die Resend teruggeeft: ${velden.join(", ")})`);
}
console.log(`\n${metBijlage} van de bekeken mails had bijlagen.`);
