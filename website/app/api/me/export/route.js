import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Recht op inzage en overdraagbaarheid (art. 15 en 20 AVG): het lid downloadt hier alles wat we
// over hem bijhouden, in een leesbaar en machineleesbaar formaat (JSON).
//
// Bewust NIET via de service-role waar het niet moet: we lezen met de sessie van het lid zelf, zodat
// de bestaande RLS de grens bewaakt en dit endpoint nooit per ongeluk andermans gegevens kan
// teruggeven. Enkel voor tabellen zonder leespolicy voor het lid (zijn eigen toestemmingsbewijzen
// en foutmeldingen) gebruiken we de admin-client, strikt gefilterd op zijn eigen user-id.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const admin = createAdminClient();
  const mine = (t, cols) => supabase.from(t).select(cols).eq("user_id", user.id);

  const [
    { data: profile },
    { data: bookings },
    { data: credits },
    { data: payments },
    { data: memberships },
    { data: metrics },
    { data: consents },
    { data: notifications },
  ] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    mine("bookings", "id, starts_at, ends_at, persons, status, price_cents, paid, payment_source, created_at"),
    mine("credits_ledger", "delta, reason, expires_at, created_at"),
    mine("payments", "amount_cents, kind, description, status, invoice_no, created_at"),
    mine("memberships", "status, started_at, current_period_end, cancel_at_period_end"),
    mine("body_metrics", "weight_kg, logged_on"),
    admin.from("legal_consents").select("kind, doc_version, context, accepted_at, withdrawn_at").eq("user_id", user.id),
    mine("notifications", "type, title, body, created_at, read"),
  ]);

  // Het profiel bevat interne velden die niets over de persoon zeggen maar wel verwarren.
  const { pending_referral, ...profielSchoon } = profile || {};

  const dump = {
    _uitleg:
      "Dit is een volledige kopie van de gegevens die Fittin' over jou bijhoudt, op het moment van downloaden. " +
      "Vragen erover? Mail info@fittin.be. Je rechten staan beschreven op fittin.be/privacy.",
    _gegenereerd_op: new Date().toISOString(),
    account: { id: user.id, email: user.email, aangemaakt_op: user.created_at, ...profielSchoon },
    boekingen: bookings || [],
    sessietegoed: credits || [],
    betalingen: payments || [],
    abonnementen: memberships || [],
    lichaamsmetingen: metrics || [],
    toestemmingen: consents || [],
    meldingen: notifications || [],
  };

  const naam = `fittin-mijn-gegevens-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(dump, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${naam}"`,
      "Cache-Control": "no-store",
    },
  });
}
