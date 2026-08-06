// Eenmalig: markeer alle BESTAANDE client-fouten als al-gemeld, zodat het nieuwe fout-alarm
// (0127) bij zijn eerste run niet begint te mailen over fouten die allang bekend en behandeld
// zijn — dat zou het alarm meteen als ruis introduceren, en ruis wordt genegeerd.
const r = await fetch(`https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_REF}/database/query`, {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify({ query: "update client_errors set alerted_at = now() where alerted_at is null returning id" }),
});
const rows = await r.json();
console.log(`gebackfilled: ${Array.isArray(rows) ? rows.length : JSON.stringify(rows)} bestaande foutrijen gemarkeerd als al-gemeld`);
