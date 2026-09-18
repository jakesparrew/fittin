"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { geefNu } from "@/lib/punten-db";
import { DOEL_OPTIES, BRON_OPTIES } from "@/lib/punten-overzicht";
import { notifyAdmins } from "@/lib/notify";

async function lid() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: p } = await createAdminClient().from("profiles").select("id, gym_id, role, full_name").eq("id", user.id).maybeSingle();
  return p?.role === "lid" ? p : null;
}

// 300 punten → 1 gratis sessie. De databank beslist alles (saldo, maandlimiet, gymplafond) in één transactie
// (0165 wissel_punten_in); hier enkel wie het vraagt.
export async function wisselPuntenIn() {
  const p = await lid();
  if (!p) return { error: "Log in als lid om punten in te wisselen." };
  const { data, error } = await createAdminClient().rpc("wissel_punten_in", { p_user: p.id });
  if (error) return { error: error.message || "Inwisselen lukte niet." };
  await notifyAdmins({ gymId: p.gym_id, type: "system", title: `🎁 ${p.full_name || "Een lid"} wisselde punten in`, body: "1 gratis sessie (3 maanden geldig).", link: "/beheer/punten" });
  revalidatePath("/account");
  revalidatePath("/account/punten");
  return { ok: true, message: `Gelukt! Er staat 1 gratis sessie op je account (nog ${data?.saldo ?? 0} punten over) ✓` };
}

// Starter-quest "vul je profiel aan": doel + weekdoel. Het weekdoel stuurt ook de reeks (weken op rij).
export async function bewaarPuntenProfiel(formData) {
  const p = await lid();
  if (!p) return { error: "Log in om je profiel te bewaren." };
  const doel = String(formData.get("doel") || "");
  const target = Math.round(Number(formData.get("streak_target")));
  if (!DOEL_OPTIES.some((d) => d.v === doel)) return { error: "Kies je doel." };
  if (!(target >= 1 && target <= 4)) return { error: "Kies hoeveel keer per week (1 tot 4)." };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ coaching_doel: doel, streak_target: target }).eq("id", p.id);
  if (error) return { error: "Bewaren lukte niet." };
  const punten = await geefNu(admin, { gymId: p.gym_id, userId: p.id, kind: "quest", key: "quest_profiel", sourceKey: `quest:profiel:${p.id}`, meta: { stap: "profiel" } }).catch(() => 0);
  revalidatePath("/account/punten");
  return { ok: true, message: punten ? `Bewaard — +${punten} punten ✓` : "Bewaard ✓" };
}

export async function bewaarHoeGevonden(formData) {
  const p = await lid();
  if (!p) return { error: "Log in om te bewaren." };
  const bron = String(formData.get("bron") || "");
  if (!BRON_OPTIES.includes(bron)) return { error: "Kies een antwoord." };
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update({ hoe_gevonden: bron }).eq("id", p.id);
  if (error) return { error: "Bewaren lukte niet." };
  // De queststap telt pas na de eerste sessie — dan weet iemand pas echt hoe hij bij ons belandde.
  const { count } = await admin.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", p.id).eq("status", "bevestigd").lte("ends_at", new Date().toISOString());
  const punten = count ? await geefNu(admin, { gymId: p.gym_id, userId: p.id, kind: "quest", key: "quest_bron", sourceKey: `quest:bron:${p.id}`, meta: { stap: "bron" } }).catch(() => 0) : 0;
  revalidatePath("/account/punten");
  return { ok: true, message: punten ? `Bedankt — +${punten} punten ✓` : "Bedankt ✓" };
}
