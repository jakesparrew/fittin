import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Format an ISO timestamp as an iCalendar UTC stamp: YYYYMMDDTHHMMSSZ.
function ics(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
// Escape text per RFC 5545 (commas, semicolons, backslashes, newlines).
const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Downloadable calendar invite for a single booking. Auth via cookies (browser navigation): the
// member must be the booker or an accepted participant of the session.
export async function GET(_req, { params }) {
  const { bookingId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Niet ingelogd", { status: 401 });

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, user_id, starts_at, ends_at, status, services(name), gym:gyms(name, address)")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return new Response("Niet gevonden", { status: 404 });

  // Ownership check: booker, or an accepted participant.
  let allowed = b.user_id === user.id;
  if (!allowed) {
    const { data: part } = await admin.from("booking_participants").select("user_id").eq("booking_id", bookingId).eq("user_id", user.id).maybeSingle();
    allowed = !!part;
  }
  if (!allowed) return new Response("Geen toegang", { status: 403 });

  const name = b.services?.name || "Fittin' sessie";
  const address = b.gym?.address || "Aannemersstraat 186, 9040 Gent";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fittin//Reservering//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:booking-${b.id}@fittin.be`,
    `DTSTAMP:${ics(b.starts_at)}`,
    `DTSTART:${ics(b.starts_at)}`,
    `DTEND:${ics(b.ends_at)}`,
    `SUMMARY:${esc(name + " · Fittin'")}`,
    `DESCRIPTION:${esc("Jouw gereserveerde sessie bij Fittin'. Je toegangscode komt ± 5 minuten voor je sessie per e-mail. Verplaatsen kan tot 6 uur vooraf in je account.")}`,
    `LOCATION:${esc(address)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Je Fittin'-sessie start binnen 30 minuten")}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const body = lines.join("\r\n");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="fittin-sessie.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
