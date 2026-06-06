"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";

const num = (v, d = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};

// Create a discount code / promotion (e.g. WELKOM20 = 20% off a session).
export async function createDiscount(formData) {
  const { supabase, profile, error } = await requireStaff();
  if (error) return { error };
  const code = String(formData.get("code") || "").trim().toUpperCase().replace(/\s+/g, "");
  const percent = num(formData.get("percent"), 0);
  if (!code) return { error: "Geef een code." };
  if (percent < 1 || percent > 100) return { error: "Korting moet tussen 1 en 100% zijn." };
  const expires = formData.get("expires_at");
  const { error: e } = await supabase.from("discount_codes").insert({
    gym_id: profile.gym_id,
    code,
    percent,
    max_uses: num(formData.get("max_uses")) || null,
    per_user_once: formData.get("per_user_once") === "on",
    expires_at: expires ? new Date(expires).toISOString() : null,
    active: true,
  });
  if (e) return { error: /duplicate|unique/i.test(e.message) ? "Die code bestaat al." : e.message };
  revalidatePath("/beheer/diensten");
  return { ok: true, message: `Code ${code} aangemaakt ✓` };
}

export async function toggleDiscount(formData) {
  const { supabase, profile, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("discount_codes").update({ active: formData.get("active") !== "true" }).eq("id", formData.get("id")).eq("gym_id", profile.gym_id);
  revalidatePath("/beheer/diensten");
}

export async function deleteDiscount(formData) {
  const { supabase, profile, error } = await requireStaff();
  if (error) return { error };
  await supabase.from("discount_codes").delete().eq("id", formData.get("id")).eq("gym_id", profile.gym_id);
  revalidatePath("/beheer/diensten");
}
