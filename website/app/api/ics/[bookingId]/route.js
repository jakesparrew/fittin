import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { bookingIcs, ICS_BESTANDSNAAM } from "@/lib/ics";

export const dynamic = "force-dynamic";

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

  const body = bookingIcs({
    id: b.id,
    startsAt: b.starts_at,
    endsAt: b.ends_at,
    serviceName: b.services?.name,
    address: b.gym?.address,
  });
  if (!body) return new Response("Niet gevonden", { status: 404 });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ICS_BESTANDSNAAM}"`,
      "Cache-Control": "no-store",
    },
  });
}
