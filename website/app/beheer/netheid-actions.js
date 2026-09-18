"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { nagekeken } from "@/lib/uitkomst";
import { sendNetheidHerinnering } from "@/lib/email";
import { TAGS } from "@/lib/netheid";

// De uitbater beoordeelt een zaalcheck en stuurt — met de hand, nooit automatisch — een vriendelijke herinnering
// naar wie er vóór zat. Zie lib/netheid.js voor waarom dat een vermoeden blijft.

export async function oordeelZaalcheck(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const bookingId = String(formData.get("bookingId") || "");
  const v = String(formData.get("verdict") || "");
  const verdict = v === "terecht" || v === "onterecht" ? v : null;
  const admin = createAdminClient();
  const res = await admin.from("zaal_checks").update({ owner_verdict: verdict, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("booking_id", bookingId).eq("gym_id", profile.gym_id);
  const fout = nagekeken(res, "Oordeel bewaren");
  if (fout) return fout;
  revalidatePath("/beheer/netheid");
  return {
    ok: true,
    message: verdict === "terecht" ? "Genoteerd: terecht — telt zwaarder mee ✓" : verdict === "onterecht" ? "Genoteerd: onterecht — telt niet mee ✓" : "Oordeel gewist ✓",
  };
}

export async function stuurNetheidHerinnering(formData) {
  const { profile, error } = await requireStaff(true);
  if (error) return { error };
  const bookingId = String(formData.get("bookingId") || "");
  const admin = createAdminClient();
  const { data: c } = await admin.from("zaal_checks")
    .select("booking_id, state, tags, herinnerd_at, previous_kind, previous_booking, prev:profiles!zaal_checks_previous_user_fkey(email, full_name), vorige:bookings!zaal_checks_previous_booking_fkey(starts_at, ends_at)")
    .eq("booking_id", bookingId).eq("gym_id", profile.gym_id).maybeSingle();
  if (!c) return { error: "Zaalcheck niet gevonden." };
  if (c.herinnerd_at) return { error: "Voor deze melding ging er al een herinnering weg." };
  if (!c.prev?.email || !c.vorige) return { error: "Er is geen vorige boeker om te herinneren." };
  if (c.state !== "rommel") return { error: "Een herinnering hoort enkel bij 'niet netjes'." };

  // Eerst claimen, dan mailen: twee snelle klikken sturen zo nooit twee mails.
  const claim = await admin.from("zaal_checks").update({ herinnerd_at: new Date().toISOString() }, { count: "exact" })
    .eq("booking_id", bookingId).is("herinnerd_at", null);
  const fout = nagekeken(claim, "Herinnering vastleggen");
  if (fout) return fout;

  const label = new Map(TAGS.map((t) => [t.v, t.l.toLowerCase()]));
  const r = await sendNetheidHerinnering({
    to: c.prev.email, name: c.prev.full_name?.split(" ")[0], startsAt: c.vorige.starts_at, endsAt: c.vorige.ends_at,
    tags: (c.tags || []).map((t) => label.get(t) || t),
  });
  if (!r?.ok) {
    const terug = await admin.from("zaal_checks").update({ herinnerd_at: null }, { count: "exact" }).eq("booking_id", bookingId);
    if (terug.error) console.error("herinnering terugzetten:", terug.error.message);
    return { error: "De mail vertrok niet (e-mailfout). Probeer later opnieuw." };
  }
  revalidatePath("/beheer/netheid");
  return { ok: true, message: `Vriendelijke herinnering verstuurd naar ${c.prev.full_name || c.prev.email} ✓` };
}
