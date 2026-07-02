"use server";
import { revalidatePath } from "next/cache";
import { requireStaff } from "@/lib/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { setGymSecrets } from "@/lib/gym-secrets";

// Save the non-profit's legal/billing details used on generated invoices (beheerder only).
export async function saveInvoiceSettings(formData) {
  const { supabase, profile, error } = await requireStaff(true);
  if (error) return { error };
  const { error: e } = await supabase
    .from("gyms")
    .update({
      legal_name: formData.get("legal_name") || null,
      vat_number: formData.get("vat_number") || null,
      invoice_email: formData.get("invoice_email") || null,
      invoice_footer: formData.get("invoice_footer") || null,
    })
    .eq("id", profile.gym_id);
  if (e) return { error: e.message };
  // IBAN is a SECRET (VZW bank account) → gym_integrations, not the world-readable gyms row.
  try { await setGymSecrets(createAdminClient(), profile.gym_id, { iban: formData.get("iban") || null }); }
  catch (err) { return { error: err.message }; }
  revalidatePath("/beheer/betalingen");
  return { ok: true };
}
