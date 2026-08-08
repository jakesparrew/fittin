// De aanvallerstest: wat geeft PostgREST prijs aan iemand met ENKEL de anon key en géén sessie?
// Dat is exact de positie van elke bezoeker van de site — de anon key staat per definitie in de
// browserbundel. RLS is hier de enige verdediging; deze test leest elke tabel zoals een aanvaller
// dat zou doen en meldt wat er terugkomt.
//
// Read-only: er wordt nergens geschreven.
//   node --env-file=.env.local scripts/audit-rls-anon.mjs
import { createClient } from "@supabase/supabase-js";

const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Alle tabellen die in de code voorkomen. Liever te veel proberen dan één vergeten:
// een tabel die niet bestaat, geeft gewoon een nette fout.
const TABELLEN = [
  "profiles", "gyms", "gym_integrations", "services", "bookings", "booking_participants",
  "payments", "memberships", "credits_ledger", "coach_ledger", "coach_credit_ledger",
  "coach_clients", "coach_availability", "coach_activity", "coach_commissions",
  "coach_payment_requests", "coach_session_requests", "subscribers", "campaigns",
  "campaign_sends", "inbound_emails", "email_log", "client_errors", "door_log",
  "slot_blocks", "discount_codes", "events", "event_signups", "problem_reports",
  "referrals", "buddies", "feed_posts", "feed_comments", "feed_kudos",
  "body_metrics", "workout_logs", "programs", "program_days", "program_exercises",
  "exercises", "workouts", "legal_consents", "notifications", "push_subscriptions",
  "newsletter_drips", "login_tokens",
];

// Kolommen die nooit anoniem leesbaar mogen zijn, waar ze ook staan. Bewust ZONDER address/vat/
// invoice_email: dat zijn wettelijk publieke bedrijfsgegevens van een vzw (staan al op de site en
// in het KBO-register), geen geheim. Wél geheim: persoonsdata (e-mail/telefoon/gewicht) en
// betaal-/toegangssleutels (iban, deurcode, tokens, Stripe-refs).
const GEVOELIG = /(^|_)email|phone|iban|token|secret|nuki|access_code|stripe|weight/i;

let open = 0, dicht = 0, onbekend = 0;
const problemen = [];

for (const t of TABELLEN) {
  const { data, error } = await anon.from(t).select("*").limit(3);
  if (error) {
    if (/does not exist|Could not find/i.test(error.message)) { onbekend++; continue; }
    // permission denied / RLS: precies wat we willen
    dicht++;
    continue;
  }
  if (!data || data.length === 0) {
    // Leeg resultaat: RLS kan stil filteren (goed) óf de tabel is echt leeg (dan zegt dit niets).
    // We melden het als "leeg" zodat een lege maar OPEN tabel niet als veilig geboekt wordt.
    console.log(`▫ ${t}: leesbaar maar 0 rijen (RLS-filter of lege tabel)`);
    dicht++;
    continue;
  }
  open++;
  const kolommen = Object.keys(data[0]);
  // invoice_email is het publieke facturatieadres van de vzw (info@fittin.be, staat op de
  // contactpagina) — geen persoonsgegeven, dus uitgezonderd.
  const lek = kolommen.filter((k) => k !== "invoice_email" && GEVOELIG.test(k) && data.some((r) => r[k] != null && r[k] !== ""));
  const tag = lek.length ? "🔴 LEKT GEVOELIGE DATA" : "🟡 leesbaar";
  console.log(`${tag} ${t}: ${data.length}+ rijen anoniem leesbaar — kolommen: ${kolommen.join(", ")}`);
  if (lek.length) problemen.push(`${t} → ${lek.join(", ")}`);
}

console.log(`\n${open} tabellen anoniem leesbaar · ${dicht} dicht/leeg · ${onbekend} bestaan niet`);
if (problemen.length) {
  console.log("\n🔴 GEVOELIGE KOLOMMEN ANONIEM LEESBAAR:");
  for (const p of problemen) console.log("  " + p);
  process.exit(1);
}
console.log("✓ geen gevoelige kolommen anoniem leesbaar");
