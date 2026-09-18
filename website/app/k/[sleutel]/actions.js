"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { leesSleutel } from "@/lib/sleutel";
import { geefNu } from "@/lib/punten-db";
import { notify } from "@/lib/notify";

// "Ik kom" — een gast bevestigt zelf dat hij meekomt. Twee soorten gasten, twee sleutels:
//   kom-p · een lid dat als deelnemer aan de boeking hangt (booking_participants.id)
//   kom-i · iemand zonder account, uitgenodigd per e-mail (email_invites.id)
// De sleutel is ondertekend voor precies die rij (lib/sleutel.js); raden kan niet.

export async function uitnodigingVan(sleutel) {
  const admin = createAdminClient();
  const p = leesSleutel("kom-p", sleutel);
  const i = p ? null : leesSleutel("kom-i", sleutel);
  if (!p && !i) return null;
  const tabel = p ? "booking_participants" : "email_invites";
  const { data: rij } = await admin.from(tabel).select("id, booking_id, confirmed_at").eq("id", p || i).maybeSingle();
  if (!rij) return null;
  const { data: b } = await admin.from("bookings")
    .select("id, gym_id, user_id, starts_at, ends_at, status, services(name), host:profiles!bookings_user_id_fkey(full_name, referral_code)")
    .eq("id", rij.booking_id).maybeSingle();
  if (!b || b.status !== "bevestigd") return null;
  return { soort: p ? "lid" : "gast", rij, boeking: b };
}

export async function bevestigKomst(sleutel) {
  const u = await uitnodigingVan(sleutel);
  if (!u) return { error: "Deze uitnodiging bestaat niet meer (misschien werd de sessie verplaatst of geannuleerd)." };
  if (new Date(u.boeking.ends_at).getTime() < Date.now()) return { error: "Deze sessie is al voorbij." };
  if (u.rij.confirmed_at) return { ok: true, al: true };
  const admin = createAdminClient();
  const tabel = u.soort === "lid" ? "booking_participants" : "email_invites";
  const { data: gezet, error } = await admin.from(tabel).update({ confirmed_at: new Date().toISOString() })
    .eq("id", u.rij.id).is("confirmed_at", null).select("id");
  if (error) return { error: "Bevestigen lukte niet. Probeer het opnieuw." };
  if (gezet?.length) {
    const b = u.boeking;
    await geefNu(admin, { gymId: b.gym_id, userId: b.user_id, kind: "gast_bevestigd", sourceKey: `gastbev:${u.soort === "lid" ? "p" : "i"}:${u.rij.id}`, meta: { booking: b.id } }).catch(() => 0);
    await notify({ gymId: b.gym_id, userId: b.user_id, type: "system", title: "Je gast komt mee ✅", body: "Iemand die je uitnodigde, bevestigde net. +5 punten voor jou.", link: "/account" });
  }
  return { ok: true };
}
