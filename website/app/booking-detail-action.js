"use server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Full details for one booking, for the side panel. Access: beheerder (own gym), the coach of the
// session, or the member of the session. Read-only.
export async function getBookingDetail(bookingId) {
  if (!bookingId) return { error: "Geen boeking." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Niet ingelogd." };
  const { data: me } = await supabase.from("profiles").select("role, gym_id").eq("id", user.id).single();
  if (!me) return { error: "Geen profiel." };

  const admin = createAdminClient();
  const { data: b } = await admin
    .from("bookings")
    .select("id, gym_id, user_id, coach_id, starts_at, ends_at, persons, status, payment_source, paid, price_cents, coach_billing, coach_charge_cents, created_at, member:profiles!bookings_user_id_fkey(full_name, email), coach:profiles!bookings_coach_id_fkey(full_name), services(name)")
    .eq("id", bookingId)
    .single();
  if (!b) return { error: "Boeking niet gevonden." };

  const allowed =
    (me.role === "beheerder" && b.gym_id === me.gym_id) ||
    b.coach_id === user.id ||
    b.user_id === user.id;
  if (!allowed) return { error: "Geen toegang tot deze boeking." };

  const reserved = !!b.coach_id && b.user_id === b.coach_id; // coach-reserved slot (no client yet)
  return {
    ok: true,
    booking: {
      id: b.id,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      persons: b.persons,
      status: b.status,
      reserved,
      memberName: reserved ? null : (b.member?.full_name || b.member?.email || "Lid"),
      memberEmail: reserved ? null : (b.member?.email || null),
      coachName: b.coach?.full_name || null,
      serviceName: b.services?.name || "Sessie",
      paymentSource: b.payment_source,
      paid: b.paid,
      priceCents: b.price_cents,
      coachBilling: b.coach_billing,
      coachChargeCents: b.coach_charge_cents,
      createdAt: b.created_at,
    },
  };
}
