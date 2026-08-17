// Verstuurt de workouts-nieuwsbrief (concept 601a1531…) naar alle actieve inschrijvingen.
//
// Volgorde is bewust:
//   1. kopie naar de beheerder (zelfde HTML als de echte mail);
//   2. wachtrij vullen — zelfde stappen als queueNewsletter() in lib/newsletter.js, hier herhaald
//      omdat die module via het "@/"-alias van Next importeert en buiten Next niet laadt;
//   3. de bestaande verzendketen op productie aantikken (/api/queue/process). Het échte versturen
//      gebeurt dus door de geteste productiecode: unsubscribe-headers, bounce-guard, logging.
//
// Herstartbaar: campaign_sends dedupet per inschrijving, dus dit script twee keer draaien stuurt
// niemand twee keer iets.
//
//   node --env-file=.env.local scripts/nieuwsbrief-verstuur.mjs
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

const CAMPAGNE = "601a1531-06e7-4e1e-b693-ffe2e4990fb9";
const KOPIE_NAAR = "gaetanjansseune@gmail.com";
const SITE = "https://fittin.be";

const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const eis = (n, r) => { if (r.error) throw new Error(n + ": " + r.error.message); return r.data; };
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const [c] = eis("campagne", await s.from("campaigns").select("*").eq("id", CAMPAGNE));
if (!c) throw new Error("campagne niet gevonden");
if (c.status === "sent") { console.log("Al verstuurd op", c.sent_at, "— niets te doen."); process.exit(0); }

// Vooraf: staan de beelden echt live? Eén dode afbeelding in 716 mailboxen is niet te herstellen.
for (const f of ["bibliotheek.png", "acties.png", "loggen.gif", "schema.png", "voortgang.png", "delen.png"]) {
  const r = await fetch(`${SITE}/nieuwsbrief/${f}`, { method: "HEAD" });
  if (!r.ok) throw new Error(`beeld niet live: ${f} → ${r.status}`);
}
console.log("alle 6 beelden live ✓");

// Zelfde schil als newsletterHtml() in lib/newsletter.js.
const schil = (unsubUrl) => `<!doctype html><html><body style="margin:0;background:#f5f6fa">
  ${c.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${c.preheader}</div>` : ""}
  <div style="background:#f5f6fa;padding:28px 0">
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #ece9f5">
      <div style="background:#22194F;padding:22px 32px">
        <span style="color:#fff;font-size:24px;font-weight:800;letter-spacing:-0.02em">Fittin<span style="color:#C6F24E">'</span></span>
      </div>
      <div style="padding:30px 32px;color:#22194F">
        <h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;color:#22194F">${c.subject}</h1>
        ${c.body_html}
      </div>
      <div style="padding:18px 32px;border-top:1px solid #ece9f5;color:#9b97ab;font-size:12px;line-height:1.6">
        Fittin' · Aannemersstraat 186, 9040 Gent · <a href="${SITE}" style="color:#9b97ab">fittin.be</a><br>
        Geen nieuwsbrieven meer? <a href="${unsubUrl}" style="color:#6b6685;text-decoration:underline">Uitschrijven</a>
      </div>
    </div>
  </div></body></html>`;

// ---- 1. Kopie naar de beheerder ----
const resend = new Resend(process.env.RESEND_API_KEY);
const kopie = await resend.emails.send({
  from: process.env.EMAIL_FROM_NEWS || "Fittin' <nieuwsbrief@news.fittin.be>",
  to: KOPIE_NAAR,
  replyTo: process.env.EMAIL_REPLY_TO || "info@fittin.be",
  subject: `[kopie] ${c.subject}`,
  html: schil(`${SITE}/uitschrijven`),
});
if (kopie?.error) throw new Error("kopie versturen faalde: " + (kopie.error.message || JSON.stringify(kopie.error)));
console.log("kopie naar", KOPIE_NAAR, "✓", kopie.data?.id);

// ---- 2. Wachtrij vullen (zelfde logica als queueNewsletter) ----
const [subs, existing] = await Promise.all([
  s.from("subscribers").select("id, email").eq("gym_id", c.gym_id).eq("status", "active"),
  s.from("campaign_sends").select("subscriber_id").eq("campaign_id", CAMPAGNE),
]);
eis("subs", subs); eis("existing", existing);
const done = new Set(existing.data.map((e) => e.subscriber_id));
const targets = subs.data.filter((x) => !done.has(x.id));
for (const part of chunk(targets, 500)) {
  eis("queue", await s.from("campaign_sends").insert(
    part.map((x) => ({ gym_id: c.gym_id, campaign_id: CAMPAGNE, subscriber_id: x.id, email: x.email, status: "queued" }))
  ));
}
eis("status", await s.from("campaigns").update({ status: "sending", total: subs.data.length }).eq("id", CAMPAGNE));
console.log(`wachtrij: ${targets.length} nieuw in de rij (${subs.data.length} actieve inschrijvingen totaal)`);

// ---- 3. De productieketen aantikken ----
const secret = process.env.CRON_SECRET;
if (!secret) throw new Error("CRON_SECRET ontbreekt in .env.local");
const tik = await fetch(`${SITE}/api/queue/process`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store" });
console.log("keten gestart:", tik.status, await tik.text());
if (!tik.ok) throw new Error("keten starten faalde — wachtrij staat klaar, maar er wordt nog niets verstuurd");
